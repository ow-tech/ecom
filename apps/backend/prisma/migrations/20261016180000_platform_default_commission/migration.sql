CREATE TABLE "PlatformCommissionRate" (
  "id" UUID NOT NULL,
  "rate" DECIMAL(8,6) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformCommissionRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformCommissionRate_positive" CHECK ("rate" > 0 AND "rate" <= 1)
);
CREATE UNIQUE INDEX "PlatformCommissionRate_effectiveFrom_key" ON "PlatformCommissionRate" ("effectiveFrom");
CREATE INDEX "PlatformCommissionRate_effectiveFrom_idx" ON "PlatformCommissionRate" ("effectiveFrom");
ALTER TABLE "PlatformCommissionRate" ADD CONSTRAINT "PlatformCommissionRate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
