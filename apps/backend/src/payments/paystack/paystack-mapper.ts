import { PaymentStatus } from "@prisma/client";
import { PaystackEvidence } from "./paystack.types";

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

export function mapPaystackStatus(status: string): PaymentStatus {
  switch (status.toLowerCase()) {
    case "success": return PaymentStatus.SUCCEEDED;
    case "failed": return PaymentStatus.FAILED;
    case "abandoned": return PaymentStatus.CANCELLED;
    case "ongoing":
    case "pending":
    case "processing":
    case "queued": return PaymentStatus.PENDING;
    default: return PaymentStatus.UNKNOWN;
  }
}

export function normalizePaystackEvidence(data: Record<string, unknown>): PaystackEvidence {
  const reference = stringValue(data.reference);
  const providerStatus = stringValue(data.status);
  const amountMinor = stringValue(data.amount);
  const currency = stringValue(data.currency);
  if (!reference || !providerStatus || !amountMinor || !/^\d+$/.test(amountMinor) || !currency) {
    throw new Error("Malformed Paystack transaction evidence");
  }
  const customer = data.customer && typeof data.customer === "object" ? data.customer as Record<string, unknown> : undefined;
  const paidAtValue = stringValue(data.paid_at ?? data.paidAt);
  const paidAt = paidAtValue ? new Date(paidAtValue) : undefined;
  return {
    reference,
    providerStatus,
    amountMinor,
    currency: currency.toUpperCase(),
    customerEmail: stringValue(customer?.email)?.trim().toLowerCase(),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : undefined,
    channel: stringValue(data.channel),
    gatewayResponse: stringValue(data.gateway_response),
    providerCode: stringValue(data.id),
  };
}
