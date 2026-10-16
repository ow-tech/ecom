# Configurable marketplace commission policy

## Status
LOCAL_VERIFIED. Effective-dated global default, supplier overrides, supplier-facing effective rate, audited admin mutations, and canonical net-earnings resolution are committed to `dev` and verified by GitHub CI [38909868176](https://github.com/ow-tech/ecom/actions/runs/38909868176): backend unit 23/23, frontend 26/26 test files, HTTP/PostgreSQL integration 84/84, 17 migrations, typecheck/lint/build passed. Authenticated browser and real payout statement verification remain release gates.

## Business rules
- The initial ECOM platform default commission is **10%** (0.100000), sourced from validated backend `DEFAULT_COMMISSION_RATE` until a platform-managed default setting exists.
- Platform finance users with `platform.finance.adjust` may change the default percentage through `/platform/finance`. Each change creates an effective-dated `PlatformCommissionRate`; history is retained. `platform.finance.read` provides read-only projection.
- A supplier may have its own rate using the existing effective-dated `SupplierCommissionRate` contract. The active supplier rate takes precedence over the platform default. Otherwise the most recent platform default at `earnedAt` applies, falling back to the configured initial rate when no platform record exists.
- Platform finance can set the selected supplier override, or end active overrides to revert to the default. Future scheduled overrides must be resolved before using revert; this avoids silent reactivation after a reset.
- All rates must be strictly greater than zero and at most 100%. Changing rates does **not** recalculate historical commission records, refunds, ledger entries or paid settlements.
- The effective rate is resolved in the same PostgreSQL transaction as canonical `FinancePostingService.postCommissions`, which snapshots the rate on the immutable `CommissionRecord`.
- A commission is deducted **once**, from each eligible completed order item. The supplier ledger receives `supplierNetAmount = grossAmount - commissionAmount`. Settlement and bank/M-Pesa manual payout only use net ledger entries and must not deduct commission again.
- Existing Decimal half-up currency-precision rounding means a very small sale can produce a zero-cent fee even with a strictly positive rate; a monetary minimum fee is not defined. No speculative minimum has been introduced.

## Source of truth
- Prisma `PlatformCommissionRate`: immutable rate/version, effective timestamp, actor reference; migration `20261016180000_platform_default_commission`.
- `CommissionPolicyService`: `effectiveAt(tx, supplierId, earnedAt)`, `defaultAt`, versioned default mutations, supplier effective view, and reset to fallback.
- `FinancePostingService`: calls shared policy resolver before recording `CommissionRecord`.
- `FinanceService`: scoped read/mutation and audited supplier rate creation, supplier RBAC and platform RBAC.
- `GET /platform/finance/default-commission`, `POST /platform/finance/default-commission` for platform-default read and change.
- `GET /platform/finance/suppliers/:supplierId/commission-policy`, `POST /platform/finance/suppliers/:supplierId/commission-rates`, `POST /platform/finance/suppliers/:supplierId/commission-rate/reset` for overrides.
- `GET /organizations/:organizationId/finance/commission-policy` for owner-scoped current effective-rate visibility.
- Frontend `PlatformCommissionManagement` embedded in Platform Finance and `SupplierCommissionOverview` embedded in Supplier Finance, integrated via `apps/frontend/lib/api.ts`.

## Security and audit
- Platform writes require `platform.finance.adjust`; platform views require `platform.finance.read`.
- Supplier reads require verified active organization membership and `finance.read`. The URL-supplied organization ID alone cannot establish authorization.
- Default changes and supplier override creation/reset produce append-only audit evidence; the current effective rate is not browser-owned money.
- Future/posting effective timestamp semantics are intentional; no backdated supplier rate creation through the platform endpoint.

## Acceptance and regression
- Test initial fallback 0.100000 and nonzero validation.
- Set platform default to 0.125000; unconfigured supplier inherits it.
- Give supplier A a 0.075000 override; commission on a USD 10 eligible line records 0.75 fee and 9.25 net.
- Set default to 0.200000, then revert supplier A; it inherits 0.200000 while its older completed commission stays 0.075000.
- Supplier B with no override records USD 2 fee and USD 8 net on a USD 10 eligible line after the default update.
- Cross-tenant and platform role checks; no second commission on manual bank/M-Pesa payouts.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, frontend Vitest, fresh PostgreSQL migrations/seed, all backend integration tests; verify current CI run ID. Browser test 375/768/1280 before production.

## Safe continuation
Do not introduce a second finance ledger, user-selected commission at checkout, or mutation of historical commission records. The new current default is a platform-managed DB record; `DEFAULT_COMMISSION_RATE` remains a 10% startup/fallback input rather than an overriding runtime setting. Supplier historical schedules can include future effective periods; reverting refuses such cases until they are explicitly resolved. The business has not requested an amount-based minimum for micro-transactions.
