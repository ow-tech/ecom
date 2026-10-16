import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentBindingService } from "./payment-binding.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import { PaystackClient } from "./paystack/paystack.client";
import { PaystackProviderError } from "./paystack/paystack.types";
import { AuditService } from "../audit/audit.service";

export type CustomerPaymentFailureKind = "CONFIGURATION_REJECTED" | "PROVIDER_REJECTED" | "INITIALIZATION_FAILED" | "PROVIDER_FAILED" | "NETWORK_UNCERTAIN" | "PROVIDER_RESPONSE_UNCERTAIN";

export function customerPaymentFailureKind(payment: { status: PaymentStatus; initializedAt: Date | null; failureCode?: string | null }): CustomerPaymentFailureKind | null {
  if (payment.status === PaymentStatus.FAILED) {
    if (payment.failureCode === "HTTP_401" || payment.failureCode === "HTTP_403") return "CONFIGURATION_REJECTED";
    if (payment.failureCode?.startsWith("HTTP_")) return "PROVIDER_REJECTED";
    return payment.initializedAt ? "PROVIDER_FAILED" : "INITIALIZATION_FAILED";
  }
  if (payment.status === PaymentStatus.UNKNOWN && (payment.failureCode === "NETWORK_ERROR" || payment.failureCode === "TIMEOUT")) return "NETWORK_UNCERTAIN";
  if (payment.status === PaymentStatus.UNKNOWN && payment.failureCode) return "PROVIDER_RESPONSE_UNCERTAIN";
  return null;
}

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(private readonly prisma: PrismaService, private readonly paystack: PaystackClient, private readonly binding: PaymentBindingService, private readonly settlement: PaymentSettlementService, private readonly audit: AuditService) {}

  // INV-PAY-RECON-01: Verify is an external read. Re-check under row lock
  // before any write to prevent stale evidence from downgrading webhook success.
  private async lockIfUnresolved(tx: Prisma.TransactionClient, paymentId: string): Promise<boolean> {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE`);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { status: true } });
    return current.status !== PaymentStatus.SUCCEEDED && current.status !== PaymentStatus.FAILED && current.status !== PaymentStatus.CANCELLED;
  }

  async reconcile(paymentId: string, reconciliationActorUserId?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.CANCELLED) return this.safe(payment);
    try {
      const evidence = await this.paystack.verify(payment.providerReference);
      const status = this.binding.validate(payment, evidence);
      if (status === PaymentStatus.SUCCEEDED) {
        await this.settlement.settleSucceededPayment(payment.id, evidence, reconciliationActorUserId);
      } else {
        const now = new Date();
        await this.prisma.$transaction(async tx => {
          if (!await this.lockIfUnresolved(tx, payment.id)) return;
          await tx.payment.update({ where: { id: payment.id }, data: { status, lastVerifiedAt: now, providerAmount: new Prisma.Decimal(evidence.amountMinor), providerCurrency: evidence.currency, providerStatus: evidence.providerStatus, providerCode: evidence.providerCode, providerChannel: evidence.channel, gatewayResponse: evidence.gatewayResponse, failedAt: status === PaymentStatus.FAILED ? now : undefined, cancelledAt: status === PaymentStatus.CANCELLED ? now : undefined } });
          if (reconciliationActorUserId) await this.audit.emitInTransaction(tx, { actorUserId: reconciliationActorUserId, action: "PAYMENT_RECONCILED", entityType: "PAYMENT", entityId: payment.id, dedupeKey: `payment:${payment.id}:reconciled:${status.toLowerCase()}`, metadata: { result: status } });
        });
      }
    } catch (error) {
      if (error instanceof PaystackProviderError) {
        this.logger.warn({ event: "paystack_verification_failed", orderId: payment.orderId, paymentId: payment.id, providerErrorCode: error.code });
        const now = new Date();
        await this.prisma.$transaction(async tx => {
          if (!await this.lockIfUnresolved(tx, payment.id)) return;
          await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.UNKNOWN, lastVerifiedAt: now, failureCode: error.code, failureMessage: error.message } });
          if (reconciliationActorUserId) await this.audit.emitInTransaction(tx, { actorUserId: reconciliationActorUserId, action: "PAYMENT_RECONCILED", entityType: "PAYMENT", entityId: payment.id, dedupeKey: `payment:${payment.id}:reconciled:unknown`, metadata: { result: "UNKNOWN", failureCode: error.code } });
        });
      } else {
        this.logger.error({ event: "payment_verification_failed", orderId: payment.orderId, paymentId: payment.id, providerErrorCode: "UNKNOWN_ERROR" });
        throw error;
      }
    }
    return this.safe(await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }));
  }

  async reconcileBatch(limit: number) {
    const candidates = await this.prisma.payment.findMany({ where: { status: { in: [PaymentStatus.INITIALIZATION_PENDING, PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } }, orderBy: { updatedAt: "asc" }, take: limit, select: { id: true } });
    const results = [];
    for (const candidate of candidates) {
      try { results.push({ paymentId: candidate.id, result: await this.reconcile(candidate.id) }); }
      catch (error) { results.push({ paymentId: candidate.id, error: error instanceof Error ? error.message : "Unknown error" }); }
    }
    return { processed: results.length, results };
  }

  safe<T extends { id: string; orderId: string; provider: unknown; providerReference: string; status: PaymentStatus; authorizationUrl: string | null; accessCode: string | null; initializedAt: Date | null; succeededAt: Date | null; lastVerifiedAt: Date | null; createdAt: Date; failureCode?: string | null }>(payment: T) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      reference: payment.providerReference,
      status: payment.status,
      initializedAt: payment.initializedAt,
      succeededAt: payment.succeededAt,
      lastVerifiedAt: payment.lastVerifiedAt,
      createdAt: payment.createdAt,
      canResume: (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.UNKNOWN) && Boolean(payment.authorizationUrl || payment.accessCode),
      canRetry: payment.status === PaymentStatus.FAILED,
      failureKind: customerPaymentFailureKind(payment),
    };
  }
}
