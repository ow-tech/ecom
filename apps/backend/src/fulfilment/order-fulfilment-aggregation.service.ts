import { Injectable } from "@nestjs/common";
import { FulfillmentMethod, OrderStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { OperationalOutboxService } from "../operations/operations.service";

@Injectable()
export class OrderFulfilmentAggregationService {
  constructor(private readonly outbox: OperationalOutboxService) {}
  derive(method: FulfillmentMethod, statuses: SupplierOrderStatus[]): OrderStatus {
    if (statuses.length > 0 && statuses.every((status) => status === SupplierOrderStatus.COMPLETED)) return OrderStatus.DELIVERED;
    if (method === FulfillmentMethod.PICKUP && statuses.length > 0 && statuses.every((status) => status === SupplierOrderStatus.READY_FOR_PICKUP || status === SupplierOrderStatus.COMPLETED)) return OrderStatus.READY_FOR_PICKUP;
    if (method === FulfillmentMethod.DELIVERY && statuses.some((status) => status === SupplierOrderStatus.OUT_FOR_DELIVERY) && statuses.every((status) => status === SupplierOrderStatus.OUT_FOR_DELIVERY || status === SupplierOrderStatus.COMPLETED)) return OrderStatus.OUT_FOR_DELIVERY;
    if (statuses.every((status) => status === SupplierOrderStatus.CONFIRMED)) return OrderStatus.PAYMENT_CONFIRMED;
    return OrderStatus.PROCESSING;
  }
  async recompute(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { customerProfile: { select: { userId: true } }, supplierOrders: { select: { status: true } } } });
    if (order.status === OrderStatus.PAYMENT_REVIEW || order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) return order.status;
    const next = this.derive(order.fulfillmentMethod, order.supplierOrders.map((row) => row.status));
    if (next === order.status) return next;
    await tx.order.update({ where: { id: order.id }, data: { status: next, ...(next === OrderStatus.DELIVERED && order.fulfillmentMethod === FulfillmentMethod.PICKUP ? { collectedAt: new Date() } : {}) } });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: next, publicMessage: next === OrderStatus.DELIVERED ? "Order completed" : next === OrderStatus.READY_FOR_PICKUP ? "Order ready for pickup" : next === OrderStatus.OUT_FOR_DELIVERY ? "Order out for delivery" : "Order is being prepared" } });
    const notification = next === OrderStatus.READY_FOR_PICKUP
      ? { type: "READY_FOR_PICKUP", category: "FULFILMENT", title: "Order ready for pickup", body: `Order ${order.orderNumber} is ready for pickup.` }
      : next === OrderStatus.OUT_FOR_DELIVERY
        ? { type: "OUT_FOR_DELIVERY", category: "DELIVERY", title: "Order out for delivery", body: `Order ${order.orderNumber} is out for delivery.` }
        : next === OrderStatus.DELIVERED
          ? { type: "ORDER_DELIVERED", category: "DELIVERY", title: "Order delivered", body: `Order ${order.orderNumber} has been completed.` }
          : null;
    if (notification) await this.outbox.enqueue(tx, { eventType: notification.type, aggregateType: "Order", aggregateId: order.id, dedupeKey: `order:${order.id}:${next.toLowerCase()}`, userId: order.customerProfile.userId, payload: { recipientUserId: order.customerProfile.userId, ...notification, entityType: "ORDER", entityId: order.id, dedupeKey: `notification:order:${order.id}:${next.toLowerCase()}` } });
    return next;
  }
}
