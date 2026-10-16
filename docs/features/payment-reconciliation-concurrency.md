# Payment reconciliation race protection

## Status

IMPLEMENTED_VERIFICATION_PARTIAL. Changes committed to `dev`, but focused PostgreSQL tests and real Paystack provider operations were not executed in this session.

## Existing canonical flow

`PaymentsService` persists attempts. `PaystackClient.verify` reads provider evidence outside the DB transaction. `PaymentBindingService.validate` binds reference, amount in minor units, currency, customer email and requested channel. `PaymentSettlementService` is the **only** normal successful-settlement authority. Signed webhooks and platform/customer reconciliation use this shared seam.

## Change

`PaymentReconciliationService.lockIfUnresolved` locks the payment row and re-reads its status before persisting non-success or provider-error results. Terminal `SUCCEEDED`, `FAILED` and `CANCELLED` records are not overwritten by older in-flight verification reads. Existing settlement still handles inventory/order state atomically.

## Invariants and tests

- INV-PAY-RECON-01: Stale pending/unknown provider evidence cannot downgrade a successfully webhook-settled payment.
- INV-PAY-RECON-02: One successful Paystack charge consumes stock once; late success after cancelled/expired inventory transitions to PAYMENT_REVIEW without re-reserving stock.
- INV-PAY-RECON-03: All provider verification paths retain existing reference, amount, currency, email and channel binding validation.
- Regression: `apps/backend/test/payment-settlement.int.spec.ts` holds a mocked provider verify call, delivers a signed success webhook, releases stale pending evidence, then checks that payment, order and inventory remain settled exactly once.

## Acceptance and release gates

Run `pnpm --filter @ecom/backend test:integration` with fresh migrations/seed on a disposable PostgreSQL database. Also run affected backend typecheck/build and existing checkout frontend tests. Staging must perform real Paystack TEST Card and eligible M-Pesa transactions, signed webhook delivery, duplicate replay and provider reconciliation. The configured TEST account and public callback/webhook endpoint remain external blockers; provider doubles are not live proof.

## Safe continuation

Read `PaymentReconciliationService`, `PaymentSettlementService`, and this feature doc before any future payment work. Never add a parallel success transition or treat frontend callbacks as payment evidence.
