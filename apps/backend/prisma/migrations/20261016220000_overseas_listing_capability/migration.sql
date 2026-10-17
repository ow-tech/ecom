CREATE TYPE "ListingOrigin" AS ENUM ('LOCAL', 'OVERSEAS');
ALTER TABLE "Supplier" ADD COLUMN "overseasEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupplierListing" ADD COLUMN "origin" "ListingOrigin" NOT NULL DEFAULT 'LOCAL', ADD COLUMN "deliveryMinDays" INTEGER, ADD COLUMN "deliveryMaxDays" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "originSnapshot" "ListingOrigin" NOT NULL DEFAULT 'LOCAL', ADD COLUMN "deliveryMinDaysSnapshot" INTEGER, ADD COLUMN "deliveryMaxDaysSnapshot" INTEGER;
ALTER TABLE "SupplierListing" ADD CONSTRAINT "listing_delivery_window_check" CHECK (
 ("origin"='LOCAL' AND "deliveryMinDays" IS NULL AND "deliveryMaxDays" IS NULL) OR
 ("origin"='OVERSEAS' AND "deliveryMinDays" BETWEEN 1 AND 365 AND "deliveryMaxDays" BETWEEN "deliveryMinDays" AND 365)
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_delivery_window_snapshot_check" CHECK (
 ("originSnapshot"='LOCAL' AND "deliveryMinDaysSnapshot" IS NULL AND "deliveryMaxDaysSnapshot" IS NULL) OR
 ("originSnapshot"='OVERSEAS' AND "deliveryMinDaysSnapshot" BETWEEN 1 AND 365 AND "deliveryMaxDaysSnapshot" BETWEEN "deliveryMinDaysSnapshot" AND 365)
);
-- Enforce authorization at the database boundary, including direct Prisma writes.
CREATE FUNCTION check_overseas_listing_capability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."origin"='OVERSEAS' AND NOT EXISTS(
  SELECT 1 FROM "Supplier" s WHERE s.id=NEW."supplierId" AND s."overseasEnabled"=true
 ) THEN RAISE EXCEPTION 'Overseas shipping is not enabled for supplier' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "listing_overseas_capability_guard" BEFORE INSERT OR UPDATE OF "origin","supplierId","status" ON "SupplierListing"
FOR EACH ROW EXECUTE FUNCTION check_overseas_listing_capability();
-- Revocation affects future activation/checkout but must not rewrite paid order history.
