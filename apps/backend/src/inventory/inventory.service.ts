import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, ListingOrigin, Prisma, ReservationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service"; import { RbacService } from "../rbac/rbac.service";
import { AuditService } from "../audit/audit.service";
import { AdjustStockDto, CreateInventoryLocationDto, InventoryListDto, ItemQuantityDto, ReceiveStockDto, UpdateInventoryLocationDto } from "./dto/inventory.dto";

type RawItem = { id: string; onHand: number; reserved: number };
@Injectable() export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly audit: AuditService) {}
  private async supplier(userId: string, organizationId: string, permission: string) { await this.rbac.organizationContext(userId, organizationId, permission); const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } }); if (!supplier) throw new NotFoundException("Supplier not found"); return supplier; }
  private output<T extends { onHand: number; reserved: number }>(item: T) { return { ...item, available: item.onHand - item.reserved }; }
  async listLocations(userId: string, organizationId: string) { const supplier = await this.supplier(userId, organizationId, "inventory.locations.read"); return this.prisma.inventoryLocation.findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: "asc" } }); }
  async createLocation(userId: string, organizationId: string, dto: CreateInventoryLocationDto) { const supplier = await this.supplier(userId, organizationId, "inventory.locations.manage"); try { return await this.prisma.inventoryLocation.create({ data: { ...dto, supplierId: supplier.id } }); } catch (e) { if ((e as { code?: string }).code === "P2002") throw new ConflictException("Location code already exists for this supplier"); throw e; } }
  async getLocation(userId: string, organizationId: string, id: string) { const supplier = await this.supplier(userId, organizationId, "inventory.locations.read"); const location = await this.prisma.inventoryLocation.findFirst({ where: { id, supplierId: supplier.id } }); if (!location) throw new NotFoundException("Inventory location not found"); return location; }
  async updateLocation(userId: string, organizationId: string, id: string, dto: UpdateInventoryLocationDto) { await this.getLocation(userId, organizationId, id); await this.supplier(userId, organizationId, "inventory.locations.manage"); try { return await this.prisma.inventoryLocation.update({ where: { id }, data: dto }); } catch (e) { if ((e as { code?: string }).code === "P2002") throw new ConflictException("Location code already exists for this supplier"); throw e; } }
  private async itemFor(userId: string, organizationId: string, id: string, permission: string) { const supplier = await this.supplier(userId, organizationId, permission); const item = await this.prisma.inventoryItem.findFirst({ where: { id, supplierListing: { supplierId: supplier.id }, inventoryLocation: { supplierId: supplier.id } }, include: { supplierListing: true, inventoryLocation: true } }); if (!item) throw new NotFoundException("Inventory item not found"); return item; }
  async list(userId: string, organizationId: string, q: InventoryListDto) { const supplier = await this.supplier(userId, organizationId, "inventory.read"); const where = { supplierListing: { supplierId: supplier.id }, inventoryLocation: { supplierId: supplier.id } }; const [total, data] = await this.prisma.$transaction([this.prisma.inventoryItem.count({ where }), this.prisma.inventoryItem.findMany({ where, include: { supplierListing: true, inventoryLocation: true }, orderBy: { createdAt: "asc" }, skip: (q.page - 1) * q.limit, take: q.limit })]); return { data: data.map((x) => this.output(x)), page: q.page, limit: q.limit, total }; }
  async get(userId: string, organizationId: string, id: string) { return this.output(await this.itemFor(userId, organizationId, id, "inventory.read")); }
  async receive(userId: string, organizationId: string, dto: ReceiveStockDto) { const supplier = await this.supplier(userId, organizationId, "inventory.adjust"); const [listing, location] = await Promise.all([this.prisma.supplierListing.findFirst({ where: { id: dto.supplierListingId, supplierId: supplier.id } }), this.prisma.inventoryLocation.findFirst({ where: { id: dto.inventoryLocationId, supplierId: supplier.id } })]); if (!listing || !location) throw new NotFoundException("Supplier listing or inventory location not found"); return this.prisma.$transaction(async (tx) => { const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`INSERT INTO "InventoryItem" ("id", "supplierListingId", "inventoryLocationId", "onHand", "reserved", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${listing.id}::uuid, ${location.id}::uuid, ${dto.quantity}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("supplierListingId", "inventoryLocationId") DO UPDATE SET "onHand" = "InventoryItem"."onHand" + EXCLUDED."onHand", "updatedAt" = CURRENT_TIMESTAMP RETURNING "id", "onHand", "reserved"`); const item = rows[0]; await tx.inventoryMovement.create({ data: { inventoryItemId: item.id, type: InventoryMovementType.STOCK_IN, quantity: dto.quantity, previousOnHand: item.onHand - dto.quantity, newOnHand: item.onHand, referenceType: dto.referenceType, referenceId: dto.referenceId, actorUserId: userId } }); return this.output(item); }); }
  private async physical(userId: string, organizationId: string, id: string, quantity: number, type: InventoryMovementType, reason?: string, referenceType?: string, referenceId?: string) { await this.itemFor(userId, organizationId, id, "inventory.adjust"); return this.prisma.$transaction(async (tx) => { const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "onHand" = "onHand" + ${quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}::uuid AND "onHand" + ${quantity} >= "reserved" RETURNING "id", "onHand", "reserved"`); if (!rows[0]) throw new ConflictException("Insufficient unreserved stock"); const item = rows[0]; const movement = await tx.inventoryMovement.create({ data: { inventoryItemId: id, type, quantity: Math.abs(quantity), previousOnHand: item.onHand - quantity, newOnHand: item.onHand, reason, referenceType, referenceId, actorUserId: userId } }); if (type === InventoryMovementType.ADJUSTMENT_IN || type === InventoryMovementType.ADJUSTMENT_OUT) await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "INVENTORY_MANUAL_ADJUSTMENT", entityType: "INVENTORY_ITEM", entityId: id, dedupeKey: `inventory-movement:${movement.id}:audit`, metadata: { movementId: movement.id, type, quantity, reason: reason ?? null } }); return this.output(item); }); }
  async remove(userId: string, organizationId: string, id: string, dto: ItemQuantityDto) { return this.physical(userId, organizationId, id, -dto.quantity, InventoryMovementType.STOCK_OUT, undefined, dto.referenceType, dto.referenceId); }
  async adjust(userId: string, organizationId: string, dto: AdjustStockDto) { if (!dto.quantity) throw new ConflictException("Adjustment quantity must not be zero"); return this.physical(userId, organizationId, dto.inventoryItemId, dto.quantity, dto.quantity > 0 ? InventoryMovementType.ADJUSTMENT_IN : InventoryMovementType.ADJUSTMENT_OUT, dto.reason); }
  // INV-INV-12: reserve only through this atomic conditional update; never read-then-write reservation arithmetic.
  async reserve(userId: string, organizationId: string, id: string, quantity: number) { await this.itemFor(userId, organizationId, id, "inventory.reserve"); const rows = await this.prisma.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}::uuid AND "onHand" - "reserved" >= ${quantity} RETURNING "id", "onHand", "reserved"`); if (!rows[0]) throw new ConflictException("Insufficient available stock"); return this.output(rows[0]); }
  async release(userId: string, organizationId: string, id: string, quantity: number) { await this.itemFor(userId, organizationId, id, "inventory.reserve"); const rows = await this.prisma.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}::uuid AND "reserved" >= ${quantity} RETURNING "id", "onHand", "reserved"`); if (!rows[0]) throw new ConflictException("Reservation cannot be released"); return this.output(rows[0]); }
  async consume(userId: string, organizationId: string, id: string, dto: ItemQuantityDto) { await this.itemFor(userId, organizationId, id, "inventory.reserve"); return this.prisma.$transaction(async (tx) => { const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${dto.quantity}, "onHand" = "onHand" - ${dto.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}::uuid AND "reserved" >= ${dto.quantity} AND "onHand" >= ${dto.quantity} RETURNING "id", "onHand", "reserved"`); if (!rows[0]) throw new ConflictException("Reservation cannot be consumed"); const item = rows[0]; await tx.inventoryMovement.create({ data: { inventoryItemId: id, type: InventoryMovementType.STOCK_OUT, quantity: dto.quantity, previousOnHand: item.onHand + dto.quantity, newOnHand: item.onHand, referenceType: dto.referenceType, referenceId: dto.referenceId, actorUserId: userId } }); return this.output(item); }); }

  // Checkout's canonical owned allocation seam. It reuses the same conditional
  // update as supplier reservation APIs and records ownership in the caller's transaction.
  async allocateOwned(tx: Prisma.TransactionClient, supplierListingId: string, quantity: number, checkoutAttemptId: string, orderId: string, expiresAt: Date) {
    const listing = await tx.supplierListing.findUnique({ where: { id: supplierListingId },
      select: { origin: true, supplier: { select: { overseasEnabled: true, status: true } } } });
    if (listing?.origin === ListingOrigin.OVERSEAS) {
      if (!listing.supplier.overseasEnabled || listing.supplier.status !== "ACTIVE")
        throw new ConflictException("Overseas shipping is not authorized");
      // INV-OVERSEAS-01: atomic capacity claim; physical onHand is untouched.
      const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "SupplierListing" SET "overseasReserved"="overseasReserved"+${quantity},
          "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${supplierListingId}::uuid AND "origin"='OVERSEAS'
          AND "overseasOrderable"-"overseasReserved"-"overseasCommitted">=${quantity}
        RETURNING "id"`);
      if (!claimed.length) throw new ConflictException("Overseas orderable quantity is unavailable");
      await tx.overseasReservation.create({ data: { supplierListingId, checkoutAttemptId, orderId, quantity, expiresAt } });
      return [];
    }
    const items = await tx.inventoryItem.findMany({ where: { supplierListingId, inventoryLocation: { status: "ACTIVE" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, onHand: true, reserved: true } });
    let remaining = quantity;
    const allocations: Array<{ inventoryItemId: string; quantity: number }> = [];
    for (const item of items) {
      if (remaining === 0) break;
      const requested = Math.min(remaining, item.onHand - item.reserved);
      if (requested <= 0) continue;
      const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" + ${requested}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${item.id}::uuid AND "onHand" - "reserved" >= ${requested} RETURNING "id", "onHand", "reserved"`);
      if (!rows[0]) continue;
      await tx.inventoryReservation.create({ data: { checkoutAttemptId, orderId, inventoryItemId: item.id, quantity: requested, expiresAt } });
      allocations.push({ inventoryItemId: item.id, quantity: requested });
      remaining -= requested;
    }
    if (remaining !== 0) throw new ConflictException({ statusCode: 409, error: "Conflict", code: "INSUFFICIENT_STOCK", message: "Requested quantity is unavailable" });
    return allocations;
  }

  async releaseOwned(tx: Prisma.TransactionClient, orderId: string, releasedAt: Date) {
    const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: ReservationStatus.ACTIVE }, orderBy: { inventoryItemId: "asc" } });
    for (const reservation of reservations) {
      const claimed = await tx.inventoryReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.ACTIVE }, data: { status: ReservationStatus.RELEASED, releasedAt } });
      if (claimed.count !== 1) continue;
      const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${reservation.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${reservation.inventoryItemId}::uuid AND "reserved" >= ${reservation.quantity} RETURNING "id", "onHand", "reserved"`);
      if (!rows[0]) throw new ConflictException("Owned reservation cannot be released");
    }
    const overseas = await tx.overseasReservation.findMany({ where: { orderId, status: ReservationStatus.ACTIVE },
      orderBy: { supplierListingId: "asc" } });
    for (const reservation of overseas) {
      const claimed = await tx.overseasReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.RELEASED, releasedAt } });
      if (!claimed.count) continue;
      const updated = await tx.supplierListing.updateMany({ where: { id: reservation.supplierListingId,
        overseasReserved: { gte: reservation.quantity } }, data: { overseasReserved: { decrement: reservation.quantity } } });
      if (!updated.count) throw new ConflictException("Overseas owned reservation cannot be released");
    }
    return reservations.length + overseas.length;
  }

  // Canonical transaction-aware owned consumption seam used by payment settlement.
  async consumeOwned(tx: Prisma.TransactionClient, orderId: string, paymentId: string, consumedAt: Date) {
    const reservations = await tx.inventoryReservation.findMany({ where: { orderId }, orderBy: [{ inventoryItemId: "asc" }, { id: "asc" }] });
    const overseas = await tx.overseasReservation.findMany({ where: { orderId },
      orderBy: [{ supplierListingId: "asc" }, { id: "asc" }] });
    if ((reservations.length === 0 && overseas.length === 0)
      || reservations.some(reservation => reservation.status !== ReservationStatus.ACTIVE)
      || overseas.some(reservation => reservation.status !== ReservationStatus.ACTIVE)) {
      throw new ConflictException("Order reservations are not all active");
    }
    for (const reservation of reservations) {
      const claimed = await tx.inventoryReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.ACTIVE }, data: { status: ReservationStatus.CONSUMED, consumedAt } });
      if (claimed.count !== 1) throw new ConflictException("Owned reservation was concurrently changed");
      const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${reservation.quantity}, "onHand" = "onHand" - ${reservation.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${reservation.inventoryItemId}::uuid AND "reserved" >= ${reservation.quantity} AND "onHand" >= ${reservation.quantity} RETURNING "id", "onHand", "reserved"`);
      const item = rows[0];
      if (!item) throw new ConflictException("Owned reservation cannot be consumed");
      await tx.inventoryMovement.create({ data: { inventoryItemId: reservation.inventoryItemId, type: InventoryMovementType.STOCK_OUT, quantity: reservation.quantity, previousOnHand: item.onHand + reservation.quantity, newOnHand: item.onHand, referenceType: "PAYMENT", referenceId: paymentId, reason: "Order payment confirmed" } });
    }
    for (const reservation of overseas) {
      const claimed = await tx.overseasReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.CONSUMED, consumedAt } });
      if (!claimed.count) throw new ConflictException("Overseas owned reservation concurrently changed");
      const updated = await tx.supplierListing.updateMany({ where: {
        id: reservation.supplierListingId, overseasReserved: { gte: reservation.quantity },
      }, data: { overseasReserved: { decrement: reservation.quantity }, overseasCommitted: { increment: reservation.quantity } } });
      if (!updated.count) throw new ConflictException("Overseas owned reservation cannot be consumed");
    }
    return reservations.length + overseas.length;
  }

  // Canonical transaction-aware expiry seam. A conditional claim makes retries safe.
  async expireOwned(tx: Prisma.TransactionClient, orderId: string, now: Date) {
    const reservations = await tx.inventoryReservation.findMany({ where: { orderId, status: ReservationStatus.ACTIVE, expiresAt: { lte: now } }, orderBy: [{ inventoryItemId: "asc" }, { id: "asc" }] });
    let expired = 0;
    for (const reservation of reservations) {
      const claimed = await tx.inventoryReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.ACTIVE, expiresAt: { lte: now } }, data: { status: ReservationStatus.EXPIRED, releasedAt: now } });
      if (claimed.count !== 1) continue;
      const rows = await tx.$queryRaw<RawItem[]>(Prisma.sql`UPDATE "InventoryItem" SET "reserved" = "reserved" - ${reservation.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${reservation.inventoryItemId}::uuid AND "reserved" >= ${reservation.quantity} RETURNING "id", "onHand", "reserved"`);
      if (!rows[0]) throw new ConflictException("Expired reservation cannot be released");
      expired += 1;
    }
    const overseas = await tx.overseasReservation.findMany({ where: {
      orderId, status: ReservationStatus.ACTIVE, expiresAt: { lte: now },
    }, orderBy: { supplierListingId: "asc" } });
    for (const reservation of overseas) {
      const claimed = await tx.overseasReservation.updateMany({ where: {
        id: reservation.id, status: ReservationStatus.ACTIVE, expiresAt: { lte: now },
      }, data: { status: ReservationStatus.EXPIRED, releasedAt: now } });
      if (!claimed.count) continue;
      const updated = await tx.supplierListing.updateMany({ where: { id: reservation.supplierListingId,
        overseasReserved: { gte: reservation.quantity } }, data: { overseasReserved: { decrement: reservation.quantity } } });
      if (!updated.count) throw new ConflictException("Expired overseas reservation cannot be released");
      expired += 1;
    }
    return expired;
  }
  async movements(userId: string, organizationId: string, id: string, q: InventoryListDto) { await this.itemFor(userId, organizationId, id, "inventory.read"); const [total, data] = await this.prisma.$transaction([this.prisma.inventoryMovement.count({ where: { inventoryItemId: id } }), this.prisma.inventoryMovement.findMany({ where: { inventoryItemId: id }, orderBy: { createdAt: "asc" }, skip: (q.page - 1) * q.limit, take: q.limit })]); return { data, page: q.page, limit: q.limit, total }; }
}
