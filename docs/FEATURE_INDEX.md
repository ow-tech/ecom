# Feature Index

## Foundation

Status: Implemented

Primary areas:

- `apps/frontend`
- `apps/backend`
- `docker-compose.yml`

Feature documentation: [project-foundation.md](features/project-foundation.md)

## Local QA environment

Status: Implemented for reusable local access, catalogue, inventory, pickup,
delivery, and customer-profile fixtures. Historical commerce fixtures remain
intentionally runtime-created to preserve canonical payment and lifecycle truth.

Documentation: [QA_LOCAL.md](QA_LOCAL.md)

## Identity + Organizations + Memberships + RBAC Foundation

Status: Implemented

Feature documentation: [identity-tenancy-rbac.md](features/identity-tenancy-rbac.md)

## Supplier Domain + Supplier Onboarding

Status: Implemented

Feature documentation: [supplier-domain.md](features/supplier-domain.md)

## Supplier Workspace

Status: Implemented. Overview HTTP tenancy/permission/count proof and secure-pickup jsdom interaction proof are complete; authenticated responsive browser verification remains pending.

Feature documentation: [supplier-workspace.md](features/supplier-workspace.md)

## Catalogue Foundation

Status: Implemented

Storefront browsing refinement: implemented, production-build verified, and
covered by focused React interaction plus fresh Nest HTTP/PostgreSQL filter
tests. Interactive browser/device verification remains pending.

Branded catalogue controls and debounced live product search are implemented;
full interactive browser/device verification remains pending.

Feature documentation: [catalogue-foundation.md](features/catalogue-foundation.md)

## Inventory Foundation

Status: Implemented

Feature documentation: [inventory-foundation.md](features/inventory-foundation.md)

## Customer Profile + Cart

Status: Implemented. Persistent owned address CRUD/default management is available
at `/account/addresses` and inline checkout add/edit re-rates the selected address.
Fresh HTTP/PostgreSQL proof covers ownership, default replacement, delivery fee
refresh, and immutable order snapshots; focused React address/checkout tests pass.

Feature documentation: [customer-cart.md](features/customer-cart.md)

## Customer Profile UI

Status: IMPLEMENTED_VERIFICATION_PARTIAL. The authenticated `/account/profile` route reads and updates the canonical owned customer profile, with successful/error/signed-out UI regressions added. Package tests and responsive browser release checks were not executed in this session.

Feature documentation: [customer-profile-management.md](features/customer-profile-management.md)

## Customer Account Security

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Password change/recovery UI, hashed one-time reset tokens, durable authentication throttling and session revocation are committed; migrated HTTP verification and provider-email/browser release tests remain pending.

Feature documentation: [customer-account-security.md](features/customer-account-security.md)

## Checkout + Order Foundation

Status: Implemented

Feature documentation: [checkout-order-foundation.md](features/checkout-order-foundation.md)

## Payment + Order Settlement

Status: Implemented

Feature documentation: [payment-settlement.md](features/payment-settlement.md)

## Checkout + Customer Payment UI

Status: Implemented with responsive sectioned checkout, backend-eligible branded
Card/M-Pesa selection, persistent address management, quote refresh, and focused
frontend plus real HTTP/PostgreSQL verification. Live-provider and authenticated
responsive-browser verification remain pending environment.

Feature documentation: [checkout-ui.md](features/checkout-ui.md)

## Payment Reconciliation Concurrency

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Locked re-checks prevent stale reconciliation from overwriting terminal payment status; deterministic concurrency regression added. Live PostgreSQL/provider verification pending.

Feature documentation: [payment-reconciliation-concurrency.md](features/payment-reconciliation-concurrency.md)

## Reservation Expiry

Status: Implemented

Feature documentation: [reservation-expiry.md](features/reservation-expiry.md)

## Fulfilment Foundation

Status: Implemented and integration-verified

Feature documentation: [fulfilment-foundation.md](features/fulfilment-foundation.md)

## Delivery + Pickup

Status: Implemented and integration-verified

Feature documentation: [delivery-pickup.md](features/delivery-pickup.md)

## Platform Delivery and Pickup Administration

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Platform-authorized staff can create/update pickup points (with explicit fee currency), delivery zones and rates and issue manual delivery quotations through canonical APIs. Checkout preview and prepare reject mismatched nonzero pickup-fee currencies. Frontend tests have been committed; live browser and real database verification remain release gates.

Feature documentation: [platform-delivery-management-ui.md](features/platform-delivery-management-ui.md)

