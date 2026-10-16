# Project State

## Current architecture

The platform is a modular monolith: a Next.js browser application calls a
NestJS backend, which owns business logic and persistence access. PostgreSQL
is the primary data store and Redis is local supporting infrastructure.

## Current stack

- Frontend: Next.js App Router, TypeScript, Tailwind CSS
- Backend: NestJS, TypeScript, Prisma
- Infrastructure: PostgreSQL 17, Redis 7, Docker Compose
- Workspace: pnpm workspaces

## Current applications and packages

- `apps/frontend`: implemented Next.js customer storefront, account/checkout UI and supplier/platform workspaces; authenticated browser verification remains a release gate
- `apps/backend`: modular commerce backend with canonical identity, inventory, checkout, payment, fulfilment, finance and operations modules
- `packages/shared-types`: reserved for explicit cross-application contracts

## Current infrastructure

`docker-compose.yml` provisions local PostgreSQL and Redis with persistent
named volumes, health checks, and localhost ports.

An opt-in persistent QA workflow is available through `pnpm qa:up`. It uses an
isolated Compose project/database (`ecom-qa` / `ecom_local_qa`), guarded,
idempotent base fixtures, and ignored local credentials. See [QA_LOCAL.md](QA_LOCAL.md).

## Master roadmap and execution order

The active implementation plan is [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). Phases 1–3 cover exclusive customer/workforce emails, supplier-owner/admin role-based email invitations, and a protected platform head-admin/staff directory. The roadmap then tracks notifications (13), overseas sourcing (15), CRM (16), accounting/expenses (17), analytics (18), CMS/marketing/SEO (19), while production infrastructure (20) starts in parallel. A roadmap entry is a plan, not verified runtime functionality.

## Next planned identity/administration delivery

Customer/admin email separation, email-based staff onboarding and the platform head-admin management interface are NOT IMPLEMENTED. Follow [administrative-identities-invitations-plan.md](features/administrative-identities-invitations-plan.md) in order: conflict preflight and account-audience boundaries → supplier admin delegation/invitation email → super/head-admin hierarchy and platform staff UI. Do not grant `organization.members.manage` broadly to supplier admins; it currently also controls sensitive payout-destination writes.

## Current feature delivery — 2026-10-16

- Customer account profile and security: `/account/profile`, `/account/security`, `/forgot-password`, `/reset-password`; existing owned profile API, password change, single-use hashed reset tokens, session revocation and cross-replica throttling. Recovery email requires configured Resend sender; live email/browser validation remains.
- Checkout/Paystack: canonical settlement retained; payment reconciliation now locks and re-checks terminal state before stale verification writes; the race is covered by a focused integration regression. Live Paystack TEST Card/M-Pesa and public webhook validation remain release gates.
- Delivery/pickup: platform admin can manage pickup points, zones/rates, manual quotations. `PickupPoint.currencyCode` explicitly governs nonzero pickup fees; checkout preview and prepare reject mismatched fee currency and frontend filters compatible points. The forward migration backfills historical points as KES; validate legacy pricing before staging/prod promotion.
- GitHub `dev` CI workflow executes typecheck, lint, builds, unit/frontend tests, fresh PostgreSQL migrations/seed, and integration tests using synthetic provider configuration. Refer to the latest GitHub Actions run for current results; prior historical results are not proof of the newest revision.

## Marketplace operations continuation — 2026-10-16

