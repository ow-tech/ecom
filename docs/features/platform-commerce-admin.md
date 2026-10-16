# Platform commerce administration

## Scope

The Platform Admin workspace is a permission-aware operational client of the
existing NestJS commerce contracts. It does not add a second commerce,
payment, inventory, support, or supplier lifecycle implementation.

## Routes and contracts

- `/platform` reads `GET /platform/operations/summary` for count-only work
  indicators.
- `/platform/suppliers` uses the platform supplier list and canonical
  approve/reject/suspend/reactivate transition endpoints.
- `/platform/categories` and `/platform/products` use platform category and
  product contracts. Product editing is deliberately separate from supplier
  pricing, stock, and SKU ownership. Product variant attributes are supplied
  as the backend's JSON attributes payload.
- `/platform/listings` reads dedicated `GET /platform/listings`, authorized by
  `platform.products.read`. It returns a paginated deterministic cross-supplier
  projection with supplier identity, product/variant, price/currency, status,
  coarse availability and dates. Supplier/product/status/search filters are
  server-side, it is read-only, and it excludes financial/customer/private data.
- `/platform/orders` reads `GET /platform/orders` and order detail. It renders
  each `SupplierOrder` independently so a parent order is never presented as
  complete when only one supplier has completed fulfilment.
- `/platform/delivery` reads platform pickup, delivery zone/rate, and quote
  contracts; quote entry sends the server amount and expiry only, and does not
  calculate a final order amount in the browser.
- `/platform/payments` exposes payment records and canonical reconciliation.
  It has no mark-paid control: initialization and redirects are not settlement
  evidence.
- `/platform/aftersales` consumes the refund, return, and warranty lifecycle
  endpoints. Provider refunds and linked return refunds remain canonical.
- `/platform/support` consumes platform ticket controls for assignment,
  lifecycle, public messages, and permission-gated internal notes.

The listing view does not aggregate supplier-scoped endpoints in the browser
and provides no listing mutation. Supplier lifecycle ownership remains in the
Supplier Workspace.

## Permission mapping

Navigation and controls use the active platform permission set. The API remains
the final authority. Notable mutation permissions are
`platform.suppliers.approve`, `platform.categories.manage`,
`platform.products.manage`, `platform.delivery.quote`,
`platform.payments.reconcile`, `platform.refunds.review`,
`platform.returns.manage`, `platform.warranties.manage`,
`platform.support.update`, and `platform.support.internal_notes`.

## Media limitation

The product-media UI manages existing storage keys and optional delivery URLs.
No binary upload endpoint or storage architecture exists in this project, so no
non-functional upload control is displayed.

## Verification and continuation

Fresh PostgreSQL 16 proof passed 4/4 catalogue HTTP tests, including platform
authorization, organization-user denial, pagination, filters, multi-supplier
projection and private-field redaction. Vitest passed 13/13 interaction tests;
backend/frontend typecheck, lint, and production builds passed. These checks do
not prove browser journeys, the complete platform control matrix or live Paystack.
The full backend regression is not green: the post-order finance suite exposed a
`P2034` outbox conflict and a history-count mismatch. Safe continuation is to
stabilize that independent regression, then run browser checks at 375px, 768px,
and 1280px.

## After-sales operations client

`/platform/aftersales` now renders a permission-aware platform client of canonical refund requests and Paystack refund evidence, return lifecycle commands, and warranty resolution. It exposes no manual mark-paid or inventory restock shortcut; see [platform-aftersales-operations.md](platform-aftersales-operations.md).

## Catalogue editing extensions

The existing `/platform/categories` and `/platform/products` now include permission-gated editing panels for category and product identity, variants, and URL media metadata. They call only platform PATCH controllers, not supplier offer/price or inventory APIs. See [platform-catalogue-editing.md](platform-catalogue-editing.md).

## Platform financial management

`/platform/finance` consumes the existing supplier financial balance and settlement APIs. It exposes server-derived draft settlement creation, approval and manually evidenced paid acknowledgment under their canonical permissions, without bank-transfer or automatic payout claims. See [platform-finance-operations.md](platform-finance-operations.md).
