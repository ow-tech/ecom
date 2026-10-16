export type PaystackInitialization = {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
};

export type PaystackEvidence = {
  reference: string;
  providerStatus: string;
  amountMinor: string;
  currency: string;
  customerEmail?: string;
  paidAt?: Date;
  channel?: string;
  gatewayResponse?: string;
  providerCode?: string;
};

export type PaystackWebhook = {
  event: string;
  data?: Record<string, unknown>;
};

export type PaystackRefundEvidence = {
  providerRefundId: string;
  transactionReference?: string;
  providerStatus: string;
  amountMinor: string;
  currency: string;
  merchantNote?: string;
  refundedAt?: Date;
  raw: Record<string, unknown>;
};

export class PaystackProviderError extends Error {
  constructor(message: string, readonly ambiguous: boolean, readonly code: string) {
    super(message);
    this.name = "PaystackProviderError";
  }
}
