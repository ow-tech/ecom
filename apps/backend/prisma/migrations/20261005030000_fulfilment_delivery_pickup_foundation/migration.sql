ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_DELIVERY_QUOTE';
ALTER TYPE "OrderStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_PICKUP';
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

ALTER TYPE "SupplierOrderStatus" ADD VALUE 'PREPARING';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'READY_FOR_PICKUP';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'READY_FOR_DISPATCH';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'COMPLETED';

CREATE TYPE "PickupPointStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DeliveryZoneStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DeliveryRateStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DeliveryQuoteStatus" AS ENUM ('PENDING', 'QUOTED', 'APPROVED', 'DECLINED', 'EXPIRED');

ALTER TABLE "Order"
  ADD COLUMN "pickupFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "collectionCodeHash" VARCHAR(64),
  ADD COLUMN "collectionCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "collectedAt" TIMESTAMP(3);

ALTER TABLE "Order" DROP CONSTRAINT "Order_amounts_nonnegative";
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_nonnegative"
  CHECK ("subtotal" >= 0 AND "deliveryFee" >= 0 AND "pickupFee" >= 0 AND "total" = "subtotal" + "deliveryFee" + "pickupFee");
ALTER TABLE "Order" ADD CONSTRAINT "Order_collection_code_consistent"
  CHECK (("collectionCodeHash" IS NULL AND "collectionCodeExpiresAt" IS NULL) OR length("collectionCodeHash") = 64);

CREATE TABLE "PickupPoint" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(80) NOT NULL, "slug" VARCHAR(180) NOT NULL,
  "countryCode" VARCHAR(2) NOT NULL, "region" VARCHAR(120) NOT NULL, "city" VARCHAR(120) NOT NULL,
  "address" VARCHAR(300) NOT NULL, "landmark" VARCHAR(240),
  "latitude" DECIMAL(10,7), "longitude" DECIMAL(10,7), "phone" VARCHAR(40),
  "openingHours" JSONB, "pickupFee" DECIMAL(18,2) NOT NULL, "storageLimitDays" INTEGER,
  "status" "PickupPointStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupPoint_pickupFee_nonnegative" CHECK ("pickupFee" >= 0),
  CONSTRAINT "PickupPoint_storageLimitDays_positive" CHECK ("storageLimitDays" IS NULL OR "storageLimitDays" > 0),
  CONSTRAINT "PickupPoint_countryCode_uppercase" CHECK ("countryCode" ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX "PickupPoint_code_key" ON "PickupPoint"("code");
CREATE UNIQUE INDEX "PickupPoint_slug_key" ON "PickupPoint"("slug");
CREATE INDEX "PickupPoint_countryCode_region_city_status_idx" ON "PickupPoint"("countryCode", "region", "city", "status");

CREATE TABLE "OrderPickupSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL, "pickupPointId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL, "address" VARCHAR(300) NOT NULL, "city" VARCHAR(120) NOT NULL,
  "region" VARCHAR(120) NOT NULL, "phone" VARCHAR(40), "pickupFee" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "OrderPickupSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderPickupSnapshot_pickupFee_nonnegative" CHECK ("pickupFee" >= 0)
);
CREATE UNIQUE INDEX "OrderPickupSnapshot_orderId_key" ON "OrderPickupSnapshot"("orderId");

CREATE TABLE "DeliveryZone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(160) NOT NULL,
  "countryCode" VARCHAR(2) NOT NULL, "region" VARCHAR(120), "city" VARCHAR(120),
  "status" "DeliveryZoneStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryZone_countryCode_uppercase" CHECK ("countryCode" ~ '^[A-Z]{2}$')
);
CREATE INDEX "DeliveryZone_countryCode_region_city_status_idx" ON "DeliveryZone"("countryCode", "region", "city", "status");

CREATE TABLE "DeliveryRate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "deliveryZoneId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "currencyCode" VARCHAR(3) NOT NULL,
  "status" "DeliveryRateStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRate_amount_nonnegative" CHECK ("amount" >= 0),
  CONSTRAINT "DeliveryRate_currencyCode_uppercase" CHECK ("currencyCode" ~ '^[A-Z]{3}$')
);
CREATE INDEX "DeliveryRate_deliveryZoneId_status_idx" ON "DeliveryRate"("deliveryZoneId", "status");
CREATE UNIQUE INDEX "DeliveryRate_one_active_per_zone_currency" ON "DeliveryRate"("deliveryZoneId", "currencyCode") WHERE "status" = 'ACTIVE';

CREATE TABLE "DeliveryQuote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "orderId" UUID NOT NULL,
  "amount" DECIMAL(18,2), "currencyCode" VARCHAR(3) NOT NULL,
  "status" "DeliveryQuoteStatus" NOT NULL DEFAULT 'PENDING', "reason" VARCHAR(1000),
  "calculatedByUserId" UUID, "expiresAt" TIMESTAMP(3), "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryQuote_amount_status_consistent" CHECK (
    ("status" = 'PENDING' AND "amount" IS NULL) OR
    ("status" IN ('QUOTED', 'APPROVED', 'DECLINED') AND "amount" IS NOT NULL AND "amount" >= 0) OR
    ("status" = 'EXPIRED' AND ("amount" IS NULL OR "amount" >= 0))
  ),
  CONSTRAINT "DeliveryQuote_currencyCode_uppercase" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "DeliveryQuote_approvedAt_consistent" CHECK (("status" = 'APPROVED') = ("approvedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "DeliveryQuote_orderId_key" ON "DeliveryQuote"("orderId");
CREATE INDEX "DeliveryQuote_status_createdAt_idx" ON "DeliveryQuote"("status", "createdAt");

CREATE TABLE "SupplierOrderStatusHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "supplierOrderId" UUID NOT NULL,
  "previousStatus" "SupplierOrderStatus", "newStatus" "SupplierOrderStatus" NOT NULL,
  "actorUserId" UUID, "reason" VARCHAR(1000), "publicMessage" VARCHAR(1000),
  "internalNote" VARCHAR(1000), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierOrderStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierOrderStatusHistory_supplierOrderId_createdAt_idx" ON "SupplierOrderStatusHistory"("supplierOrderId", "createdAt");

ALTER TABLE "OrderPickupSnapshot" ADD CONSTRAINT "OrderPickupSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderPickupSnapshot" ADD CONSTRAINT "OrderPickupSnapshot_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRate" ADD CONSTRAINT "DeliveryRate_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryQuote" ADD CONSTRAINT "DeliveryQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryQuote" ADD CONSTRAINT "DeliveryQuote_calculatedByUserId_fkey" FOREIGN KEY ("calculatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierOrderStatusHistory" ADD CONSTRAINT "SupplierOrderStatusHistory_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierOrderStatusHistory" ADD CONSTRAINT "SupplierOrderStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
