import { PaymentStatus } from "@prisma/client";
import { customerPaymentFailureKind } from "./payment-reconciliation.service";

describe("customer payment failure classification", () => {
  it.each([
    [PaymentStatus.FAILED, null, "HTTP_401", "CONFIGURATION_REJECTED"],
    [PaymentStatus.FAILED, null, "HTTP_400", "PROVIDER_REJECTED"],
    [PaymentStatus.FAILED, null, "DECLINED", "INITIALIZATION_FAILED"],
    [PaymentStatus.FAILED, new Date(), "DECLINED", "PROVIDER_FAILED"],
    [PaymentStatus.UNKNOWN, null, "NETWORK_ERROR", "NETWORK_UNCERTAIN"],
    [PaymentStatus.UNKNOWN, null, "TIMEOUT", "NETWORK_UNCERTAIN"],
    [PaymentStatus.UNKNOWN, null, "MALFORMED_RESPONSE", "PROVIDER_RESPONSE_UNCERTAIN"],
  ])("maps %s / %s / %s to %s", (status, initializedAt, failureCode, expected) => {
    expect(customerPaymentFailureKind({ status, initializedAt, failureCode })).toBe(expected);
  });
});
