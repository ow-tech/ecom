import { Injectable } from "@nestjs/common";
import { OrderPaymentStatus, OrderStatus, PaymentStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { OperationalOutboxService } from "../operations/operations.service";

@Injectable()
export class ReservationExpiryService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService, private readonly config: ConfigService, private readonly outbox: OperationalOutboxService) {}

  async expireBatch(now = new Date(), requestedLimit?: number) {
    const configured = this.config.get<number>("RESERVATION_EXPIRY_BATCH_SIZE", 100);
    const limit = Math.min(Math.max(requestedLimit ?? configured, 1), configured);
    const candidates = await this.prisma.$queryRaw<Array<{ orderId: string }>>(Prisma.sql`
      SELECT "orderId" FROM (
        SELECT "orderId" FROM "InventoryReservation" WHERE "status"='ACTIVE' AND "expiresAt" <= ${now}
        UNION
        SELECT "orderId" FROM "OverseasReservation" WHERE "status"='ACTIVE' AND "expiresAt" <= ${now}
      ) due ORDER BY "orderId" LIMIT ${limit}
    `);
    const results: Array<{ orderId: string; expired: number; orderExpired: boolean }> = [];
    for (const candidate of candidates) {
      const result = await this.expireOrder(candidate.orderId, now);
      results.push({ orderId: candidate.orderId, ...result });
    }
    return { processedOrders: results.length, results };
  }

  async expireOrder(orderId: string, now = new Date()) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await this.expireOrderOnce(orderId, now); }
      catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt === 2) throw error;
      }
    }
    return { expired: 0, orderExpired: false };
  }

  private async expireOrderOnce(orderId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { customerProfile: { select: { userId: true } } } });
      if (!order || (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.AWAITING_DELIVERY_QUOTE) || order.paymentStatus !== OrderPaymentStatus.UNPAID) return { expired: 0, orderExpired: false };
      const succeeded = await tx.payment.findFirst({ where: { orderId, status: PaymentStatus.SUCCEEDED } });
      if (succeeded) return { expired: 0, orderExpired: false };
      const expired = await this.inventory.expireOwned(tx, orderId, now);
      if (expired === 0) return { expired: 0, orderExpired: false };
      const active = (await tx.inventoryReservation.count({ where: { orderId, status: "ACTIVE" } }))
        + (await tx.overseasReservation.count({ where: { orderId, status: "ACTIVE" } }));
      if (active > 0) return { expired, orderExpired: false };
      const changed = await tx.order.updateMany({ where: { id: orderId, status: order.status, paymentStatus: OrderPaymentStatus.UNPAID }, data: { status: OrderStatus.EXPIRED } });
      if (changed.count === 1) {
        await tx.supplierOrder.updateMany({ where: { orderId, status: SupplierOrderStatus.PENDING_PAYMENT }, data: { status: SupplierOrderStatus.EXPIRED } });
        const supplierOrders = await tx.supplierOrder.findMany({ where: { orderId }, select: { id: true } });
        await tx.supplierOrderStatusHistory.createMany({ data: supplierOrders.map((row) => ({ supplierOrderId: row.id, previousStatus: SupplierOrderStatus.PENDING_PAYMENT, newStatus: SupplierOrderStatus.EXPIRED, reason: "Reservation TTL elapsed", publicMessage: "Supplier order expired before payment confirmation" })) });
        await tx.orderStatusHistory.create({ data: { orderId, previousStatus: order.status, newStatus: OrderStatus.EXPIRED, reason: "Reservation TTL elapsed", publicMessage: "Order expired before payment confirmation" } });
        await this.outbox.enqueue(tx, { eventType: "ORDER_EXPIRED", aggregateType: "Order", aggregateId: orderId, dedupeKey: `order:${orderId}:expired`, userId: order.customerProfile.userId, payload: { recipientUserId: order.customerProfile.userId, type: "ORDER_EXPIRED", category: "ORDER", title: "Order expired", body: "Your order expired before payment was confirmed.", entityType: "ORDER", entityId: orderId, dedupeKey: `notification:order:${orderId}:expired` } });
      }
      return { expired, orderExpired: changed.count === 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  }
}
