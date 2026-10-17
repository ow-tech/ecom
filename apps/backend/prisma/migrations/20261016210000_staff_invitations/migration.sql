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

-- INV-EMAIL-01: direct SQL / Prisma writes must respect pending workforce
-- email reservations. The advisory lock is shared with AuthService.register
-- and StaffInvitationsService.invite, closing customer/invite races.
CREATE FUNCTION enforce_staff_email_reservation_on_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."accountAudience" = 'CUSTOMER' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(NEW."emailNormalized")), 0));
    IF EXISTS (
      SELECT 1 FROM "StaffInvitation" i
      WHERE i."emailNormalized" = lower(btrim(NEW."emailNormalized"))
        AND i."status" = 'PENDING'
        AND i."expiresAt" > CURRENT_TIMESTAMP
    ) THEN
      RAISE EXCEPTION 'Email reserved for workforce invitation' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_pending_staff_invitation_guard"
BEFORE INSERT OR UPDATE OF "accountAudience", "emailNormalized" ON "User"
FOR EACH ROW EXECUTE FUNCTION enforce_staff_email_reservation_on_user();

CREATE FUNCTION enforce_staff_invitation_recipient()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'PENDING' AND NEW."expiresAt" > CURRENT_TIMESTAMP THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."emailNormalized", 0));
    IF EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."emailNormalized" = NEW."emailNormalized"
        AND (u."accountAudience" <> 'WORKFORCE' OR u."status" <> 'ACTIVE')
    ) THEN
      RAISE EXCEPTION 'Email unavailable for workforce invitation' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StaffInvitation_recipient_audience_guard"
BEFORE INSERT OR UPDATE OF "emailNormalized", "status", "expiresAt" ON "StaffInvitation"
FOR EACH ROW EXECUTE FUNCTION enforce_staff_invitation_recipient();
