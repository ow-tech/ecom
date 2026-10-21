import { ConflictException, Injectable } from "@nestjs/common";
import { OrderPaymentStatus, OrderStatus, PaymentEventProcessingResult, PaymentStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentBindingService } from "./payment-binding.service";
import { PaystackEvidence } from "./paystack/paystack.types";
import { OperationalOutboxService } from "../operations/operations.service";
import { AuditService } from "../audit/audit.service";

export type SettlementResult = "SETTLED" | "PAYMENT_REVIEW" | "ALREADY_SETTLED";

@Injectable()
export class PaymentSettlementService {
  constructor(private readonly prisma: PrismaService, private readonly binding: PaymentBindingService, private readonly inventory: InventoryService, private readonly outbox: OperationalOutboxService, private readonly audit: AuditService) {}

  async settleSucceededPayment(paymentId: string, evidence: PaystackEvidence, reconciliationActorUserId?: string): Promise<SettlementResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await this.settleOnce(paymentId, evidence, reconciliationActorUserId); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "P2034" || attempt === 2) throw error;
      }
    }
    throw new ConflictException("Payment settlement could not be serialized");
  }

  private async settleOnce(paymentId: string, evidence: PaystackEvidence, reconciliationActorUserId?: string): Promise<SettlementResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new ConflictException("Payment not found");
      const normalized = this.binding.validate(payment, evidence);
      if (normalized !== PaymentStatus.SUCCEEDED) throw new ConflictException("Provider evidence is not successful");

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${payment.orderId}::uuid FOR UPDATE`);
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { reservations: true, overseasReservations: true, customerProfile: { select: { userId: true } } } });
      if (payment.status === PaymentStatus.SUCCEEDED) {
        return order.status === OrderStatus.PAYMENT_REVIEW ? "PAYMENT_REVIEW" : "ALREADY_SETTLED";
      }
      const otherSuccess = await tx.payment.findFirst({ where: { orderId: order.id, status: PaymentStatus.SUCCEEDED, id: { not: payment.id } } });
      if (otherSuccess) throw new ConflictException("Another payment already succeeded for this order");

      const now = evidence.paidAt ?? new Date();
      const providerData = {
        status: PaymentStatus.SUCCEEDED,
        succeededAt: now,
        lastVerifiedAt: new Date(),
        providerAmount: new Prisma.Decimal(evidence.amountMinor),
        providerCurrency: evidence.currency,
        providerStatus: evidence.providerStatus,
        providerCode: evidence.providerCode,
        providerChannel: evidence.channel,
        gatewayResponse: evidence.gatewayResponse,
        failureCode: null,
        failureMessage: null,
      } as const;

      // Both physical and overseas allocations must be active before fulfillment can start.
      const reservationsActive = (order.reservations.length + order.overseasReservations.length) > 0
        && order.reservations.every((reservation) => reservation.status === "ACTIVE")
        && order.overseasReservations.every((reservation) => reservation.status === "ACTIVE");
      if (order.status !== OrderStatus.PENDING_PAYMENT || order.paymentStatus !== OrderPaymentStatus.UNPAID || !reservationsActive) {
        await tx.payment.update({ where: { id: payment.id }, data: providerData });
        if (order.status !== OrderStatus.PAYMENT_REVIEW || order.paymentStatus !== OrderPaymentStatus.PAID_REVIEW) {
          await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAYMENT_REVIEW, paymentStatus: OrderPaymentStatus.PAID_REVIEW } });
          await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: OrderStatus.PAYMENT_REVIEW, reason: "Authoritative payment succeeded after normal settlement became unsafe", publicMessage: "Payment received; order requires review" } });
          await this.outbox.enqueue(tx, { eventType: "PAYMENT_REVIEW", aggregateType: "Payment", aggregateId: payment.id, dedupeKey: `payment:${payment.id}:review`, userId: order.customerProfile.userId, payload: { recipientUserId: order.customerProfile.userId, type: "PAYMENT_REVIEW", category: "PAYMENT", title: "Payment requires review", body: `Payment for order ${order.orderNumber} was received and requires review.`, entityType: "ORDER", entityId: order.id, dedupeKey: `notification:payment:${payment.id}:review`, mandatory: true } });
          if (reconciliationActorUserId) await this.audit.emitInTransaction(tx, { actorUserId: reconciliationActorUserId, action: "PAYMENT_RECONCILED", entityType: "PAYMENT", entityId: payment.id, dedupeKey: `payment:${payment.id}:reconciled:payment-review`, metadata: { result: "PAYMENT_REVIEW" } });
        }
        return "PAYMENT_REVIEW";
      }

      await this.inventory.consumeOwned(tx, order.id, payment.id, now);
      await tx.payment.update({ where: { id: payment.id }, data: { ...providerData, settledAt: new Date() } });
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAYMENT_CONFIRMED, paymentStatus: OrderPaymentStatus.PAID } });
      const supplierOrders = await tx.supplierOrder.findMany({ where: { orderId: order.id, status: SupplierOrderStatus.PENDING_PAYMENT }, select: { id: true, supplierId: true, supplierOrderNumber: true } });
      await tx.supplierOrder.updateMany({ where: { id: { in: supplierOrders.map((row) => row.id) }, status: SupplierOrderStatus.PENDING_PAYMENT }, data: { status: SupplierOrderStatus.CONFIRMED } });
      await tx.supplierOrderStatusHistory.createMany({ data: supplierOrders.map((row) => ({ supplierOrderId: row.id, previousStatus: SupplierOrderStatus.PENDING_PAYMENT, newStatus: SupplierOrderStatus.CONFIRMED, publicMessage: "Payment confirmed; supplier order ready for fulfilment" })) });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: OrderStatus.PENDING_PAYMENT, newStatus: OrderStatus.PAYMENT_CONFIRMED, publicMessage: "Payment confirmed" } });
      await this.outbox.enqueue(tx, { eventType: "PAYMENT_CONFIRMED", aggregateType: "Payment", aggregateId: payment.id, dedupeKey: `payment:${payment.id}:confirmed`, userId: order.customerProfile.userId, payload: { recipientUserId: order.customerProfile.userId, type: "PAYMENT_CONFIRMED", category: "PAYMENT", title: "Payment confirmed", body: `Payment for order ${order.orderNumber} was confirmed.`, entityType: "ORDER", entityId: order.id, dedupeKey: `notification:payment:${payment.id}:confirmed`, mandatory: true } });
      for (const supplierOrder of supplierOrders) {
        const recipients = await this.outbox.supplierRecipientIds(tx, supplierOrder.supplierId, ["orders.read", "fulfilment.update"]);
        for (const recipientUserId of recipients) {
          const key = `supplier-order:${supplierOrder.id}:paid:user:${recipientUserId}`;
          await this.outbox.enqueue(tx, { eventType: "PAID_SUPPLIER_ORDER", aggregateType: "SupplierOrder", aggregateId: supplierOrder.id, dedupeKey: key, userId: recipientUserId, payload: { recipientUserId, type: "PAID_SUPPLIER_ORDER", category: "ORDER", title: "New paid supplier order", body: `Supplier order ${supplierOrder.supplierOrderNumber} is ready for fulfilment.`, entityType: "SUPPLIER_ORDER", entityId: supplierOrder.id, dedupeKey: `notification:${key}` } });
        }
      }
      if (reconciliationActorUserId) await this.audit.emitInTransaction(tx, { actorUserId: reconciliationActorUserId, action: "PAYMENT_RECONCILED", entityType: "PAYMENT", entityId: payment.id, dedupeKey: `payment:${payment.id}:reconciled:settled`, metadata: { result: "SETTLED" } });
      return "SETTLED";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }

  eventResult(result: SettlementResult): PaymentEventProcessingResult {
    return result === "PAYMENT_REVIEW" ? PaymentEventProcessingResult.PAYMENT_REVIEW : PaymentEventProcessingResult.SETTLED;
  }
}
