import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { FulfillmentMethod, OrderPaymentStatus, OrderStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service"; import { RbacService } from "../rbac/rbac.service";
import { CompletePickupDto, FulfilmentTransitionDto } from "./dto/fulfilment.dto"; import { OrderFulfilmentAggregationService } from "./order-fulfilment-aggregation.service";
import { FinancePostingService } from "../finance/finance-posting.service";
import { OperationalOutboxService } from "../operations/operations.service";

const allowed: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  PENDING_PAYMENT: [], CONFIRMED: [SupplierOrderStatus.PREPARING], PREPARING: [SupplierOrderStatus.READY_FOR_PICKUP, SupplierOrderStatus.READY_FOR_DISPATCH], READY_FOR_PICKUP: [SupplierOrderStatus.COMPLETED], READY_FOR_DISPATCH: [SupplierOrderStatus.OUT_FOR_DELIVERY], OUT_FOR_DELIVERY: [SupplierOrderStatus.COMPLETED], COMPLETED: [], CANCELLED: [], EXPIRED: [],
};
@Injectable()
export class FulfilmentLifecycleService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly aggregation: OrderFulfilmentAggregationService, private readonly finance: FinancePostingService, private readonly outbox: OperationalOutboxService) {}
  private async supplier(userId: string, organizationId: string) { await this.rbac.organizationContext(userId, organizationId, "fulfilment.update"); const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } }); if (!supplier) throw new NotFoundException("Supplier not found"); return supplier; }
  private async run(userId: string, organizationId: string, id: string, target: SupplierOrderStatus, dto: FulfilmentTransitionDto, collectionCode?: string) {
    const supplier = await this.supplier(userId, organizationId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupplierOrder" WHERE "id" = ${id}::uuid FOR UPDATE`);
        const row = await tx.supplierOrder.findFirst({ where: { id, supplierId: supplier.id }, include: { order: { include: { customerProfile: { select: { userId: true } } } } } });
        if (!row) throw new NotFoundException("Supplier order not found");
        if (row.status === target) return { supplierOrderId: row.id, status: row.status, orderStatus: row.order.status, idempotent: true };
        if (row.order.paymentStatus !== OrderPaymentStatus.PAID || row.order.status === OrderStatus.PAYMENT_REVIEW || row.order.status === OrderStatus.CANCELLED || row.order.status === OrderStatus.EXPIRED) throw new ConflictException("Supplier order is not eligible for fulfilment");
        if (collectionCode !== undefined && row.order.fulfillmentMethod !== FulfillmentMethod.PICKUP) throw new ConflictException("Pickup completion is invalid for delivery");
        if (!allowed[row.status].includes(target)) throw new ConflictException(`Invalid fulfilment transition ${row.status} -> ${target}`);
        if (row.order.fulfillmentMethod === FulfillmentMethod.PICKUP && (target === SupplierOrderStatus.READY_FOR_DISPATCH || target === SupplierOrderStatus.OUT_FOR_DELIVERY)) throw new ConflictException("Delivery transition is invalid for pickup");
        if (row.order.fulfillmentMethod === FulfillmentMethod.DELIVERY && target === SupplierOrderStatus.READY_FOR_PICKUP) throw new ConflictException("Pickup transition is invalid for delivery");
        if (target === SupplierOrderStatus.COMPLETED && row.order.fulfillmentMethod === FulfillmentMethod.PICKUP) {
          if (!collectionCode || !row.order.collectionCodeHash) throw new ConflictException("A valid collection code is required");
          if (row.order.collectionCodeExpiresAt && row.order.collectionCodeExpiresAt <= new Date()) throw new ConflictException("Collection code has expired");
          const supplied = Buffer.from(createHash("sha256").update(collectionCode).digest("hex")); const expected = Buffer.from(row.order.collectionCodeHash);
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ConflictException("Collection code is invalid");
        }
        const changed = await tx.supplierOrder.updateMany({ where: { id: row.id, status: row.status }, data: { status: target } });
        if (changed.count !== 1) throw new ConflictException("Supplier order was concurrently changed");
        await tx.supplierOrderStatusHistory.create({ data: { supplierOrderId: row.id, previousStatus: row.status, newStatus: target, actorUserId: userId, reason: dto.reason, publicMessage: dto.publicMessage ?? this.defaultMessage(target), internalNote: dto.internalNote } });
        if (target === SupplierOrderStatus.COMPLETED) await this.finance.postCommissions(tx, row.id, new Date());
        const orderStatus = await this.aggregation.recompute(tx, row.orderId);
        return { supplierOrderId: row.id, status: target, orderStatus, idempotent: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }); } catch (error) { const prismaError = error as { code?: string; meta?: { code?: string } }; if ((prismaError.code === "P2034" || (prismaError.code === "P2010" && prismaError.meta?.code === "40001")) && attempt < 2) continue; throw error; }
    }
    throw new ConflictException("Fulfilment transition could not be serialized");
  }
  private defaultMessage(status: SupplierOrderStatus) { return ({ PREPARING: "Supplier is preparing items", READY_FOR_PICKUP: "Items are ready for pickup", READY_FOR_DISPATCH: "Items are ready for dispatch", OUT_FOR_DELIVERY: "Items are out for delivery", COMPLETED: "Items completed" } as Partial<Record<SupplierOrderStatus, string>>)[status]; }
  startPreparing(userId: string, org: string, id: string, dto: FulfilmentTransitionDto) { return this.run(userId, org, id, SupplierOrderStatus.PREPARING, dto); }
  readyForPickup(userId: string, org: string, id: string, dto: FulfilmentTransitionDto) { return this.run(userId, org, id, SupplierOrderStatus.READY_FOR_PICKUP, dto); }
  readyForDispatch(userId: string, org: string, id: string, dto: FulfilmentTransitionDto) { return this.run(userId, org, id, SupplierOrderStatus.READY_FOR_DISPATCH, dto); }
  outForDelivery(userId: string, org: string, id: string, dto: FulfilmentTransitionDto) { return this.run(userId, org, id, SupplierOrderStatus.OUT_FOR_DELIVERY, dto); }
  complete(userId: string, org: string, id: string, dto: FulfilmentTransitionDto) { return this.run(userId, org, id, SupplierOrderStatus.COMPLETED, dto); }
  completePickup(userId: string, org: string, id: string, dto: CompletePickupDto) { return this.run(userId, org, id, SupplierOrderStatus.COMPLETED, dto, dto.collectionCode); }
}
