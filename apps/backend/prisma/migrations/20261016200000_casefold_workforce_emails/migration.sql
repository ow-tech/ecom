-- Defend the shared user namespace even against direct Prisma/raw SQL inserts.
-- The existing emailNormalized unique column covers canonical API writes; this
-- case-folded functional index prevents a second row using differently cased
-- normalized input. If legacy rows collide, CREATE INDEX fails without deleting
-- accounts. Inspect and remediate first using the Phase 1 read-only preflight.
CREATE UNIQUE INDEX "User_emailNormalized_casefold_key"
ON "User" (LOWER(BTRIM("emailNormalized")));

-- Enforce canonical normalized input for future database writes. NOT VALID
-- preserves existing historical rows for separately audited cleanup; PostgreSQL
-- still enforces the constraint on all future INSERT/UPDATE operations.
ALTER TABLE "User" ADD CONSTRAINT "User_emailNormalized_canonical"
CHECK ("emailNormalized" = LOWER(BTRIM("emailNormalized"))) NOT VALID;
