-- Account-audience cutover is deliberately fail-closed: do not relabel a
-- user who already owns BOTH customer-commerce history and workforce roles.
-- Read-only preflight report: docs/features/account-audience-phase1.md
CREATE TYPE "AccountAudience" AS ENUM ('CUSTOMER', 'WORKFORCE');
ALTER TABLE "User" ADD COLUMN "accountAudience" "AccountAudience" NOT NULL DEFAULT 'CUSTOMER';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" u
    WHERE EXISTS (SELECT 1 FROM "CustomerProfile" p WHERE p."userId" = u.id)
      AND (
        EXISTS (SELECT 1 FROM "OrganizationMembership" m WHERE m."userId" = u.id)
        OR EXISTS (SELECT 1 FROM "PlatformRoleAssignment" a WHERE a."userId" = u.id)
      )
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_AUDIENCE_CONFLICT: mixed customer/workforce users exist. Run preflight, remediate via audited alternate email; no automatic customer-data reassignment.'
      USING ERRCODE = '23514';
  END IF;
END $$;

UPDATE "User" u SET "accountAudience" = 'WORKFORCE'
WHERE EXISTS (SELECT 1 FROM "OrganizationMembership" m WHERE m."userId" = u.id)
   OR EXISTS (SELECT 1 FROM "PlatformRoleAssignment" a WHERE a."userId" = u.id);

-- Guard ALL writers including direct Prisma writes. Row-level locking on User
-- serializes concurrent customer profile and membership/role assignment.
CREATE FUNCTION ecom_assert_account_audience() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE audience "AccountAudience";
DECLARE owner_id uuid;
DECLARE required_audience "AccountAudience";
BEGIN
  IF TG_TABLE_NAME = 'CustomerProfile' THEN
    owner_id := NEW."userId"; required_audience := 'CUSTOMER';
  ELSIF TG_TABLE_NAME = 'OrganizationMembership' THEN
    owner_id := NEW."userId"; required_audience := 'WORKFORCE';
  ELSE
    owner_id := NEW."userId"; required_audience := 'WORKFORCE';
  END IF;
  SELECT u."accountAudience" INTO audience FROM "User" u WHERE u.id = owner_id FOR UPDATE;
  IF audience IS DISTINCT FROM required_audience THEN
    RAISE EXCEPTION 'ACCOUNT_AUDIENCE_MISMATCH: expected % for user %', required_audience, owner_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "customer_profile_audience" BEFORE INSERT OR UPDATE OF "userId" ON "CustomerProfile"
FOR EACH ROW EXECUTE FUNCTION ecom_assert_account_audience();
CREATE TRIGGER "membership_workforce_audience" BEFORE INSERT OR UPDATE OF "userId" ON "OrganizationMembership"
FOR EACH ROW EXECUTE FUNCTION ecom_assert_account_audience();
CREATE TRIGGER "platform_role_workforce_audience" BEFORE INSERT OR UPDATE OF "userId" ON "PlatformRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION ecom_assert_account_audience();
CREATE FUNCTION ecom_lock_account_audience() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."accountAudience" IS DISTINCT FROM OLD."accountAudience" THEN
    RAISE EXCEPTION 'ACCOUNT_AUDIENCE_IMMUTABLE: existing audience cannot be changed through normal writes'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "account_audience_immutable" BEFORE UPDATE OF "accountAudience" ON "User"
FOR EACH ROW EXECUTE FUNCTION ecom_lock_account_audience();
