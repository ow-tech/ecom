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

## Supplier Operational and Paid Merchandise Reporting

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Server-derived 30-day supplier order-status metrics and currency-separated gross paid merchandise, with separate order/finance RBAC gates. GitHub CI successful; authenticated browser and release verification pending.

Feature documentation: [supplier-reporting.md](features/supplier-reporting.md)

## Supplier Staff & Permissions

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Registered staff invitation, authenticated acceptance, least-privilege roles, revocation, role changes, and supplier/account UI. CI and responsive browser verification pending.

Feature documentation: [supplier-staff-management.md](features/supplier-staff-management.md)

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

## Platform Delivery Operations Queue

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Permission-scoped read-only paid delivery/pickup queue with per-supplier progress, bounded filtering, redaction and UI retries. CI/browser release proof pending.

Feature documentation: [delivery-operations-queue.md](features/delivery-operations-queue.md)

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

## Customer notification inbox

Status: LOCAL_VERIFIED. Account-owned inbox, read/unread actions, in-app category preferences and frontend regressions are implemented over canonical Nest APIs; GitHub CI run 38897430108 passed. Authenticated browser proof and external EMAIL/SMS providers remain release gates.

Feature documentation: [operational-outbox-notifications.md](features/operational-outbox-notifications.md)

## Platform background jobs monitoring

Status: LOCAL_VERIFIED. An operations-role-only sanitized outbox state/attempt/error viewer is integrated in Platform Admin. UI and HTTP/PostgreSQL CI passed in run 38897430108; authenticated browser proof remains, and the UI never exposes arbitrary job mutation.

Feature documentation: [platform-operations.md](features/platform-operations.md)

## Operational worker crash recovery

Status: LOCAL_VERIFIED. PostgreSQL lease reclamation and generation fencing protect crashed/stale claims; atomic dedupe enqueues preserve first-write event intent. Focused crash/concurrency and notification regressions passed GitHub CI run 38897430108. Production scheduler, external EMAIL/SMS provider configuration and authenticated browser evidence remain outstanding.

Feature documentation: [operational-outbox-notifications.md](features/operational-outbox-notifications.md)

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

## Customer After-Sales Requests

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Owned delivered-order UI integrates refunds, returns and warranty requests with the existing canonical backend and read-only status histories. Frontend and backend HTTP/PostgreSQL CI successful; browser/provider/physical logistics verification pending.

Feature documentation: [customer-aftersales-ui.md](features/customer-aftersales-ui.md)

## Customer Support UI

Status: Implemented; live Nest HTTP/PostgreSQL verification complete. Browser responsive verification pending.

Feature documentation: [customer-support-ui.md](features/customer-support-ui.md)

## Platform Audit Explorer

Status: IMPLEMENTED_VERIFICATION_PARTIAL. The existing platform audit nav now opens an authenticated, permission-scoped, paginated/filtered read-only audit explorer. GitHub CI successful; responsive authenticated browser proof pending.

Feature documentation: [platform-audit-explorer.md](features/platform-audit-explorer.md)

## Manual Bank and M-Pesa Supplier Payouts

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Owner-controlled encrypted payout destinations, masked supplier/platform views, privileged audited reveal and immutable selection for manual settlements are implemented. Backend/frontend CI and live operator evidence pending; no money transfer is initiated by ECOM.

Feature documentation: [manual-supplier-payouts.md](features/manual-supplier-payouts.md)

## Platform Finance and Manual Settlements

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Finance-read balances and settlement history; settlement-manage create/approve/manually acknowledge paid with required external reference and explicit confirmation. GitHub CI successful; bank-evidence and staging browser proof pending.

Feature documentation: [platform-finance-operations.md](features/platform-finance-operations.md)

## Platform Catalogue Editing

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Permission-scoped edit forms for categories, products, variants, and media metadata reuse the existing platform PATCH endpoints. GitHub CI successful; authenticated browser proof pending.

Feature documentation: [platform-catalogue-editing.md](features/platform-catalogue-editing.md)

## Platform After-Sales Lifecycle Controls

Status: IMPLEMENTED_VERIFICATION_PARTIAL. Full permission-aware platform refund review/execution/reconciliation, return-state transitions and warranty-resolution UI using canonical backend services. Frontend and PostgreSQL CI successful; live Paystack refund and browser proof pending.

Feature documentation: [platform-aftersales-operations.md](features/platform-aftersales-operations.md)

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
