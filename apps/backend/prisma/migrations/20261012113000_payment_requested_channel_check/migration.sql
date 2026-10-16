ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_requestedChannel_supported"
CHECK ("requestedChannel" IS NULL OR "requestedChannel" IN ('card', 'mobile_money'));
