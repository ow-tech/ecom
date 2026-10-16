CREATE TYPE "SupplierStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED');

CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "legalName" VARCHAR(160),
    "slug" VARCHAR(140) NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "businessEmail" VARCHAR(320),
    "businessPhone" VARCHAR(40),
    "websiteUrl" VARCHAR(2048),
    "logoUrl" VARCHAR(2048),
    "bannerUrl" VARCHAR(2048),
    "countryCode" VARCHAR(2),
    "currencyCode" VARCHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" UUID,
    "rejectionReason" VARCHAR(1000),
    "suspendedAt" TIMESTAMP(3),
    "suspendedByUserId" UUID,
    "suspensionReason" VARCHAR(1000),
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierStatusHistory" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "previousStatus" "SupplierStatus",
    "newStatus" "SupplierStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_organizationId_key" ON "Supplier"("organizationId");
CREATE UNIQUE INDEX "Supplier_slug_key" ON "Supplier"("slug");
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");
CREATE INDEX "SupplierStatusHistory_supplierId_createdAt_idx" ON "SupplierStatusHistory"("supplierId", "createdAt");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_suspendedByUserId_fkey" FOREIGN KEY ("suspendedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierStatusHistory" ADD CONSTRAINT "SupplierStatusHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierStatusHistory" ADD CONSTRAINT "SupplierStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
