import { api } from "./api";

export const payments = {
  initializePayment: api.initializePayment,
  getPaymentStatus: api.paymentStatus,
  verifyPayment: api.verifyPayment,
  getOrder: api.customerOrder,
  getOrders: api.customerOrders,
  getTracking: api.customerTracking,
};
