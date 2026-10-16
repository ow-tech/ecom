# Manual supplier payouts — Bank transfer and M-Pesa

## State

LOCAL_VERIFIED. Supplier capture, masked listing, immutable database record, explicitly audited privileged reveal and settlement selection are implemented across API and UI. GitHub CI run 38901310001 passed; authenticated browser and independent actual payout evidence remain release gates.

## Business model and money invariant

ECOM does **not** initiate supplier transfers. A platform finance operator independently sends money by bank or M-Pesa, then records a provider/bank transaction reference using the existing `APPROVED -> PAID` manual settlement command. This records one `SETTLEMENT_DEBIT`; duplicate paid commands remain idempotent.

`FinancePostingService.postCommissions` applies the effective platform commission to each completed order item, snapshots `CommissionRecord`, and posts only `supplierNetAmount = gross - commission` as a positive supplier earning. The settlement groups eligible **net** ledger entries by currency. No additional commission is subtracted during payout. Default rate is currently 10% if no supplier-specific effective rate; changing the commission percentage is a separate business decision. The policy now requires a **strictly positive percentage** for every new commission rate and the configured fallback; new zero-rate schedules are blocked in the API and database. Posting fails closed if it encounters a legacy 0% rate, so existing historical rates must be reviewed before the next eligible fulfilment. Existing immutable commission records/settlements are not rewritten. Small sales can still round to a zero monetary fee (for example a USD 0.04 sale at 10%); a minimum fee per sale is a separate commercial policy requiring an explicit amount and treatment of tiny purchases.

## Domain model

`SupplierPayoutDestination`: immutable payee details (BANK or MPESA), owner supplier, currency, name, bank display metadata, encrypted instructions, last-four display, active status. A supplier changes bank or M-Pesa details by creating a new destination and disabling the previous one; existing settlements keep their selected destination ID. `SupplierSettlement.payoutDestinationId` is nullable for legacy/manual compatibility. No new integration automatically executes transfers.

Migration: `20261016160000_supplier_payout_destinations` is additive.

## Sensitive data and access

- `PAYOUT_DETAILS_ENCRYPTION_KEY`: 32 random bytes as 64 hex characters, supplied only to NestJS via a secret store. Application fails closed on write or reveal without it. AES-256-GCM per record with a random nonce; the supplier ID is authenticated additional data.
- Supplier read: active membership + `finance.read`; masked summaries only.
- Supplier create/disable: active membership + `organization.members.manage` (owner). No in-place editing, and no full secret shown in supplier lists.
- Platform masked read: `platform.finance.read`. Full reveal: **POST** `/platform/finance/suppliers/:supplierId/payout-destinations/:id/reveal` requires `platform.settlements.manage`, returns no-store, and emits a redacted audit event. Raw account numbers, IBAN and M-Pesa phone are not logged or included in audit metadata.
- M-Pesa supports KES and normalizes 07/01 Kenyan numbers to `+254...`; the registered account name is mandatory. Bank requires name, ISO country code, valid SWIFT/BIC, and either a plausible IBAN or account number. Bank payout currency is selected per destination.
- No external bank account-owner verification, IBAN checksum confirmation, SMS verification, KYC or disbursement provider is claimed.

## UI workflow

Supplier → `/supplier/:organizationId/finance`: register bank or M-Pesa destination, view masked records, disable old records. Admin → `/platform/finance`: select supplier, settlement currency and **currency-compatible active** destination, then create draft from backend ledger. Approval and manual paid acknowledgment stay unchanged; explicit privileged reveal shows bank/M-Pesa details only when requested. Legacy settlements without a linked destination warn operators to verify payment details independently.

## Tests / validation

- Backend HTTP/PostgreSQL (CI run 38901310001: **83/83**): `apps/backend/test/post-order-finance.int.spec.ts` tests cross-tenant denial, encrypted storage, masked response, platform access denial/reveal, M-Pesa KES validation/normalization, incorrect currency refusal, immutable settlement link, one net settlement debit and idempotent paid marking.
- Frontend: `apps/frontend/test/supplier-payout-destinations.test.tsx`, `apps/frontend/test/platform-finance-management.test.tsx`.
- CI: `.github/workflows/ecom-verification.yml` supplies **synthetic** test-only encryption key. Full release verification still requires real authenticated browsers, secure secrets configuration and manual payout reconciliation with actual bank/M-Pesa statements.

## Safe continuation

Do not move automatic transfers into `FinanceService.markPaid`. Do not double-deduct platform commission. Do not expose decrypted instructions on ordinary finance GET routes or in audit payloads. Any later disbursement integration needs its own fenced intent, idempotency, reconciliation and provider evidence model. Confirm commission minimum and payout currency eligibility as explicit business decisions before changing historical fee economics.

## Verified implementation snapshot

[GitHub CI 38901310001](https://github.com/ow-tech/ecom/actions/runs/38901310001) passed: backend 23/23 unit tests; 25/25 frontend test files; 83/83 real HTTP/PostgreSQL integration tests; all 15 migrations; TypeScript, lint, and production builds. The payout integration fixture produces a $100 sale, records 10% ($10) commission, posts $90 supplier net earnings, creates a $90 bank-selected draft, and proves a single $90 settlement debit after manual paid acknowledgment; no double fee and no external money transfer. Protected reveal and server-only AES-GCM storage also pass integration. Browser/staging and external bank/M-Pesa statement evidence remain unverified.

## Strictly positive commission schedule (2026-10-16)

Supplier sales must use a commission percentage greater than 0 and at most 100%. The existing `DEFAULT_COMMISSION_RATE` remains **10%** (0.10) unless configured otherwise; no business percentage change was inferred. Supplier-specific effective rates remain available, but 0% schedules cannot be created. A forward PostgreSQL migration replaces the old 0–100% schedule constraint with a `NOT VALID` positive-rate constraint to avoid silently modifying historical records; it applies to all future INSERT/UPDATE writes. `FinancePostingService.postCommissions` rejects an old zero-rate row rather than giving an unpaid platform fee away. A zero-cent rounded commission on a tiny sale still needs a specified minimum-fee rule. Settlement `netAmount` continues to derive from existing post-commission ledger entries, with no second deduction at payout. HTTP/database regression proves zero-rate denial and keeps the existing half-up rounding cases.

## Verification of strictly positive commission policy

The updated `dev` CI run [38904493490](https://github.com/ow-tech/ecom/actions/runs/38904493490) passed all TypeScript/lint/build checks, 23 backend unit tests, 25 frontend test files, 83 HTTP/PostgreSQL integration tests, and 16 migrations. The finance regression asserts that the platform endpoint rejects 0% schedules (HTTP 400) and PostgreSQL rejects new 0% rate records. The default remains 10%, with positive supplier-specific schedules supported. For tiny payments whose commission rounds to zero in the currency's minor unit, a separate minimum cash-fee decision is still required; no new fee amount was invented.

## Adjustable commission default

Initial standard commission: **10%**. Platform finance may adjust the global fallback; a supplier-specific rate takes precedence only while effective. Both are evaluated during fulfilment commission posting. Bank and M-Pesa settlement balances are already net, and manual paid acknowledgement does not subtract the marketplace fee again. See [configurable-commission-policy.md](configurable-commission-policy.md).
