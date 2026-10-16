import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { PaymentListDto } from "./dto/payment.dto";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { ReservationExpiryService } from "./reservation-expiry.service";

@Injectable()
export class PlatformPaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly reconciliation: PaymentReconciliationService, private readonly expiry: ReservationExpiryService) {}
  private output<T extends { amount: Prisma.Decimal; providerAmount: Prisma.Decimal | null }>(payment: T) { return { ...payment, amount: payment.amount.toFixed(2), providerAmount: payment.providerAmount?.toFixed(0) ?? null, customerEmail: undefined, accessCode: undefined, authorizationUrl: undefined }; }
  async list(userId: string, query: PaymentListDto) {
    await this.rbac.requirePlatform(userId, "platform.payments.read");
    const where = { status: query.status, orderId: query.orderId, provider: query.provider, providerReference: query.providerReference };
    const [total, data] = await this.prisma.$transaction([this.prisma.payment.count({ where }), this.prisma.payment.findMany({ where, include: { order: { select: { orderNumber: true, status: true, paymentStatus: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit })]);
    return { data: data.map((payment) => this.output(payment)), page: query.page, limit: query.limit, total };
  }
  async get(userId: string, paymentId: string) {
    await this.rbac.requirePlatform(userId, "platform.payments.read");
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { orderNumber: true, status: true, paymentStatus: true } }, events: { orderBy: { receivedAt: "asc" }, select: { id: true, eventType: true, providerReference: true, providerStatus: true, providerCode: true, receivedAt: true, processedAt: true, processingResult: true } } } });
    if (!payment) throw new NotFoundException("Payment not found");
    return this.output(payment);
  }
  async reconcile(userId: string, paymentId: string) { await this.rbac.requirePlatform(userId, "platform.payments.reconcile"); return this.reconciliation.reconcile(paymentId, userId); }
  async reconcileBatch(userId: string, limit?: number) { await this.rbac.requirePlatform(userId, "platform.payments.reconcile"); return this.reconciliation.reconcileBatch(limit ?? 20); }
  async expire(userId: string, limit?: number) { await this.rbac.requirePlatform(userId, "platform.payments.reconcile"); return this.expiry.expireBatch(new Date(), limit); }
}
