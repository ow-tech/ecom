-- Legacy point fees were defined for the Kenyan marketplace; backfill KES
-- explicitly instead of silently treating their amounts as any cart currency.
-- Check legacy operational data before promoting this migration to production.
ALTER TABLE "PickupPoint" ADD COLUMN "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'KES';
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_currency_code_format" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
