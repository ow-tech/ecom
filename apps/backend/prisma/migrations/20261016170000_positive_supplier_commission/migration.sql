-- New supplier fee schedules must be nonzero. Historical 0% schedules
-- remain untouched until reviewed; NOT VALID still enforces all new writes.
-- FinancePostingService refuses to post new earnings under a legacy 0% rate.
ALTER TABLE "SupplierCommissionRate" DROP CONSTRAINT "SupplierCommissionRate_rate_range";
ALTER TABLE "SupplierCommissionRate"
  ADD CONSTRAINT "SupplierCommissionRate_rate_range"
  CHECK ("rate" > 0 AND "rate" <= 1) NOT VALID;
