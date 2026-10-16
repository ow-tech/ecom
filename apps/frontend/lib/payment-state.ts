import type { CustomerOrder, PaymentAttempt } from "./api";

export type CustomerPaymentState = "PAYABLE" | "PENDING_CONFIRMATION" | "PAID" | "FAILED" | "PAYMENT_REVIEW" | "AWAITING_DELIVERY_QUOTE" | "EXPIRED" | "CANCELLED" | "UNKNOWN";

export function customerPaymentState(order: Pick<CustomerOrder, "status" | "paymentStatus">, payment: Pick<PaymentAttempt, "status"> | null): CustomerPaymentState {
  if (order.status === "PAYMENT_REVIEW" || order.paymentStatus === "PAID_REVIEW") return "PAYMENT_REVIEW";
  if (order.status === "EXPIRED") return "EXPIRED";
  if (order.status === "CANCELLED") return "CANCELLED";
  if (order.paymentStatus === "PAID" || order.status === "PAYMENT_CONFIRMED" || order.status === "PROCESSING" || order.status === "READY_FOR_PICKUP" || order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERED") return "PAID";
  if (order.status === "AWAITING_DELIVERY_QUOTE") return "AWAITING_DELIVERY_QUOTE";
  if (payment?.status === "FAILED" || payment?.status === "CANCELLED") return "FAILED";
  if (payment?.status === "PENDING" || payment?.status === "INITIALIZATION_PENDING") return "PENDING_CONFIRMATION";
  if (payment?.status === "UNKNOWN") return "UNKNOWN";
  return "PAYABLE";
}

export function isTerminalCustomerPaymentState(state: CustomerPaymentState) {
  return state === "PAID" || state === "FAILED" || state === "PAYMENT_REVIEW" || state === "EXPIRED" || state === "CANCELLED";
}

export function shouldPollPayment(state: CustomerPaymentState, completedChecks: number, maximumChecks: number) {
  return (state === "PENDING_CONFIRMATION" || state === "UNKNOWN") && completedChecks < maximumChecks;
}
