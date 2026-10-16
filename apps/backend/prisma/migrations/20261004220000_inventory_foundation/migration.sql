CREATE TYPE "InventoryLocationType" AS ENUM ('WAREHOUSE', 'STORE', 'OTHER');
CREATE TYPE "InventoryLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InventoryMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

CREATE TABLE "InventoryLocation" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "type" "InventoryLocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "status" "InventoryLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "addressLine1" VARCHAR(200), "addressLine2" VARCHAR(200), "city" VARCHAR(120), "region" VARCHAR(120), "countryCode" VARCHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "supplierListingId" UUID NOT NULL,
    "inventoryLocationId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryItem_onHand_nonnegative" CHECK ("onHand" >= 0),
    CONSTRAINT "InventoryItem_reserved_nonnegative" CHECK ("reserved" >= 0),
    CONSTRAINT "InventoryItem_reserved_not_over_onHand" CHECK ("reserved" <= "onHand")
);
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousOnHand" INTEGER NOT NULL,
    "newOnHand" INTEGER NOT NULL,
    "referenceType" VARCHAR(80), "referenceId" VARCHAR(120), "reason" VARCHAR(1000), "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryMovement_quantity_positive" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "InventoryLocation_supplierId_code_key" ON "InventoryLocation"("supplierId", "code");
CREATE INDEX "InventoryLocation_supplierId_status_idx" ON "InventoryLocation"("supplierId", "status");
CREATE UNIQUE INDEX "InventoryItem_supplierListingId_inventoryLocationId_key" ON "InventoryItem"("supplierListingId", "inventoryLocationId");
CREATE INDEX "InventoryItem_inventoryLocationId_idx" ON "InventoryItem"("inventoryLocationId");
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierListingId_fkey" FOREIGN KEY ("supplierListingId") REFERENCES "SupplierListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
