-- Keep order-level payment state distinct from provider Payment attempt state.
ALTER TYPE "PaymentStatus" RENAME TO "OrderPaymentStatus";
ALTER TYPE "OrderPaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "OrderPaymentStatus" ADD VALUE 'PAID_REVIEW';

ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_CONFIRMED';
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_REVIEW';
ALTER TYPE "OrderStatus" ADD VALUE 'EXPIRED';

ALTER TYPE "SupplierOrderStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'EXPIRED';

CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIALIZATION_PENDING', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN');
CREATE TYPE "PaymentEventProcessingResult" AS ENUM ('RECEIVED', 'IGNORED', 'DUPLICATE', 'SETTLED', 'PAYMENT_REVIEW', 'FAILED_BINDING', 'NON_SUCCESS', 'ERROR');

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
  "providerReference" VARCHAR(120) NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'INITIALIZATION_PENDING',
  "currencyCode" VARCHAR(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "customerEmail" VARCHAR(320) NOT NULL,
  "authorizationUrl" VARCHAR(2048),
  "accessCode" VARCHAR(500),
  "providerAmount" DECIMAL(30,0),
  "providerCurrency" VARCHAR(3),
  "providerStatus" VARCHAR(80),
  "providerCode" VARCHAR(160),
  "providerChannel" VARCHAR(80),
  "gatewayResponse" VARCHAR(500),
  "initializedAt" TIMESTAMP(3),
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "failureCode" VARCHAR(160),
  "failureMessage" VARCHAR(1000),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "eventType" VARCHAR(160) NOT NULL,
  "eventIdentity" VARCHAR(128) NOT NULL,
  "providerEventId" VARCHAR(160),
  "providerReference" VARCHAR(120),
  "providerStatus" VARCHAR(80),
  "providerCode" VARCHAR(160),
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processingResult" "PaymentEventProcessingResult" NOT NULL DEFAULT 'RECEIVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_provider_providerReference_key" ON "Payment"("provider", "providerReference");
CREATE UNIQUE INDEX "Payment_orderId_idempotencyKey_key" ON "Payment"("orderId", "idempotencyKey");
CREATE INDEX "Payment_status_updatedAt_idx" ON "Payment"("status", "updatedAt");
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");
CREATE UNIQUE INDEX "Payment_one_success_per_order_key" ON "Payment"("orderId") WHERE "status" = 'SUCCEEDED';

CREATE UNIQUE INDEX "PaymentEvent_provider_eventIdentity_key" ON "PaymentEvent"("provider", "eventIdentity");
CREATE INDEX "PaymentEvent_paymentId_receivedAt_idx" ON "PaymentEvent"("paymentId", "receivedAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currencyCode_uppercase" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_providerCurrency_uppercase" CHECK ("providerCurrency" IS NULL OR "providerCurrency" ~ '^[A-Z]{3}$');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_terminal_timestamps" CHECK (
  ("status" = 'SUCCEEDED' AND "succeededAt" IS NOT NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'FAILED' AND "failedAt" IS NOT NULL AND "succeededAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "succeededAt" IS NULL AND "failedAt" IS NULL) OR
  ("status" IN ('INITIALIZATION_PENDING', 'PENDING', 'UNKNOWN') AND "succeededAt" IS NULL AND "failedAt" IS NULL AND "cancelledAt" IS NULL)
);
