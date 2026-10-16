import { Injectable, NotFoundException } from "@nestjs/common"; import { CustomerService } from "../customer/customer.service"; import { PrismaService } from "../prisma/prisma.service";
@Injectable() export class CustomerTrackingService {
  constructor(private readonly prisma: PrismaService, private readonly customer: CustomerService) {}
  async get(userId: string, orderId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, include: { deliveryAddress: true, pickupSnapshot: true, deliveryQuote: true, statusHistory: true, refundRequests: { select: { id: true, status: true, createdAt: true } }, returnRequests: { select: { id: true, status: true, createdAt: true } }, items: { select: { id: true, warrantyClaims: { where: { customerProfileId: profile.id }, select: { id: true, status: true, createdAt: true } } } }, supplierOrders: { include: { supplier: { select: { displayName: true } }, statusHistory: true } } } });
    if (!order) throw new NotFoundException("Order not found");
    const timeline = [
      ...order.statusHistory.map((event) => ({ timestamp: event.createdAt, status: event.newStatus, message: event.publicMessage, supplierDisplayName: null as string | null, sortKey: `order:${event.id}` })),
      ...order.supplierOrders.flatMap((supplierOrder) => supplierOrder.statusHistory.map((event) => ({ timestamp: event.createdAt, status: event.newStatus, message: event.publicMessage, supplierDisplayName: supplierOrder.supplier.displayName, sortKey: `supplier:${event.id}` }))),
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.sortKey.localeCompare(b.sortKey)).map((event) => ({ timestamp: event.timestamp, status: event.status, message: event.message, supplierDisplayName: event.supplierDisplayName }));
    return { orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, refundStatus: order.refundStatus, fulfillmentMethod: order.fulfillmentMethod, currentStatus: order.status, quote: order.deliveryQuote ? { status: order.deliveryQuote.status, amount: order.deliveryQuote.amount?.toFixed(2) ?? null, currencyCode: order.deliveryQuote.currencyCode, expiresAt: order.deliveryQuote.expiresAt } : null, pickup: order.pickupSnapshot ? { ...order.pickupSnapshot, pickupFee: order.pickupSnapshot.pickupFee.toFixed(2) } : null, delivery: order.deliveryAddress, refundRequests: order.refundRequests, returns: order.returnRequests, warranties: order.items.flatMap((item) => item.warrantyClaims), supplierProgress: order.supplierOrders.map((row) => ({ supplierDisplayName: row.supplier.displayName, status: row.status })), timeline };
  }
}
