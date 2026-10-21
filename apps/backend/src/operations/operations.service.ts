import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OperationalOutboxStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type OutboxInput = { eventType: string; aggregateType: string; aggregateId: string; dedupeKey: string; payload: Prisma.InputJsonValue; organizationId?: string; userId?: string };
@Injectable()
export class OperationalOutboxService {
  constructor(private readonly prisma: PrismaService) {}
  async enqueue(tx: Prisma.TransactionClient, input: OutboxInput) {
    // INV-OUT-02: Prisma upsert(update: {}) can degrade into a non-atomic
    // read-then-create when concurrent transactions race for one dedupe key.
    // Native PostgreSQL conflict handling preserves one durable intent without
    // creating a duplicate or rewriting the first authoritative payload.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "OperationalOutboxEvent"
        ("id", "eventType", "aggregateType", "aggregateId", "dedupeKey", "payload", "organizationId", "userId", "updatedAt")
      VALUES (
        ${randomUUID()}::uuid, ${input.eventType}, ${input.aggregateType}, ${input.aggregateId},
        ${input.dedupeKey}, ${JSON.stringify(input.payload)}::jsonb,
        ${input.organizationId ?? null}::uuid, ${input.userId ?? null}::uuid, NOW()
      )
      ON CONFLICT ("dedupeKey") DO NOTHING
    `);
    return tx.operationalOutboxEvent.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
  }
  /** Active organization members having any one of the requested permissions. */
  async supplierRecipientIds(tx: Prisma.TransactionClient, supplierId: string, permissions: string[]) {
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { organizationId: true } });
    if (!supplier) return [];
    const memberships = await tx.organizationMembership.findMany({
      where: { organizationId: supplier.organizationId, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: { in: permissions } } } } } } } },
      select: { userId: true },
    });
    return memberships.map((membership) => membership.userId);
  }
  async list(status?: OperationalOutboxStatus, eventType?: string, aggregateType?: string, page = 1, limit = 50) {
    const where = { ...(status ? { status } : {}), ...(eventType ? { eventType } : {}), ...(aggregateType ? { aggregateType } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.operationalOutboxEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, select: { id: true, eventType: true, aggregateType: true, aggregateId: true, organizationId: true, userId: true, status: true, availableAt: true, attemptCount: true, claimedAt: true, processedAt: true, lastErrorCode: true, createdAt: true } }), this.prisma.operationalOutboxEvent.count({ where })]);
    return { items, total, page, limit };
  }

  async summary() {
    const activeSupport = { status: { not: "CLOSED" as const } };
    const overdue = { ...activeSupport, resolutionDueAt: { lt: new Date() } };
    const [suppliersPendingReview, supportOpen, supportUnassigned, supportOverdue, supportUrgent, paymentReview, paymentUnknown, awaitingDeliveryQuote, readyForPickup, outForDelivery, refundsPendingReview, refundsProviderUnknown, returnsPendingReview, warrantiesPendingReview, settlementsDraft, settlementsApproved, outboxPending, outboxFailed] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where: { status: "PENDING_REVIEW" } }),
      this.prisma.supportTicket.count({ where: { status: "OPEN" } }),
      this.prisma.supportTicket.count({ where: { ...activeSupport, assignedToUserId: null } }),
      this.prisma.supportTicket.count({ where: overdue }),
      this.prisma.supportTicket.count({ where: { ...activeSupport, priority: "URGENT" } }),
      this.prisma.order.count({ where: { status: "PAYMENT_REVIEW" } }),
      this.prisma.payment.count({ where: { status: "UNKNOWN" } }),
      this.prisma.order.count({ where: { status: "AWAITING_DELIVERY_QUOTE" } }),
      this.prisma.order.count({ where: { status: "READY_FOR_PICKUP" } }),
      this.prisma.order.count({ where: { status: "OUT_FOR_DELIVERY" } }),
      this.prisma.refundRequest.count({ where: { status: { in: ["REQUESTED", "UNDER_REVIEW"] } } }),
      this.prisma.refund.count({ where: { status: "UNKNOWN" } }),
      this.prisma.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "AWAITING_ITEM", "ITEM_RECEIVED", "INSPECTING"] } } }),
      this.prisma.warrantyClaim.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      this.prisma.supplierSettlement.count({ where: { status: "DRAFT" } }),
      this.prisma.supplierSettlement.count({ where: { status: "APPROVED" } }),
      this.prisma.operationalOutboxEvent.count({ where: { status: "PENDING" } }),
      this.prisma.operationalOutboxEvent.count({ where: { status: "FAILED" } }),
    ]);
    return { suppliers: { pendingReview: suppliersPendingReview }, support: { open: supportOpen, unassigned: supportUnassigned, overdue: supportOverdue, urgent: supportUrgent }, payments: { paymentReview, unknown: paymentUnknown }, orders: { awaitingDeliveryQuote, readyForPickup, outForDelivery }, refunds: { pendingReview: refundsPendingReview, providerUnknown: refundsProviderUnknown }, returns: { pendingReview: returnsPendingReview }, warranties: { pendingReview: warrantiesPendingReview }, settlements: { draft: settlementsDraft, approved: settlementsApproved }, outbox: { pending: outboxPending, failed: outboxFailed } };
  }

  async queue(kind: "payment-review" | "delivery-quotes" | "refunds" | "returns" | "warranties" | "settlements" | "support-overdue" | "outbox-failures", page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const age = (createdAt: Date) => Math.max(0, Date.now() - createdAt.getTime());
    if (kind === "payment-review") { const where = { status: "PAYMENT_REVIEW" as const }; const [rows, total] = await this.prisma.$transaction([this.prisma.order.findMany({ where, select: { id: true, orderNumber: true, status: true, currencyCode: true, total: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, skip, take: limit }), this.prisma.order.count({ where })]); return { items: rows.map(r => ({ ...r, total: r.total.toFixed(2), ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "delivery-quotes") { const where = { status: "AWAITING_DELIVERY_QUOTE" as const }; const [rows, total] = await this.prisma.$transaction([this.prisma.order.findMany({ where, select: { id: true, orderNumber: true, status: true, currencyCode: true, total: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, skip, take: limit }), this.prisma.order.count({ where })]); return { items: rows.map(r => ({ ...r, total: r.total.toFixed(2), ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "refunds") { const where = { status: { in: ["REQUESTED" as const, "UNDER_REVIEW" as const] } }; const [items, total] = await this.prisma.$transaction([this.prisma.refundRequest.findMany({ where, select: { id: true, status: true, orderId: true, requestedAmount: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, skip, take: limit }), this.prisma.refundRequest.count({ where })]); return { items: items.map(r => ({ ...r, requestedAmount: r.requestedAmount?.toFixed(2) ?? null, ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "returns") { const where = { status: { in: ["REQUESTED" as const, "APPROVED" as const, "AWAITING_ITEM" as const, "ITEM_RECEIVED" as const, "INSPECTING" as const] } }; const [items, total] = await this.prisma.$transaction([this.prisma.returnRequest.findMany({ where, select: { id: true, status: true, orderId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, skip, take: limit }), this.prisma.returnRequest.count({ where })]); return { items: items.map(r => ({ ...r, ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "warranties") { const where = { status: { in: ["SUBMITTED" as const, "UNDER_REVIEW" as const] } }; const [items, total] = await this.prisma.$transaction([this.prisma.warrantyClaim.findMany({ where, select: { id: true, status: true, orderItemId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, skip, take: limit }), this.prisma.warrantyClaim.count({ where })]); return { items: items.map(r => ({ ...r, ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "settlements") { const where = { status: { in: ["DRAFT" as const, "APPROVED" as const] } }; const [items, total] = await this.prisma.$transaction([this.prisma.supplierSettlement.findMany({ where, select: { id: true, supplierId: true, status: true, currencyCode: true, netAmount: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" }, skip, take: limit }), this.prisma.supplierSettlement.count({ where })]); return { items: items.map(r => ({ ...r, netAmount: r.netAmount.toFixed(2), ageMs: age(r.createdAt) })), total, page, limit }; }
    if (kind === "support-overdue") { const where = { status: { not: "CLOSED" as const }, resolutionDueAt: { lt: new Date() } }; const [items, total] = await this.prisma.$transaction([this.prisma.supportTicket.findMany({ where, select: { id: true, ticketNumber: true, status: true, priority: true, assignedToUserId: true, resolutionDueAt: true, createdAt: true, updatedAt: true }, orderBy: { resolutionDueAt: "asc" }, skip, take: limit }), this.prisma.supportTicket.count({ where })]); return { items: items.map(r => ({ ...r, ageMs: age(r.createdAt) })), total, page, limit }; }
    const where = { status: "FAILED" as const }; const [items, total] = await this.prisma.$transaction([this.prisma.operationalOutboxEvent.findMany({ where, select: { id: true, eventType: true, aggregateType: true, aggregateId: true, status: true, attemptCount: true, lastErrorCode: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, skip, take: limit }), this.prisma.operationalOutboxEvent.count({ where })]); return { items: items.map(r => ({ ...r, ageMs: age(r.createdAt) })), total, page, limit };
  }
}
