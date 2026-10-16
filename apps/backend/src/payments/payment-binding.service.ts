import { Injectable } from "@nestjs/common";
import { Payment, PaymentStatus } from "@prisma/client";
import { commerceConflict } from "../commerce/commerce-error";
import { mapPaystackStatus } from "./paystack/paystack-mapper";
import { toPaystackMinorUnits } from "./paystack/paystack-money";
import { PaystackEvidence } from "./paystack/paystack.types";

@Injectable()
export class PaymentBindingService {
  validate(payment: Payment, evidence: PaystackEvidence): PaymentStatus {
    if (evidence.reference !== payment.providerReference) throw commerceConflict("PAYMENT_REFERENCE_MISMATCH", "Provider reference does not match payment");
    if (evidence.amountMinor !== toPaystackMinorUnits(payment.amount, payment.currencyCode)) throw commerceConflict("PAYMENT_AMOUNT_MISMATCH", "Provider amount does not match payment");
    if (evidence.currency !== payment.currencyCode) throw commerceConflict("PAYMENT_CURRENCY_MISMATCH", "Provider currency does not match payment");
    if (!evidence.customerEmail || evidence.customerEmail !== payment.customerEmail.toLowerCase()) throw commerceConflict("PAYMENT_CUSTOMER_MISMATCH", "Provider customer does not match payment");
    if (payment.requestedChannel && evidence.channel !== payment.requestedChannel) throw commerceConflict("PAYMENT_CHANNEL_MISMATCH", "Provider channel does not match the selected payment method");
    return mapPaystackStatus(evidence.providerStatus);
  }
}
