import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderPaymentStatus, OrderRefundStatus, OrderStatus, PaymentStatus, Prisma, RefundRequestStatus, RefundStatus, SupplierLedgerEntryType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CustomerService } from "../customer/customer.service";
import { PaystackClient } from "../payments/paystack/paystack.client";
import { toPaystackMinorUnits } from "../payments/paystack/paystack-money";
import { PaystackProviderError, PaystackRefundEvidence } from "../payments/paystack/paystack.types";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CreateRefundRequestDto, ReviewRefundRequestDto } from "./dto/refund.dto";
import { OperationalOutboxService } from "../operations/operations.service";
import { AuditService } from "../audit/audit.service";

const unavailable = [RefundRequestStatus.REJECTED, RefundRequestStatus.CANCELLED, RefundRequestStatus.FAILED];

@Injectable()
export class RefundsService {
  constructor(private readonly prisma: PrismaService, private readonly customer: CustomerService, private readonly rbac: RbacService, private readonly paystack: PaystackClient, private readonly outbox: OperationalOutboxService, private readonly audit: AuditService) {}

  private output<T extends { requestedAmount: Prisma.Decimal | null; approvedAmount: Prisma.Decimal | null; items?: Array<{ calculatedAmount: Prisma.Decimal }>; refund?: { amount: Prisma.Decimal } | null }>(row: T) {
    return { ...row, requestedAmount: row.requestedAmount?.toFixed(2) ?? null, approvedAmount: row.approvedAmount?.toFixed(2) ?? null, items: row.items?.map((item) => ({ ...item, calculatedAmount: item.calculatedAmount.toFixed(2) })), refund: row.refund ? { ...row.refund, amount: row.refund.amount.toFixed(2) } : row.refund };
  }

