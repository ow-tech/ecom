ALTER TABLE "SupplierListing"
 ADD COLUMN "overseasOrderable" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "overseasReserved" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "overseasCommitted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierListing" ADD CONSTRAINT "listing_overseas_capacity_check" CHECK (
 "overseasOrderable" >= 0 AND "overseasReserved" >= 0 AND "overseasCommitted" >= 0 AND
 "overseasReserved" + "overseasCommitted" <= "overseasOrderable" AND
 ("origin"='OVERSEAS' OR ("overseasOrderable"=0 AND "overseasReserved"=0 AND "overseasCommitted"=0))
);
CREATE TABLE "OverseasReservation" (
 "id" UUID NOT NULL,
 "supplierListingId" UUID NOT NULL,
 "checkoutAttemptId" UUID NOT NULL,
 "orderId" UUID NOT NULL,
 "quantity" INTEGER NOT NULL,
 "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "releasedAt" TIMESTAMP(3),
 "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "OverseasReservation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "OverseasReservation_quantity_check" CHECK ("quantity">0)
);
CREATE UNIQUE INDEX "OverseasReservation_orderId_supplierListingId_key" ON "OverseasReservation"("orderId","supplierListingId");
CREATE INDEX "OverseasReservation_status_expiresAt_idx" ON "OverseasReservation"("status","expiresAt");
ALTER TABLE "OverseasReservation" ADD CONSTRAINT "OverseasReservation_supplierListingId_fkey" FOREIGN KEY ("supplierListingId") REFERENCES "SupplierListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OverseasReservation" ADD CONSTRAINT "OverseasReservation_checkoutAttemptId_fkey" FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OverseasReservation" ADD CONSTRAINT "OverseasReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Capacity and paid commitments survive cancellations/returns unless the supplier
-- explicitly revises its available-to-order quota. Never invent physical stock.
