# Manual supplier payouts — Bank transfer and M-Pesa

## State

IMPLEMENTED_VERIFICATION_PARTIAL. Supplier capture, masked listing, immutable database record, explicitly audited privileged reveal and settlement selection are implemented across API and UI; GitHub CI tests and authenticated browser verification are the completion gates.

## Business model and money invariant

ECOM does **not** initiate supplier transfers. A platform finance operator independently sends money by bank or M-Pesa, then records a provider/bank transaction reference using the existing `APPROVED -> PAID` manual settlement command. This records one `SETTLEMENT_DEBIT`; duplicate paid commands remain idempotent.

`FinancePostingService.postCommissions` applies the effective platform commission to each completed order item, snapshots `CommissionRecord`, and posts only `supplierNetAmount = gross - commission` as a positive supplier earning. The settlement groups eligible **net** ledger entries by currency. No additional commission is subtracted during payout. Default rate is currently 10% if no supplier-specific effective rate; changing the commission percentage is a separate business decision. Prior data and edge cases can contain 0% rates and amounts that round to a zero fee; if policy requires a minimum nonzero charge for every sale, define the exact minimum and migration behavior before changing this money contract.

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

- Backend HTTP/PostgreSQL: `apps/backend/test/post-order-finance.int.spec.ts` tests cross-tenant denial, encrypted storage, masked response, platform access denial/reveal, M-Pesa KES validation/normalization, incorrect currency refusal, immutable settlement link, one net settlement debit and idempotent paid marking.
- Frontend: `apps/frontend/test/supplier-payout-destinations.test.tsx`, `apps/frontend/test/platform-finance-management.test.tsx`.
- CI: `.github/workflows/ecom-verification.yml` supplies **synthetic** test-only encryption key. Full release verification still requires real authenticated browsers, secure secrets configuration and manual payout reconciliation with actual bank/M-Pesa statements.

## Safe continuation

Do not move automatic transfers into `FinanceService.markPaid`. Do not double-deduct platform commission. Do not expose decrypted instructions on ordinary finance GET routes or in audit payloads. Any later disbursement integration needs its own fenced intent, idempotency, reconciliation and provider evidence model. Confirm commission minimum and payout currency eligibility as explicit business decisions before changing historical fee economics.
