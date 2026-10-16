CREATE TYPE "StaffInvitationStatus" AS ENUM ('PENDING','ACCEPTED','REVOKED','EXPIRED');
CREATE TYPE "StaffInvitationScope" AS ENUM ('SUPPLIER','PLATFORM');

CREATE TABLE "StaffInvitation" (
  "id" UUID NOT NULL,
  "scope" "StaffInvitationScope" NOT NULL,
  "organizationId" UUID,
  "emailNormalized" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "invitedByUserId" UUID NOT NULL,
  "status" "StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "emailedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" UUID,
  "revokedAt" TIMESTAMP(3),
  "sendAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffInvitation_scope_org_check" CHECK (
    ("scope" = 'SUPPLIER' AND "organizationId" IS NOT NULL) OR
    ("scope" = 'PLATFORM' AND "organizationId" IS NULL)
  ),
  CONSTRAINT "StaffInvitation_email_canonical_check" CHECK ("emailNormalized" = lower(btrim("emailNormalized"))),
  CONSTRAINT "StaffInvitation_attempts_check" CHECK ("sendAttempts" >= 0)
);
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_scope_organizationId_status_idx" ON "StaffInvitation"("scope","organizationId","status");
CREATE INDEX "StaffInvitation_emailNormalized_status_idx" ON "StaffInvitation"("emailNormalized","status");
-- One pending invitation per address within each scope/tenant.
CREATE UNIQUE INDEX "StaffInvitation_pending_supplier_unique" ON "StaffInvitation"("organizationId","emailNormalized") WHERE "status"='PENDING' AND "scope"='SUPPLIER';
CREATE UNIQUE INDEX "StaffInvitation_pending_platform_unique" ON "StaffInvitation"("emailNormalized") WHERE "status"='PENDING' AND "scope"='PLATFORM';
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
