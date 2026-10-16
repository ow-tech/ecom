CREATE TYPE "SupplierPayoutType" AS ENUM ('BANK','MPESA');
CREATE TABLE "SupplierPayoutDestination" (
  "id" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "type" "SupplierPayoutType" NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "accountHolderName" VARCHAR(160) NOT NULL,
  "bankName" VARCHAR(160),
  "bankCountryCode" VARCHAR(2),
  "maskedLastFour" VARCHAR(4) NOT NULL,
  "encryptedDetails" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierPayoutDestination_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierPayoutDestination_supplierId_isActive_createdAt_idx" ON "SupplierPayoutDestination"("supplierId","isActive","createdAt");
ALTER TABLE "SupplierPayoutDestination" ADD CONSTRAINT "SupplierPayoutDestination_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierSettlement" ADD COLUMN "payoutDestinationId" UUID;
ALTER TABLE "SupplierSettlement" ADD CONSTRAINT "SupplierSettlement_payoutDestinationId_fkey" FOREIGN KEY ("payoutDestinationId") REFERENCES "SupplierPayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
