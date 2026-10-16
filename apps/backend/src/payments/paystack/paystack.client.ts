import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizePaystackEvidence } from "./paystack-mapper";
import { PaystackEvidence, PaystackInitialization, PaystackProviderError, PaystackRefundEvidence } from "./paystack.types";

type Envelope = { status?: unknown; message?: unknown; data?: unknown };

@Injectable()
export class PaystackClient {
  constructor(private readonly config: ConfigService) {}

  private async request(path: string, init: RequestInit): Promise<Envelope> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>("PAYSTACK_TIMEOUT_MS", 10_000));
    try {
      const response = await fetch(`${this.config.getOrThrow<string>("PAYSTACK_BASE_URL")}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.getOrThrow<string>("PAYSTACK_SECRET_KEY")}`, "Content-Type": "application/json", ...init.headers },
      });
      let body: Envelope;
      try { body = await response.json() as Envelope; } catch { throw new PaystackProviderError("Paystack returned unreadable JSON", true, "MALFORMED_RESPONSE"); }
      if (!response.ok || body.status !== true) {
        throw new PaystackProviderError(typeof body.message === "string" ? body.message : `Paystack HTTP ${response.status}`, false, `HTTP_${response.status}`);
      }
      return body;
    } catch (error) {
      if (error instanceof PaystackProviderError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new PaystackProviderError(aborted ? "Paystack request timed out" : "Paystack network request failed", true, aborted ? "TIMEOUT" : "NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(input: { reference: string; amountMinor: string; currency: string; email: string; orderId: string; channel: "card" | "mobile_money"; callbackUrl?: string }): Promise<PaystackInitialization> {
    const envelope = await this.request("/transaction/initialize", { method: "POST", body: JSON.stringify({ reference: input.reference, amount: input.amountMinor, currency: input.currency, email: input.email, channels: [input.channel], callback_url: input.callbackUrl, metadata: JSON.stringify({ orderId: input.orderId }) }) });
    const data = envelope.data as Record<string, unknown> | undefined;
    if (!data || typeof data.reference !== "string" || typeof data.authorization_url !== "string" || typeof data.access_code !== "string") {
      throw new PaystackProviderError("Paystack initialization response is malformed", true, "MALFORMED_RESPONSE");
    }
    if (data.reference !== input.reference) throw new PaystackProviderError("Paystack returned a conflicting reference", true, "REFERENCE_MISMATCH");
    return { reference: data.reference, authorizationUrl: data.authorization_url, accessCode: data.access_code };
  }

  async verify(reference: string): Promise<PaystackEvidence> {
    const envelope = await this.request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
    if (!envelope.data || typeof envelope.data !== "object") throw new PaystackProviderError("Paystack verification response is malformed", true, "MALFORMED_RESPONSE");
    try { return normalizePaystackEvidence(envelope.data as Record<string, unknown>); }
    catch { throw new PaystackProviderError("Paystack verification response is malformed", true, "MALFORMED_RESPONSE"); }
  }

  private refundEvidence(value: unknown): PaystackRefundEvidence {
    if (!value || typeof value !== "object") throw new PaystackProviderError("Paystack refund response is malformed", false, "MALFORMED_RESPONSE");
    const data = value as Record<string, unknown>;
    const id = typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : undefined;
    const status = typeof data.status === "string" ? data.status : undefined;
    const amount = typeof data.amount === "string" || typeof data.amount === "number" ? String(data.amount) : undefined;
    const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : undefined;
    if (!id || !status || !amount || !/^\d+$/.test(amount) || !currency) throw new PaystackProviderError("Paystack refund response is malformed", false, "MALFORMED_RESPONSE");
    const transaction = data.transaction && typeof data.transaction === "object" ? data.transaction as Record<string, unknown> : undefined;
    const referenceValue = transaction?.reference ?? data.transaction_reference;
    const refunded = typeof data.refunded_at === "string" ? new Date(data.refunded_at) : undefined;
    return { providerRefundId: id, providerStatus: status, amountMinor: amount, currency, transactionReference: typeof referenceValue === "string" ? referenceValue : undefined, merchantNote: typeof data.merchant_note === "string" ? data.merchant_note : undefined, refundedAt: refunded && !Number.isNaN(refunded.getTime()) ? refunded : undefined, raw: data };
  }

  async createRefund(input: { transactionReference: string; amountMinor: string; currency: string; internalReference: string; customerNote?: string }): Promise<PaystackRefundEvidence> {
    const envelope = await this.request("/refund", { method: "POST", body: JSON.stringify({ transaction: input.transactionReference, amount: input.amountMinor, currency: input.currency, customer_note: input.customerNote, merchant_note: `ecom-refund:${input.internalReference}` }) });
    return this.refundEvidence(envelope.data);
  }

  async fetchRefund(providerRefundId: string): Promise<PaystackRefundEvidence> {
    const envelope = await this.request(`/refund/${encodeURIComponent(providerRefundId)}`, { method: "GET" });
    return this.refundEvidence(envelope.data);
  }

  async findRefund(transactionReference: string, internalReference: string): Promise<PaystackRefundEvidence | null> {
    const envelope = await this.request(`/refund?transaction=${encodeURIComponent(transactionReference)}&perPage=100&page=1`, { method: "GET" });
    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    const match = rows.find((row) => row && typeof row === "object" && (row as Record<string, unknown>).merchant_note === `ecom-refund:${internalReference}`);
    return match ? this.refundEvidence(match) : null;
  }
}