- **Platform admin:** a permission-scoped, read-only `/platform/operations` background-job explorer now exposes sanitized outbox status, attempts and failure codes. Existing platform catalogue, finance, supplier, audit and support controls remain their canonical sources.
- **After-sales:** admin refund/return/warranty views now fence stale data and report a post-action refresh as successful only after the canonical backend read succeeds. Real provider refunds, replacement/repair logistics and authenticated browser workflows remain separate release gates.
- **Supplier settlements:** external manual-payment references are normalized, and whitespace-only references are rejected before paid marking or ledger debits. This is not a bank payout or automatic reconciliation integration; choose an external payout provider before implementing it.
- **Notifications:** recipient-owned `/account/notifications` supports pagination, read/unread updates and optional in-app preferences. Email/SMS remain NOT_CONFIGURED without adapters/credentials and real delivery evidence.
- **Background jobs:** outbox crash recovery uses lease expiration and stale-worker fencing; concurrent outbox writes use PostgreSQL-native `INSERT ... ON CONFLICT DO NOTHING` with authoritative winner lookup. Existing one-shot worker still needs deployment scheduling and monitoring.
- **Verified CI:** [run 38897430108](https://github.com/ow-tech/ecom/actions/runs/38897430108) passed backend unit 23/23, frontend 24/24 test files, HTTP/PostgreSQL integration 82/82, 14 migrations, typecheck, lint and production builds. No real email/SMS, bank transfers or Paystack refund activity was performed.

## Configurable marketplace commission — 2026-10-16

- The initial 10% default is now editable in Platform Finance and stored as an effective-dated `PlatformCommissionRate` with audit evidence. Suppliers have optional effective-dated overrides; no active supplier override inherits the current platform default, then the environment fallback if no platform setting has ever been created.
- Supplier Finance displays the effective rate and base rate. Updates only affect eligible future fulfilment postings; historical `CommissionRecord` and net ledger entries remain unchanged.
- The canonical commission/settlement flow continues to deduct the fee once at earning, not at manual bank/M-Pesa payout. Commission rate configuration passed CI 38909868176; authenticated browser and payout release checks remain outstanding.
- Feature documentation: [configurable-commission-policy.md](features/configurable-commission-policy.md).

## Manual supplier payout destination feature — 2026-10-16

- Bank transfers and Kenyan M-Pesa are manual platform-controlled payouts: supplier owners register encrypted instructions; platform finance chooses a currency-matched recipient while creating a settlement draft and may explicitly reveal full instructions with audit evidence.
- Payment remains external. Finance only records an approved settlement as PAID after independent confirmation and a transaction reference, with one idempotent `SETTLEMENT_DEBIT`. Supplier net ledger earnings already exclude platform commissions; payout must not deduct commission a second time.
- Existing configurable commission default is **10%**. A new fee-policy migration (`20261016170000_positive_supplier_commission`) prevents **new 0% rates**, and fulfilment posting rejects any legacy effective 0% schedule until reviewed; previously recorded sales and settlements remain unchanged. Very small gross amounts can still round a percentage to a zero-cent fee, so define a currency-specific minimum only if required by the business.
- New backend encryption secret `PAYOUT_DETAILS_ENCRYPTION_KEY` is required for destination create/reveal and must be kept in server-only secret management; schema migration is additive. No actual bank/M-Pesa payout provider is connected.
- GitHub CI [38901310001](https://github.com/ow-tech/ecom/actions/runs/38901310001) passed 23 backend unit tests, 25 frontend test files, 83 HTTP/PostgreSQL integration tests and 15 migrations. The canonical payout test asserts $100 gross, $10 commission, $90 earnings, $90 manual paid debit and one payout record under retry.

## Current operational feature baseline — 2026-10-16

Latest passing GitHub `dev` CI revision (before this documentation update): `05416ef25375f376f81cc337f49fa43fde5bb989`; [ECOM verification run](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend test files 22/22, and real HTTP/PostgreSQL integration 79/79 using all 14 migrations. Lint, typecheck, builds, migrated DB seed and full integration checks passed. This is not live provider, browser/device or production deployment proof.

- **Delivery / pickup**: `GET /platform/delivery/operations` projects permission-checked paid parent-order and supplier-order progress with bounded filters, privacy-safe fields and customer-independent operational visibility. Admin pickup, zone, rate and manual quote configuration remain canonical. Physical third-party courier dispatch/tracking integrations remain absent.
- **Supplier portal**: active-organization staff management (`/supplier/:org/staff`) has registered-account invitations, recipient acceptance (`/account/invitations`), scoped owner-delegated roles and revocation. Supplier reporting (`/supplier/:org/reports`) returns canonical operational counts and finance-gated, currency-separated gross paid merchandise; it is not supplier net earnings or settlement liability.
- **Platform admin**: existing supplier lifecycle/listings and order/customer-aggregate workflows now additionally expose PATCH-based category/product/variant/media metadata editing, evidence-led platform finance settlements and a `platform.audit.read`-gated audit explorer. Paid-settlement marking is a manual acknowledgment of an external payment, not a bank transfer; no arbitrary mark-paid on orders.
- **After-sales**: `/platform/aftersales` exposes canonical refund review/execution/reconciliation, return stages, warranty stages and resolutions through permission-aware UI. `/account/orders/:id/after-sales` supports owned item-specific refund, return and warranty request submission and status visibility. Provider refund money and historical ledger posting remain backend-owned. Existing customer requests are not themselves approval or proof of transferred money.
- **Release gates**: authenticated browser/staging on all roles and viewports, live Paystack TEST including provider refunds and public webhooks, actual recovery email, any external courier/physical reverse logistics, external bank payout evidence, production deployment/TLS/restore rehearsals and review of legacy KES pickup fee backfill remain unverified.

## Implemented features

- One-page checkout preview, prepare, and Paystack Card/M-Pesa selection. M-Pesa
  is feature-gated server-side (`PAYSTACK_MPESA_ENABLED`) and only available for
  KES. Pending/unknown confirmation, refresh recovery, resume, and rate-limited
  authoritative verification remain on `/checkout`; the legacy payment route is
  retained for callback, history, and recovery. Fresh migration, focused
  Nest/PostgreSQL and frontend interaction proof pass; authenticated local
  Chrome at 375px/1280px covers checkout layout, while a controlled provider
  double covers the server-returned hosted redirect and accessible unknown/error states. The
  configured TEST credential returns HTTP 401, so actual provider transactions,
  merchant M-Pesa eligibility, and public webhook delivery remain pending.
- Customer delivery addresses now have a dedicated `/account/addresses` experience
  with add, view, edit, delete, and explicit default management. Checkout shares the
  complete address form, re-previews delivery fees after selected-address edits, and
  retains the existing immutable order-address snapshot boundary. Focused React and
  fresh HTTP/PostgreSQL ownership/rating/snapshot tests pass; authenticated responsive
  browser verification remains pending.

- Repository foundation
- Frontend shell
- Frontend design-system consolidation across storefront, authentication,
  cart/checkout, account, supplier, and platform surfaces. Cart and checkout
  now share canonical summary, money, form, selectable-card, and quantity
  controls. Customer payment/order continuity now uses the same system: prepared
  orders open a canonical payment/detail route, initialize Paystack through the
  backend, and use bounded server-status confirmation without treating redirects
  or client timeouts as payment proof.
- Storefront shopping refinement: server-confirmed Add to Cart stays on the
  product page, updates the canonical CartProvider count, and uses a sticky
  shared storefront header with a visible cart icon/count, decorative measured
  800ms desktop / 1000ms mobile flight, pulse, and four-second product/variant
  confirmation with reduced-motion fallback. Cart exposes a
  safe Continue Shopping return to the last `/products` URL. Catalogue category
  navigation is query-backed, touch-scrollable, and uses request-fenced,
  ProductCard-shaped skeletons while filters load. Focused React tests cover
  Cart confirmation/failure and filter response fencing; rendered browser/mobile
  verification remains pending.
- Public catalogue filtering now has URL-backed category, supplier, currency,
  Decimal price range, and stable product sorting semantics. The canonical
  product endpoint filters eligible offers before pagination and returns safe
  filter metadata. A fresh disposable PostgreSQL 16/Nest HTTP suite covers
  eligibility-before-pagination, decimal price bounds, exact totals, sorting,
  and safe projections. Responsive browser verification remains pending. Cart continuation is now an outline action and
  Clear Cart is confirmed before its canonical mutation.
- Storefront catalogue Supplier, Currency, and Sort now use a scoped branded,
  collision-aware portal select without changing native controls in checkout or
  workspaces. Search is live after a two-character/400ms threshold, reuses one
  response for suggestions and grid, aborts/fences stale calls, and uses bounded
  query caching. Full browser QA remains pending.
- Backend shell
- Local PostgreSQL
- Local Redis
- Identity, server-side sessions, organizations, memberships, and scoped RBAC
- Supplier domain, onboarding, platform review, and append-only lifecycle history
- Supplier operational workspace: permission-aware organization switching, live supplier profile, searchable safe product/variant selection, listing edit/lifecycle, inventory receipt/removal/manual adjustment, supplier-order and secure pickup/delivery fulfilment views using canonical scoped APIs. A fresh PostgreSQL 16 migration/seed-twice run and focused real Nest loopback HTTP suite now prove the overview tenant/permission matrix and aggregate totals (22 active listings, 2 stock-attention items, 2 preparing, 2 ready; values remain correct beyond ordinary list pagination). Vitest/jsdom interaction tests protect overview retry/permission omission, listing selection, inventory conflict refresh, stale organization responses, and secure pickup completion including code privacy and authoritative conflict refresh. SUPPLIER_WORKSPACE_IMPLEMENTATION: COMPLETE. SUPPLIER_WORKSPACE_RELEASE_VERIFICATION: BROWSER_PENDING.
- Catalogue foundation: platform categories, products, variants and media metadata; supplier-owned offers
- Inventory foundation: supplier locations, stock levels, append-only movements, atomic reservations, and real PostgreSQL/Nest HTTP concurrency verification
- Customer commerce core: lazy customer profiles, owned delivery addresses, server-priced carts, idempotent checkout, owned inventory reservations, multi-supplier orders, immutable order snapshots, history, and unpaid cancellation
- Paystack payment attempts, signed webhook evidence, server-side verification, atomic order settlement, payment reconciliation, and exact-once reservation expiry
- SupplierOrder fulfilment lifecycle and append-only operational tracking
- Platform pickup points, pickup checkout fees/snapshots, and hashed collection verification
- Delivery zones/rates, manual delivery quotes before payment, and customer tracking
- Refund request/provider-refund foundation with Paystack reconciliation evidence and focused real HTTP/PostgreSQL verification
- Return requests, immutable warranty snapshots/claims, supplier commissions, append-only ledger, and manual settlement batches with focused real HTTP/PostgreSQL financial/concurrency verification
- Supplier business-management UI: permission-aware finance, settlement, return, warranty, and support views in the established Supplier Workspace. It uses only canonical supplier-scoped APIs and preserves platform-only financial and after-sales lifecycle actions. Supplier ledger reads use bounded offset pagination with `createdAt DESC, id DESC` ordering and authoritative balance separation. The focused 11-case Supplier Workspace React suite, 14-case financial/after-sales HTTP suite, and 8-case support/operations HTTP suite pass on a fresh seeded PostgreSQL 16 database; authenticated responsive browser verification remains release-verification debt.
- Post-order finance verification now also includes focused least-privilege refund/finance RBAC, cross-customer and cross-supplier read denial, and direct PostgreSQL financial constraint proof
- Post-order finance verification includes real concurrent canonical commission completion and settlement mark-paid races; mark-paid retries PostgreSQL serializable conflicts before returning its idempotent result
- Post-order finance verification is complete: real HTTP/PostgreSQL coverage now proves item-scoped projections for shared multi-supplier returns, warranty REFUND retry/concurrency exact-once behavior, and non-positive, currency-isolated, and post-settlement accounting boundaries.
- Operational outbox, in-app notifications, support tickets, local append-only audit evidence, and permission-gated platform operations are implemented. Operations now has a count-only summary and paginated sanitized triage queues; checkout emits created/payment-required and cancellation intents transactionally. Payment-review, reservation-expiry, delivery-quote-ready, refund/return/warranty/settlement lifecycle transitions, and platform support reply/resolution transitions enqueue notification intent transactionally. Fulfilment notices are parent-order aggregate events, preventing premature or duplicate notices for multi-supplier orders; successful settlement notifies eligible active supplier members of actionable supplier orders. External EMAIL/SMS attempts are append-only and without a configured provider record `NOT_CONFIGURED`, never fake delivery. Supplier lifecycle transitions, product updates, manual inventory adjustments, platform payment reconciliation, provider refund results, return completion, and warranty resolution commit their append-only audit evidence in their canonical transactions; audit metadata strips sensitive keys recursively while retaining safe context.
- Customer post-purchase UI is implemented and production-build verified: owned order history, canonical order/payment detail with real tracking and multi-supplier progress, customer-safe delivery/pickup details, and owned support ticket list/create/public-reply flows. A fresh disposable PostgreSQL 16 migration/seed and real Nest loopback HTTP suite prove customer order/payment/tracking ownership and support transaction/privacy behavior. Browser journeys, responsive viewport checks, and live Paystack remain pending.
- Platform commerce administration UI now extends the existing WorkspaceShell
  with permission-aware overview, supplier lifecycle, category/product,
  order, delivery/pickup, payment-exception, after-sales, and support routes.
  It calls canonical APIs only and intentionally exposes no browser-side
  settlement or payout control. Cross-supplier listing oversight now uses a
  dedicated paginated `GET /platform/listings` projection under
  `platform.products.read`, with server-side filters, deterministic ordering,
  safe availability state and no browser aggregation of tenant APIs. Fresh
  PostgreSQL 16 HTTP proof covers listing RBAC/filter/pagination/redaction;
  authenticated browser and the remaining platform-admin control matrix remain
  pending.

## Current blockers

The requested exhaustive operations closure matrix remains verification-pending: commerce and supplier notification event rows, deterministic operations summary/queue fixtures, privileged audit actions, audit query/filter coverage, and deep sanitizer proof have not all been executed in one real HTTP/PostgreSQL suite.

On 2026-10-08, a fresh disposable PostgreSQL 16 database received all ten
migrations and the idempotent seed twice. The focused post-order finance suite
now passes 14/14 and the operations outbox suite passes 8/8. The historic
return-history assertion was reproduced as correct (creation plus four
transitions plus completion equals six rows). The observed aggregate-run flake
was instead a ledger pagination test incorrectly requiring a UUID-tie row on
page one; it now asserts the combined deterministic pages. The final clean
aggregate command passed 10 suites/70 tests in 46.025 seconds, including
`marketplace-e2e.int.spec.ts`, a canonical
real HTTP/PostgreSQL A–J flow using provider-test evidence rather than direct
final-state inserts.

## Current risks

Courier integrations, notifications, live supplier bank payouts, and repair/replacement logistics remain deferred. Reservation expiry is exposed as a bounded platform operation and must
be invoked by deployment scheduling until a shared scheduler is introduced.
