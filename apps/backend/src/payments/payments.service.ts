import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OrderPaymentStatus, OrderStatus, PaymentEventProcessingResult, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { commerceConflict } from "../commerce/commerce-error";
import { CustomerService } from "../customer/customer.service";
import { PrismaService } from "../prisma/prisma.service";
import { customerPaymentFailureKind, PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import { PaystackClient } from "./paystack/paystack.client";
import { normalizePaystackEvidence } from "./paystack/paystack-mapper";
import { toPaystackMinorUnits } from "./paystack/paystack-money";
import { PaystackProviderError, PaystackWebhook } from "./paystack/paystack.types";
import { ConfigService } from "@nestjs/config";
import { CheckoutPaymentMethod } from "./dto/payment.dto";

function reference() { return `EC_${randomUUID().replaceAll("-", "")}`; }

function sanitized(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map(sanitized);
  if (value && typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (["authorization", "authorization_code", "card", "bin", "last4", "signature"].includes(key.toLowerCase())) continue;
      output[key] = sanitized(child);
    }
    return output;
  }
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  return String(value);
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService, private readonly customer: CustomerService, private readonly paystack: PaystackClient, private readonly reconciliation: PaymentReconciliationService, private readonly settlement: PaymentSettlementService, private readonly config: ConfigService) {}

  private callbackUrl(orderId: string, paymentId: string) {
    const base = this.config.get<string | undefined>("PAYSTACK_CALLBACK_BASE_URL");
    if (!base) return undefined;
    const url = new URL(`/checkout/payment/${encodeURIComponent(orderId)}`, base);
    url.searchParams.set("paymentId", paymentId);
    return url.toString();
  }

  private response(payment: { id: string; provider: PaymentProvider; providerReference: string; authorizationUrl: string | null; accessCode: string | null; status: PaymentStatus; initializedAt: Date | null; failureCode?: string | null; requestedChannel?: string | null }) {
    return { paymentId: payment.id, provider: payment.provider, reference: payment.providerReference, authorizationUrl: payment.authorizationUrl, accessCode: payment.accessCode, status: payment.status, requestedChannel: payment.requestedChannel ?? null, failureKind: customerPaymentFailureKind(payment) };
  }

  async initialize(userId: string, orderId: string, idempotencyKey: string | undefined, method: CheckoutPaymentMethod) {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) throw new BadRequestException("A valid Idempotency-Key header is required");
    const profile = await this.customer.ensureCustomerProfile(userId);
    const requestedChannel = method === CheckoutPaymentMethod.MPESA ? "mobile_money" : "card";
    const locked = await this.prisma.$transaction(async tx => {
      // The parent row lock makes the unresolved-attempt decision atomic across tabs.
      const orders = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!orders.length) throw new NotFoundException("Order not found");
      const order = await tx.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, include: { customerProfile: { include: { user: true } } } });
      if (!order) throw new NotFoundException("Order not found");
      const repeated = await tx.payment.findUnique({ where: { orderId_idempotencyKey: { orderId, idempotencyKey: key } } });
      if (repeated) {
        if (repeated.requestedChannel && repeated.requestedChannel !== requestedChannel) throw commerceConflict("PAYMENT_METHOD_MISMATCH", "This Idempotency-Key is already bound to a different payment method");
        return { payment: repeated, created: false };
      }
      if (order.status !== OrderStatus.PENDING_PAYMENT || order.paymentStatus !== OrderPaymentStatus.UNPAID) throw commerceConflict("ORDER_NOT_PAYABLE", "Order is not payable");
      if (method === CheckoutPaymentMethod.MPESA && (order.currencyCode !== "KES" || !this.config.get<boolean>("PAYSTACK_MPESA_ENABLED", false))) throw commerceConflict("PAYMENT_METHOD_UNAVAILABLE", "M-Pesa is not available for this order");
      const unresolved = await tx.payment.findFirst({ where: { orderId, status: { in: [PaymentStatus.INITIALIZATION_PENDING, PaymentStatus.PENDING, PaymentStatus.UNKNOWN] } }, orderBy: { createdAt: "desc" } });
      if (unresolved) throw new ConflictException("An unresolved payment already exists for this order. Resume or check that payment instead.");
      return { payment: await tx.payment.create({ data: { orderId, provider: PaymentProvider.PAYSTACK, providerReference: reference(), idempotencyKey: key, currencyCode: order.currencyCode, amount: order.total, customerEmail: order.customerProfile.user.emailNormalized, requestedChannel } }), created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let payment = locked.payment;
    if (!locked.created) return this.response(payment);

    try {
      const initialized = await this.paystack.initialize({ reference: payment.providerReference, amountMinor: toPaystackMinorUnits(payment.amount, payment.currencyCode), currency: payment.currencyCode, email: payment.customerEmail, orderId, channel: requestedChannel, callbackUrl: this.callbackUrl(orderId, payment.id) });
      payment = await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PENDING, authorizationUrl: initialized.authorizationUrl, accessCode: initialized.accessCode, initializedAt: new Date(), failureCode: null, failureMessage: null } });
    } catch (error) {
      const providerError = error instanceof PaystackProviderError ? error : new PaystackProviderError("Payment initialization failed", true, "UNKNOWN_ERROR");
      this.logger.warn({ event: "paystack_initialization_failed", orderId, paymentId: payment.id, providerErrorCode: providerError.code });
      payment = await this.prisma.payment.update({ where: { id: payment.id }, data: { status: providerError.ambiguous ? PaymentStatus.UNKNOWN : PaymentStatus.FAILED, failedAt: providerError.ambiguous ? null : new Date(), failureCode: providerError.code, failureMessage: providerError.message } });
    }
    return this.response(payment);
  }

  async status(userId: string, orderId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, include: { payments: { orderBy: { createdAt: "desc" } } } });
    if (!order) throw new NotFoundException("Order not found");
    return { payment: order.payments[0] ? this.reconciliation.safe(order.payments[0]) : null, order: { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus } };
  }

  async verify(userId: string, orderId: string, paymentId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, orderId, order: { customerProfileId: profile.id } } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== PaymentStatus.SUCCEEDED && payment.status !== PaymentStatus.FAILED && payment.status !== PaymentStatus.CANCELLED) {
      const cutoff = new Date(Date.now() - 10_000);
      const claimed = await this.prisma.payment.updateMany({ where: { id: payment.id, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lte: cutoff } }] }, data: { lastVerifiedAt: new Date() } });
      if (claimed.count === 0) return this.reconciliation.safe(await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }));
    }
    return this.reconciliation.reconcile(payment.id);
  }

  async processWebhook(rawBody: Buffer, body: PaystackWebhook) {
    if (!body || typeof body.event !== "string" || !body.data || typeof body.data !== "object") throw new BadRequestException("Malformed Paystack webhook");
    const providerReference = typeof body.data.reference === "string" ? body.data.reference : undefined;
    if (!providerReference) return { accepted: true, result: PaymentEventProcessingResult.IGNORED };
    const payment = await this.prisma.payment.findUnique({ where: { provider_providerReference: { provider: PaymentProvider.PAYSTACK, providerReference } } });
    if (!payment) return { accepted: true, result: PaymentEventProcessingResult.IGNORED };
    const eventIdentity = createHash("sha256").update(rawBody).digest("hex");
    let event;
    try {
      event = await this.prisma.paymentEvent.create({ data: { paymentId: payment.id, provider: PaymentProvider.PAYSTACK, eventType: body.event, eventIdentity, providerReference, providerStatus: typeof body.data.status === "string" ? body.data.status : undefined, providerCode: typeof body.data.id === "number" || typeof body.data.id === "string" ? String(body.data.id) : undefined, payload: sanitized(body) } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const existing = await this.prisma.paymentEvent.findUnique({ where: { provider_eventIdentity: { provider: PaymentProvider.PAYSTACK, eventIdentity } } });
        if (!existing || (existing.processingResult !== PaymentEventProcessingResult.RECEIVED && existing.processingResult !== PaymentEventProcessingResult.ERROR)) return { accepted: true, result: PaymentEventProcessingResult.DUPLICATE };
        event = existing;
      } else {
        throw error;
      }
    }
    let result: PaymentEventProcessingResult = PaymentEventProcessingResult.IGNORED;
    try {
      if (body.event !== "charge.success") result = PaymentEventProcessingResult.NON_SUCCESS;
      else {
        const evidence = normalizePaystackEvidence(body.data);
        result = this.settlement.eventResult(await this.settlement.settleSucceededPayment(payment.id, evidence));
      }
    } catch (error) {
      result = error instanceof ConflictException ? PaymentEventProcessingResult.FAILED_BINDING : PaymentEventProcessingResult.ERROR;
    }
    await this.prisma.paymentEvent.update({ where: { id: event.id }, data: { processingResult: result, processedAt: new Date() } });
    return { accepted: true, result };
  }
}