  private async createForProfile(customerProfileId: string, orderId: string, dto: CreateRefundRequestDto) {
    if (new Set(dto.items.map((item) => item.orderItemId)).size !== dto.items.length) throw new BadRequestException("Each order item may appear only once");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`);
          const order = await tx.order.findFirst({ where: { id: orderId, customerProfileId }, include: { items: { where: { id: { in: dto.items.map((item) => item.orderItemId) } } } } });
          if (!order) throw new NotFoundException("Order not found");
          if (order.paymentStatus !== OrderPaymentStatus.PAID || order.status === OrderStatus.PAYMENT_REVIEW || order.status !== OrderStatus.DELIVERED) throw new ConflictException("Only paid, completed orders are refundable");
          if (order.items.length !== dto.items.length) throw new BadRequestException("Refund item does not belong to order");
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OrderItem" WHERE "id" IN (${Prisma.join(dto.items.map((item) => Prisma.sql`${item.orderItemId}::uuid`))}) ORDER BY "id" FOR UPDATE`);
          const allocated = await tx.refundRequestItem.groupBy({ by: ["orderItemId"], where: { orderItemId: { in: dto.items.map((item) => item.orderItemId) }, refundRequest: { status: { notIn: unavailable } } }, _sum: { quantity: true } });
          const used = new Map(allocated.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
          const byId = new Map(order.items.map((item) => [item.id, item]));
          let amount = new Prisma.Decimal(0);
          const rows = dto.items.map((requested) => {
            const item = byId.get(requested.orderItemId)!;
            if (requested.quantity > item.quantity - (used.get(item.id) ?? 0)) throw new ConflictException("Refund quantity exceeds remaining refundable quantity");
            const calculatedAmount = item.unitPrice.mul(requested.quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            amount = amount.plus(calculatedAmount);
            return { orderItemId: item.id, quantity: requested.quantity, calculatedAmount };
          });
          if (!amount.gt(0)) throw new ConflictException("Refund amount must be positive");
          const request = await tx.refundRequest.create({ data: { orderId, customerProfileId, reasonCode: dto.reasonCode, reasonText: dto.reasonText, requestedAmount: amount, items: { create: rows } }, include: { items: true, refund: true } });
          return this.output(request);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
      } catch (error) {
        if ((error as { code?: string }).code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException("Refund request could not be serialized");
  }

  async create(userId: string, orderId: string, dto: CreateRefundRequestDto) { const profile = await this.customer.ensureCustomerProfile(userId); return this.createForProfile(profile.id, orderId, dto); }
  async createFromResolutionItems(customerProfileId: string, orderId: string, items: Array<{ orderItemId: string; quantity: number }>, source: string) { return this.createForProfile(customerProfileId, orderId, { reasonCode: source, reasonText: `Created from ${source.toLowerCase()} resolution`, items }); }
  async createFromResolution(customerProfileId: string, orderId: string, orderItemId: string, quantity: number, source: string) { return this.createForProfile(customerProfileId, orderId, { reasonCode: source, reasonText: `Created from ${source.toLowerCase()} resolution`, items: [{ orderItemId, quantity }] }); }
  async customerList(userId: string, orderId: string) { const profile = await this.customer.ensureCustomerProfile(userId); if (!await this.prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id } })) throw new NotFoundException("Order not found"); return (await this.prisma.refundRequest.findMany({ where: { orderId, customerProfileId: profile.id }, include: { items: true, refund: true }, orderBy: { createdAt: "desc" } })).map((row) => this.output(row)); }
  async platformList(userId: string) { await this.rbac.requirePlatform(userId, "platform.refunds.read"); return (await this.prisma.refundRequest.findMany({ include: { items: true, refund: true }, orderBy: { createdAt: "desc" }, take: 100 })).map((row) => this.output(row)); }
  async platformDetail(userId: string, id: string) { await this.rbac.requirePlatform(userId, "platform.refunds.read"); const row = await this.prisma.refundRequest.findUnique({ where: { id }, include: { items: { include: { orderItem: true } }, refund: { include: { events: { orderBy: { observedAt: "asc" } } } }, order: true } }); if (!row) throw new NotFoundException("Refund request not found"); return this.output(row); }

  async approve(userId: string, id: string) {
    await this.rbac.requirePlatform(userId, "platform.refunds.review");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RefundRequest" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const request = await tx.refundRequest.findUnique({ where: { id }, include: { order: { include: { payments: { where: { status: PaymentStatus.SUCCEEDED }, orderBy: { succeededAt: "asc" }, take: 1 } } }, items: true, refund: true } });
      if (!request) throw new NotFoundException("Refund request not found");
      if (request.status === RefundRequestStatus.APPROVED || request.status === RefundRequestStatus.REFUND_PENDING || request.status === RefundRequestStatus.REFUNDED) return this.output(request);
      if (request.status !== RefundRequestStatus.REQUESTED && request.status !== RefundRequestStatus.UNDER_REVIEW) throw new ConflictException("Refund request is not reviewable");
      const payment = request.order.payments[0];
      if (!payment || request.order.paymentStatus !== OrderPaymentStatus.PAID || request.order.status === OrderStatus.PAYMENT_REVIEW) throw new ConflictException("Order has no eligible successful payment");
      const approvedAmount = request.items.reduce((sum, item) => sum.plus(item.calculatedAmount), new Prisma.Decimal(0));
      const committed = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: [RefundStatus.CREATED, RefundStatus.PENDING, RefundStatus.UNKNOWN, RefundStatus.REFUNDED] }, refundRequestId: { not: id } }, _sum: { amount: true } });
      if (approvedAmount.plus(committed._sum.amount ?? 0).gt(payment.amount)) throw new ConflictException("Cumulative refunds exceed paid amount");
      const refund = request.refund ?? await tx.refund.create({ data: { refundRequestId: id, paymentId: payment.id, providerReference: `RF-${randomUUID()}`, amount: approvedAmount, currencyCode: payment.currencyCode } });
      const updated = await tx.refundRequest.update({ where: { id }, data: { status: RefundRequestStatus.APPROVED, approvedAmount, reviewedAt: new Date(), reviewedByUserId: userId }, include: { items: true } });
      const recipientUserId = request.order.customerProfileId ? (await tx.customerProfile.findUnique({ where: { id: request.order.customerProfileId }, select: { userId: true } }))?.userId : undefined;
      if (recipientUserId) await this.outbox.enqueue(tx, { eventType: "REFUND_APPROVED", aggregateType: "RefundRequest", aggregateId: id, dedupeKey: `refund-request:${id}:approved`, userId: recipientUserId, payload: { recipientUserId, type: "REFUND_APPROVED", category: "REFUND", title: "Refund approved", body: `Your refund request for order ${request.order.orderNumber} was approved.`, entityType: "REFUND_REQUEST", entityId: id, dedupeKey: `notification:refund-request:${id}:approved` } });
      await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "REFUND_APPROVED", entityType: "REFUND_REQUEST", entityId: id, dedupeKey: `refund-request:${id}:approved:audit`, metadata: { refundId: refund.id } });
      return this.output({ ...updated, refund });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }

  async reject(userId: string, id: string, dto: ReviewRefundRequestDto) { await this.rbac.requirePlatform(userId, "platform.refunds.review"); const changed = await this.prisma.refundRequest.updateMany({ where: { id, status: { in: [RefundRequestStatus.REQUESTED, RefundRequestStatus.UNDER_REVIEW] } }, data: { status: RefundRequestStatus.REJECTED, reviewedAt: new Date(), reviewedByUserId: userId, reasonText: dto.reason } }); if (!changed.count) throw new ConflictException("Refund request is not reviewable"); return { id, status: RefundRequestStatus.REJECTED }; }

  private mapped(status: string): RefundStatus { const normalized = status.toLowerCase(); if (["processed", "success", "successful"].includes(normalized)) return RefundStatus.REFUNDED; if (["failed", "cancelled", "reversed"].includes(normalized)) return RefundStatus.FAILED; return RefundStatus.PENDING; }
  private evidenceData(evidence: PaystackRefundEvidence): Prisma.InputJsonValue { return { providerRefundId: evidence.providerRefundId, providerStatus: evidence.providerStatus, transactionReference: evidence.transactionReference ?? null, merchantNote: evidence.merchantNote ?? null, refundedAt: evidence.refundedAt?.toISOString() ?? null }; }

  private async applyEvidence(refundId: string, evidence: PaystackRefundEvidence, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Refund" WHERE "id" = ${refundId}::uuid FOR UPDATE`);
      const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true, refundRequest: { include: { items: { include: { orderItem: { include: { commissionRecord: true } } } }, order: { include: { items: true } } } } } });
      if (!refund) throw new NotFoundException("Refund not found");
      if (evidence.amountMinor !== toPaystackMinorUnits(refund.amount, refund.currencyCode) || evidence.currency !== refund.currencyCode || (evidence.transactionReference && evidence.transactionReference !== refund.payment.providerReference)) throw new ConflictException("Provider refund evidence does not match refund binding");
      const status = this.mapped(evidence.providerStatus);
      await tx.refundEvent.create({ data: { refundId, providerStatus: evidence.providerStatus, providerRefundId: evidence.providerRefundId, amountMinor: new Prisma.Decimal(evidence.amountMinor), currencyCode: evidence.currency, evidence: this.evidenceData(evidence) } });
      if (refund.status === RefundStatus.REFUNDED) return { id: refund.id, status: refund.status, idempotent: true };
      await tx.refund.update({ where: { id: refund.id }, data: { providerRefundId: evidence.providerRefundId, status, succeededAt: status === RefundStatus.REFUNDED ? evidence.refundedAt ?? new Date() : null, failedAt: status === RefundStatus.FAILED ? new Date() : null } });
      await tx.refundRequest.update({ where: { id: refund.refundRequestId }, data: { status: status === RefundStatus.REFUNDED ? RefundRequestStatus.REFUNDED : status === RefundStatus.FAILED ? RefundRequestStatus.FAILED : RefundRequestStatus.REFUND_PENDING } });
      if (status === RefundStatus.REFUNDED) {
        for (const allocation of refund.refundRequest.items) {
          const commission = allocation.orderItem.commissionRecord;
          if (commission) {
            const supplierAmount = allocation.calculatedAmount.mul(new Prisma.Decimal(1).minus(commission.commissionRate)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            if (supplierAmount.gt(0)) await tx.supplierLedgerEntry.create({ data: { supplierId: commission.supplierId, currencyCode: commission.currencyCode, type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: supplierAmount.negated(), referenceType: "REFUND_ALLOCATION", referenceId: `${refund.id}:${allocation.id}`, description: `Refund adjustment for order item ${allocation.orderItemId}` } });
          }
        }
        const successful = await tx.refundRequestItem.groupBy({ by: ["orderItemId"], where: { refundRequest: { orderId: refund.refundRequest.orderId, status: RefundRequestStatus.REFUNDED } }, _sum: { quantity: true } });
        const quantities = new Map(successful.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
        const full = refund.refundRequest.order.items.every((item) => (quantities.get(item.id) ?? 0) >= item.quantity);
        const any = successful.some((row) => (row._sum.quantity ?? 0) > 0);
        await tx.order.update({ where: { id: refund.refundRequest.orderId }, data: { refundStatus: full ? OrderRefundStatus.FULL : any ? OrderRefundStatus.PARTIAL : OrderRefundStatus.NONE } });
      }
      const recipientUserId = (await tx.customerProfile.findUnique({ where: { id: refund.refundRequest.customerProfileId }, select: { userId: true } }))?.userId;
      if (recipientUserId && (status === RefundStatus.REFUNDED || status === RefundStatus.FAILED)) await this.outbox.enqueue(tx, { eventType: status === RefundStatus.REFUNDED ? "REFUND_COMPLETED" : "REFUND_FAILED", aggregateType: "Refund", aggregateId: refund.id, dedupeKey: `refund:${refund.id}:${status === RefundStatus.REFUNDED ? "completed" : "failed"}`, userId: recipientUserId, payload: { recipientUserId, type: status === RefundStatus.REFUNDED ? "REFUND_COMPLETED" : "REFUND_FAILED", category: "REFUND", title: status === RefundStatus.REFUNDED ? "Refund completed" : "Refund failed", body: status === RefundStatus.REFUNDED ? "Your refund was completed." : "Your refund could not be completed.", entityType: "REFUND", entityId: refund.id, dedupeKey: `notification:refund:${refund.id}:${status === RefundStatus.REFUNDED ? "completed" : "failed"}`, mandatory: status === RefundStatus.REFUNDED } });
      if (actorUserId) await this.audit.emitInTransaction(tx, { actorUserId, action: "REFUND_PROVIDER_RECONCILED", entityType: "REFUND", entityId: refund.id, dedupeKey: `refund:${refund.id}:provider:${status.toLowerCase()}`, metadata: { result: status, providerRefundId: evidence.providerRefundId } });
      return { id: refund.id, status, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }

  async execute(userId: string, refundId: string) {
    await this.rbac.requirePlatform(userId, "platform.refunds.execute");
    const prepared = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Refund" WHERE "id" = ${refundId}::uuid FOR UPDATE`);
      const row = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true, refundRequest: true } });
      if (!row) throw new NotFoundException("Refund not found");
      if (row.status !== RefundStatus.CREATED) return { row, call: false };
      if (row.refundRequest.status !== RefundRequestStatus.APPROVED || row.payment.status !== PaymentStatus.SUCCEEDED) throw new ConflictException("Refund is not executable");
      await tx.refund.update({ where: { id: row.id }, data: { status: RefundStatus.UNKNOWN, requestedAt: new Date() } });
      await tx.refundRequest.update({ where: { id: row.refundRequestId }, data: { status: RefundRequestStatus.REFUND_PENDING } });
      return { row, call: true };
    });
    if (!prepared.call) return { id: prepared.row.id, status: prepared.row.status, idempotent: true };
    try {
      const evidence = await this.paystack.createRefund({ transactionReference: prepared.row.payment.providerReference, amountMinor: toPaystackMinorUnits(prepared.row.amount, prepared.row.currencyCode), currency: prepared.row.currencyCode, internalReference: prepared.row.providerReference, customerNote: prepared.row.refundRequest.reasonText ?? undefined });
      return this.applyEvidence(refundId, evidence, userId);
    } catch (error) {
      const provider = error instanceof PaystackProviderError ? error : new PaystackProviderError("Refund submission failed", true, "UNKNOWN_ERROR");
      if (!provider.ambiguous) await this.prisma.$transaction(async tx => { await tx.refund.update({ where: { id: refundId }, data: { status: RefundStatus.FAILED, failedAt: new Date(), failureCode: provider.code, failureMessage: provider.message } }); await tx.refundRequest.update({ where: { id: prepared.row.refundRequestId }, data: { status: RefundRequestStatus.FAILED } }); const recipient = await tx.customerProfile.findUnique({ where: { id: prepared.row.refundRequest.customerProfileId }, select: { userId: true } }); if (recipient) await this.outbox.enqueue(tx, { eventType: "REFUND_FAILED", aggregateType: "Refund", aggregateId: refundId, dedupeKey: `refund:${refundId}:failed`, userId: recipient.userId, payload: { recipientUserId: recipient.userId, type: "REFUND_FAILED", category: "REFUND", title: "Refund failed", body: "Your refund could not be completed.", entityType: "REFUND", entityId: refundId, dedupeKey: `notification:refund:${refundId}:failed` } }); await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "REFUND_PROVIDER_RECONCILED", entityType: "REFUND", entityId: refundId, dedupeKey: `refund:${refundId}:provider:failed`, metadata: { result: "FAILED", failureCode: provider.code } }); });
      return { id: refundId, status: provider.ambiguous ? RefundStatus.UNKNOWN : RefundStatus.FAILED, failureCode: provider.code };
    }
  }

  async reconcile(userId: string, refundId: string) {
    await this.rbac.requirePlatform(userId, "platform.refunds.reconcile");
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status === RefundStatus.REFUNDED || refund.status === RefundStatus.FAILED) return { id: refund.id, status: refund.status, idempotent: true };
    try {
      const evidence = refund.providerRefundId ? await this.paystack.fetchRefund(refund.providerRefundId) : await this.paystack.findRefund(refund.payment.providerReference, refund.providerReference);
      if (!evidence) return { id: refund.id, status: RefundStatus.UNKNOWN, found: false };
      return this.applyEvidence(refund.id, evidence, userId);
    } catch (error) {
      const provider = error instanceof PaystackProviderError ? error : new PaystackProviderError("Refund reconciliation failed", true, "UNKNOWN_ERROR");
      return { id: refund.id, status: RefundStatus.UNKNOWN, failureCode: provider.code };
    }
  }
}
