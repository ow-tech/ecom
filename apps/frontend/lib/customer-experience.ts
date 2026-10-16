export type OrderStatusTone = "success" | "warning" | "info";

export function customerOrderStatusTone(paymentStatus: string): OrderStatusTone {
  if (paymentStatus === "PAID") return "success";
  if (paymentStatus === "PAID_REVIEW") return "warning";
  return "info";
}

export function showsSeparateSupplierProgress(supplierProgress: readonly unknown[]): boolean {
  return supplierProgress.length > 1;
}

export function validateSupportTicketInput(subject: string, message: string): string | undefined {
  if (!subject.trim()) return "Enter a subject for your request.";
  if (!message.trim()) return "Enter a message for your request.";
  return undefined;
}

export function canReplyToSupportTicket(status: string): boolean {
  return status !== "CLOSED";
}

export function customerVisibleSupportMessages<T extends { visibility?: string }>(messages: readonly T[]): T[] {
  return messages.filter((message) => message.visibility === undefined || message.visibility === "PUBLIC");
}
