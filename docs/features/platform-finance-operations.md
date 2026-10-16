# Platform financial settlements UI

Status: IMPLEMENTED_VERIFICATION_PARTIAL until GitHub CI and staged operational verification.

## Purpose
Platform finance operators can view currency-isolated supplier ledger balances and settlement history, create server-derived DRAFT settlement batches, approve a draft, and explicitly acknowledge an external payment with a required reference. This never initiates a bank transfer. Supplier UI stays read-only.

## Canonical map
`/platform/finance` -> `PlatformFinanceManagement` -> `lib/api.ts` -> existing `PlatformFinanceController` -> `FinanceService` -> append-only `SupplierLedgerEntry` and `SupplierSettlement`.
- Read requires `platform.finance.read`.
- Create/approve/mark paid requires `platform.settlements.manage`, with backend enforcing it.
- Draft composition uses server-claimed ledger entries; no client amount or supplier balance is trusted.
- Paid acknowledgment requires `externalReference`; browser warns and confirms independently before posting. External bank evidence must be verified by the operator.
- Existing idempotent settlement debit and concurrency protection remain exclusively in `FinanceService`.

## Known limitations
- Manual paid acknowledgment is **not** a bank payout; no live supplier-bank connector or automatic settlement execution exists.
- No sophisticated multilevel approval, export or back-office accounting systems implemented.
- Supplier picker loads current platform supplier page; larger discovery/search could be added separately.
- Test `apps/frontend/test/platform-finance-management.test.tsx` and existing `apps/backend/test/post-order-finance.int.spec.ts` through CI.

## Safe continuation
Never mark paid from a provider callback or without external evidence. Browser verify read-only finance roles, independent settlement management, balance currency groups, and replay behavior before release.

## Latest automated proof

GitHub `dev` verification run [38893118508](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend 22/22 test files and PostgreSQL HTTP integration 79/79 with fresh migrations. This is local integration proof only. Authenticated browser and external integrations remain separate release gates.