## Order Tracking

Status: Implemented and integration-verified

Feature documentation: [order-tracking.md](features/order-tracking.md)

## Customer Orders UI

Status: Implemented; production build and live Nest HTTP/PostgreSQL verification complete. Browser responsive verification pending.

Feature documentation: [customer-orders-ui.md](features/customer-orders-ui.md)

## Refunds

Status: Implemented foundation

Feature documentation: [refunds.md](features/refunds.md)

## Returns + Warranties

Status: Implemented foundation

Feature documentation: [returns-warranties.md](features/returns-warranties.md)

## Supplier Finance + Settlements

Status: Implemented foundation

Feature documentation: [supplier-finance.md](features/supplier-finance.md)

Supplier-facing visibility UI is implemented at the existing Supplier Workspace
seam; focused UI and browser verification remain pending. See
[supplier-business-management-ui.md](features/supplier-business-management-ui.md).

## Operational Outbox + Notifications + Support + Audit

Status: Implemented foundation; a fresh PostgreSQL 16 migration/seed-twice run
now passes the focused outbox suite (8/8), including concurrent durable dedupe
and concurrent processor claiming. Parent-order fulfilment notification intent
and paid-supplier-order recipient wiring have focused HTTP/PostgreSQL regression
coverage. The exhaustive operational notification, summary/queue, and
privileged-audit matrices remain the safe continuation point.

Feature documentation: [operational-outbox-notifications.md](features/operational-outbox-notifications.md), [support.md](features/support.md), [platform-operations.md](features/platform-operations.md), and [audit.md](features/audit.md)

## Marketplace end-to-end integration

## Storefront navigation and filtering

Status: Implemented with full frontend static/type/lint/build checks, focused
Cart/filter React tests, and fresh HTTP/PostgreSQL filter verification. The
public catalogue supports safe URL-backed filters and deterministic sorts;
the shared storefront header is sticky with an authoritative cart icon/count,
and product add feedback uses a measured, reduced-motion-safe flight plus a
four-second confirmation. Responsive browser verification remains pending.

Chromium visual QA has started on the persistent populated fixture. Catalogue
screenshots at 375/768/1280 show no horizontal overflow; the mobile Filters
button failed to open its dialog in that browser pass, so responsive storefront
verification is not complete.

Feature documentation: [catalogue-foundation.md](features/catalogue-foundation.md),
[frontend-design-system.md](features/frontend-design-system.md), and
[customer-cart.md](features/customer-cart.md)

Status: Implemented and real HTTP/PostgreSQL integration-verified using
`test/marketplace-e2e.int.spec.ts`. The cohesive fixture covers platform
catalogue, supplier onboarding/listing/stock, public catalogue, idempotent
multi-supplier checkout, deterministic Paystack evidence, fulfilment, tracking,
support privacy, and cross-supplier denial. Live browser, Paystack sandbox, and
external image delivery remain separate release verification.

## Customer Support UI

Status: Implemented; live Nest HTTP/PostgreSQL verification complete. Browser responsive verification pending.

Feature documentation: [customer-support-ui.md](features/customer-support-ui.md)

## Platform Commerce Administration UI

Status: Implemented UI and canonical contract wiring. Cross-supplier listing
oversight has focused real HTTP/PostgreSQL proof; remaining platform control
matrix and authenticated browser verification remain pending.

Feature documentation: [platform-commerce-admin.md](features/platform-commerce-admin.md)

## Supplier Business Management UI

Status: Implemented and integration-verified. Supplier ledger pagination uses
the standard bounded page contract, and focused React plus real Nest/PostgreSQL
finance/settlement/return/warranty/support regressions pass. Authenticated
responsive browser verification remains pending.

Feature documentation: [supplier-business-management-ui.md](features/supplier-business-management-ui.md)
# One-page checkout + Paystack Card/M-Pesa

Status: implemented with frontend interaction, fresh migrations, focused real
Nest/PostgreSQL verification, and authenticated local Chrome checks at 375px
and 1280px. Pay redirects to the backend-returned Paystack hosted authorization
URL; safe rejected-configuration and uncertain-network states are regression
covered. The configured actual-looking TEST key returns HTTP 401 and the QA key
is synthetic, so live Paystack TEST
Card/M-Pesa, merchant capability, and public webhook delivery remain unverified
release gates.

Feature documentation: [one-page-checkout-paystack.md](features/one-page-checkout-paystack.md)
