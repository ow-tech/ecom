# Supplier operational and gross-paid reporting

Status: IMPLEMENTED_VERIFICATION_PARTIAL until current `dev` CI and authenticated browser QA.

## Contract
`GET /organizations/:organizationId/reports` requires an active membership with `supplier.read`. Response contains permission-scoped authoritative supplier overview metrics, 30-day counts by SupplierOrder status (orders.read only), and 30-day currency-grouped paid SupplierOrder merchandise subtotal (finance.read only). Unauthorized report sections are `null`, not zero, and never computed by summing a paginated browser list.

## Ownership and invariants
- Tenant identity is derived only through `RbacService.organizationContext`; supplier is resolved by that verified organization.
- Order status counts require `orders.read`. Financial totals require `finance.read`.
- Gross paid merchandise is the SUM of SupplierOrder.subtotal where parent Order.paymentStatus=PAID, grouped by the actual Order.currencyCode. It is **not** net revenue, supplier earnings, commission income, settled balance or profit, and is before any refunds/returns.
- Source queries are grouped server-side and never leak another supplier's orders.
- Refresh reloads authoritative state; null permission data is omitted from the UI.

## Implementation
- Backend: `SupplierReportsService`, `SupplierReportsController`, `SuppliersService.overview`, `RbacService`.
- Frontend: `SupplierReports` at `/supplier/:organizationId/reports` via `api.supplierReport`.
- Database: existing order, supplier order, listing and inventory records; no migration.
- Tests: `apps/backend/test/supplier-domain.int.spec.ts` and `apps/frontend/test/supplier-reports.test.tsx`.
- Operations: no external accounting, payout or ledger modifications.

## Safe continuation
Keep financial report guards independent of nav visibility. Full accounting/expense features remain separate business modules. For additional trends, use canonical ledger and financial source-of-truth definitions before creating net-sales/profit visualizations.

## Latest automated proof

GitHub `dev` verification run [38893118508](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend 22/22 test files and PostgreSQL HTTP integration 79/79 with fresh migrations. This is local integration proof only. Authenticated browser and external integrations remain separate release gates.
