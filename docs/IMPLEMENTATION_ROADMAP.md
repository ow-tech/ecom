# ECOM implementation roadmap — identity foundation through business operations

**Status:** PLANNED. This document orders future work; it does not mean the planned capabilities have been implemented. Source of truth: current `dev` branch, `docs/PROJECT_STATE.md`, `docs/FEATURE_INDEX.md`, `docs/LAUNCH_READINESS.md` and per-feature specifications. Update this plan when a feature is built, tested and documented. Do not claim external email/SMS, sourcing, payout or production deployment without real evidence.

**Delivery model:** Complete one vertical feature at a time (schema/migrations → NestJS API and permissions → Next.js UI → worker/provider integration when relevant → unit/HTTP/PostgreSQL/browser regression → GitHub CI → indexed documentation). Keep tenant/customer privacy, immutable commerce and finance records, and operational replay/idempotency guarantees. No broad refactors or parallel order/payment/ledger implementations.

## Ordered implementation register

| Phase | Scope ID | Workstream | Baseline in dev | Completion target |
| --- | --- | --- | --- | --- |
| 1 | Identity foundation | Separate customer and staff identities | **LOCAL_VERIFIED / RELEASE_GATED** | Customer/workforce identity, database guardrails, separate login and email-collision regressions passed CI 38917521648; production mixed-account preflight and browser/QA release proof pending |
| 2 | Supplier staff | Supplier-admin invitations and role management | Registered-user, owner-managed in-app invitations exist; **new-email invites and admin delegation missing** | Verified email invitations, owner/admin delegable roles, revoke/resend/accept flows with isolated sensitive privileges |
| 3 | Platform hierarchy | Head admin and platform staff management | Seeded super admin exists; **head-admin management missing** | Protected super/head roles, restricted platform invitations, role directory and audit |
| 4 | 13 | Notifications and background jobs | **PARTIAL** — durable outbox, lease recovery, customer inbox and platform job-state UI CI-tested | Reliable provider email/SMS, scheduled workers and reservation expiry, delivery/retry monitoring and alerts |
| 5 | 15 | Overseas sourcing | **MISSING** dedicated module | Request → quote → payment → supplier purchase → overseas logistics/customs → delivery/reconciliation |
| 6 | 16 | CRM | **MISSING** dedicated module; customers/orders/support exist | Lead/customer relationship timeline, sales pipeline, follow-ups, assignments, segments, scoped outreach |
| 7 | 17 | Accounting and expense management | **MISSING** general accounting; supplier commission/settlement ledgers exist | Chart of accounts, income/expenses, journals, payables/receivables, reconciliation and statements |
| 8 | 18 | Reports and analytics | **PARTIAL** supplier 30-day metrics and platform operational counts | Authorized supplier/platform financial, sourcing, sales, stock and customer dashboards + exports |
| 9 | 19 | CMS, marketing and advanced SEO | **PARTIAL** catalogue content and basic page metadata; no content-management system | Publishing CMS, banners/pages/blog, SEO controls, promotional marketing and campaign measurement |
| Parallel release track | 20 | Deployment, backups and CI/CD | **NOT PRODUCTION READY**; local Compose and GitHub verification CI work | Staging/prod infrastructure, security, release/rollback, TLS, backup/restore, monitoring, scheduled workers |

**Sequencing note:** Phase 20 must **begin alongside Phases 1–4**, not wait until the end. Build a nonproduction staging environment early; production go-live requires verified backups, restores, monitoring, access control and external providers. Phases 5–9 may be separate release milestones; do not silently promote deferred CRM/accounting/marketing scope to initial-launch blockers without a product release decision.

## Phase 1 — Separate customer and staff identities

**User requirement:** The same normalized email must not exist as both a customer and any staff/admin identity.

- Add an immutable or tightly controlled `CUSTOMER` vs `WORKFORCE` account audience to the server-owned identity model. Keep unique `User.emailNormalized` and reserve invited workforce emails atomically; do not rely on hidden UI or matching email alone.
- Audit current `User`, `CustomerProfile`, organization memberships, platform assignments and orders for mixed identities. Create a migration conflict report and approval process. **Do not reclassify users with customer orders or staff rights automatically**, erase customer data or change production identities during preflight.
- Restrict customer sign-up and all cart/checkout/profile operations to CUSTOMER. Grant workforce status only through protected staff invitation/activation or audited platform bootstrap. Guard login/session routing and membership/role mutation on the backend; revoke sessions on safe account transitions.
- Prevent concurrent registration and invitation from claiming the same address for different audiences using a database-backed single source of truth, unique constraints and transaction isolation.
- **Acceptance:** customer email cannot be invited into supplier/platform staff; workforce email cannot use consumer sign-up/checkout; case-insensitive collisions and racing writes resolve safely; preexisting mixed accounts are reported and remediated; server authorization holds even with fabricated requests.

**Full specification:** [administrative-identities-invitations-plan.md](features/administrative-identities-invitations-plan.md).

## Phase 2 — Supplier-admin invitations and role management

**User requirement:** Supplier **owner** and authorized **supplier admin** can invite new users by email, select allowed roles, resend/revoke and manage staff in that supplier only.

- Distinguish narrowly scoped staff-invite/role-management permissions from `organization.members.manage`, which currently also permits modifying sensitive bank/M-Pesa payout destinations. Supplier admins must not gain payout-destination controls by receiving staff-management capability.
- Support pre-registration invitation to a **new** email and existing WORKFORCE users. Email delivery must be outbox-backed with provider evidence, expiration, single-use token hashing, resend throttling, replay rejection and explicit statuses; acceptance grants no access until email ownership is verified and role activation succeeds.
- Supplier UI at `/supplier/:organizationId/staff`: invite by email, select permitted staff role, see invited/sent/expired/accepted/revoked, resend, revoke, update active staff roles and remove access. New workforce signup/acceptance must be distinct from consumer account creation.
- Owners remain non-delegable; supplier admins cannot assign owner/platform roles, grant themselves privileges, remove the last protected owner or access another supplier's data. Removal must immediately revoke scoped permissions.
- **Acceptance:** real provider-send evidence in staging, registered/unregistered recipient acceptance, wrong-email/replay/expiry/revoke denial, supplier-admin delegation, owner/sensitive-finance protection, and tenant isolation tested by real HTTP/PostgreSQL and browser flows.

**Full specification:** [administrative-identities-invitations-plan.md](features/administrative-identities-invitations-plan.md).

## Phase 3 — Head admin and platform staff management

**User requirement:** Super Admin is the protected highest-privilege account; Head Admin can manage authorized lower-level platform administrators but can never create another super admin, modify a super admin or elevate themselves.

- Preserve seeded `platform.super_admin`; introduce `platform.head_admin` with explicit permissions, platform administrator role templates and protected super-admin bootstrap/recovery.
- Only super admin grants or revokes head-admin status. Head admin manages restricted operational/product/support/etc. platform staff roles through invitation and authenticated role assignment; cannot manage other head admins, super admins or self-promote.
- Build `/platform/staff`: platform staff directory, invitation/acceptance, role assignment, role/permission visibility, revoke/disable, status filters and audit history. Apply authorization at each controller/service and database mutation, not just in navigation.
- Protect the **last active super admin**, privilege escalation, role-assignment races, account audience boundaries and audit evidence. Require elevated reauthentication/step-up for sensitive production changes.
- **Acceptance:** root-only head-admin appointment, head-admin restricted delegation, cross-role denials, last-root protections, authenticated invitation acceptance, immediate revocation and audited changes; HTTP/PostgreSQL and browser role matrix.

**Full specification:** [administrative-identities-invitations-plan.md](features/administrative-identities-invitations-plan.md).

## Phase 4 — Notifications and background jobs (13)

**Current evidence:** transactional PostgreSQL outbox, atomic deduplication, lease reclamation and stale-worker fencing, customer in-app inbox/preferences and permission-scoped platform queue monitoring are implemented and tested.

**Pending verticals:** email adapter (verified sender, opt-outs and mandatory messages), SMS provider, delivery attempts/retries with secure recipient resolution, pending-failure alerts, one-shot worker scheduling and reservation-expiry scheduling, safe dead-letter/manual recovery policy, and operational dashboard of delivery evidence. Provider failures must not rewrite payment, order or finance truth.

**Acceptance:** real messages reach controlled test recipients; failure/timeout/replay are handled; no user sees another user's notice; worker crash/lease expiration and alerting are proven in staging; no false success statuses.

## Phase 5 — Overseas sourcing (15)

**Status:** New module required. Define customer sourcing request (item URL/description, origin/quantity), staff evaluation, versioned quote and fees, customer approval, payment obligations, overseas supplier purchase, freight milestones, landed costs/customs/taxes, shipment manifests, arrival/clearance, local delivery/pickup, refunds/cancellations and exception escalation.

**Acceptance:** one request completes end-to-end with tenant-aware staff/admin/customer views, real state histories, accurate quoted vs actual costs, payment/reconciliation safety and traceability. Sourcing must reuse canonical customer and payment contracts where applicable.

## Phase 6 — CRM (16)

**Status:** New module required. Implement a customer and lead/contact relationship layer above existing account/order/support truth: lead capture, pipeline stages, ownership/assignment, tasks/follow-ups, interaction timeline, customer segments, consent/preferences and role-scoped CRM dashboard. Avoid duplicating customer profiles or exposing platform-wide PII to suppliers.

**Acceptance:** lead-to-customer conversion, timeline/audit, task due dates, staff permission checks, safe segmentation/export and privacy handling proven.

## Phase 7 — Accounting and expenses (17)

**Status:** General ledger/accounting module missing; existing supplier commission, refund and settlement ledgers are not a complete accounting system. Add chart of accounts, journal posting, expense capture/approval, vendor bills, receivables/payables, tax treatment scoped by jurisdiction, bank/cash records, period close, reconciliations and statement exports.

**Acceptance:** balanced immutable journal entries sourced from canonical commerce/refund/settlement events, role-separated expense approval, accounting reports matching source ledgers, duplicate-posting prevention, period-lock and reconciliation tests. Do not double-post commissions or payouts.

## Phase 8 — Reports and analytics (18)

**Status:** Existing supplier 30-day operational and gross-paid metrics, finance views and platform operational counters are implemented. Expand to revenue, commissions, supplier performance, net payable, stock movements, sourcing lead times, campaign/CRM funnel and accounting expense/profit measures. Support authorized per-supplier/platform filters, date ranges, comparison periods and CSV exports.

**Acceptance:** deterministic aggregates match source orders/payments/ledger, maintain currency separation, preserve tenant privacy, handle refunds correctly and prove export/authorization at scale.

## Phase 9 — CMS, marketing and advanced SEO (19)

**Status:** Basic Next.js metadata/catalogue content only, without CMS. Implement platform-managed pages, home/landing banners, product/brand editorial content, media asset upload and publishing workflow; preview/draft/revision/scheduling; technical SEO metadata, canonical, sitemap, robots/redirects, structured data and server-rendered crawlable public product/category pages; consent-aware campaigns and promotional tracking.

**Acceptance:** authorized editorial lifecycle, published content served on storefront, crawled metadata/structured data, stable URL redirects, image delivery and marketing opt-in/opt-out all verified. Basic technical SEO should be fixed before public launch even if campaign automation follows later.

## Parallel release track — Deployment, backups and CI/CD (20)

**Current evidence:** local PostgreSQL/Redis Compose and `ecom-verification.yml` run typecheck/lint/build, unit/frontend tests, migrations and real HTTP/PostgreSQL integration tests. No production release infrastructure, Nginx/TLS, rehearsed restore or managed secrets are verified.

**Deliver:** staging and production service/container topology, migration promotion/rollback safety, TLS/domain setup, secret store/rotation, queue/worker schedules, observability/alerts, restricted administrative access, encrypted off-host PostgreSQL backups with retention, **tested restore**, release tagging and rollback drills. Use test payment/email providers in staging.

**Acceptance:** a tagged release deploys with health gates, no customer downtime from migrations, backup-and-restore drill passes, monitoring detects failures, and rollback/recovery procedures are documented and exercised.

## Completion standard for every phase

- Feature contract and boundary notes; current `dev` inspected before edits; no unsupported inference that an external service is configured.
- Schema and forward-only migration/backfill plan, permission guards and tenant ownership, idempotent/replay-safe lifecycle APIs, complete customer/staff/platform UI and error states.
- Focused tests for success, failure, retry, races and unauthorized access; full regression/CI; real provider evidence when applicable; mobile/tablet/desktop authenticated browser verification.
- Feature-specific indexed documentation: status, core files, contracts, migrations, sensitive invariants, actual test/run references, known blockers and next safe continuation.
- GitHub direct commit to `dev` (or approved protected-branch process); status moves to **LOCAL_VERIFIED** only after full local/CI evidence; **PRODUCTION_READY** only after deployment and external-provider release gates.

## Immediate next milestone

**Begin Phase 1 with a read-only mixed-identity preflight** and safe migration inventory. Identify email collisions across existing customer activity, supplier/organization roles and platform assignments, then implement the exclusive account audience as a complete vertical. Phases 2 and 3 must wait on that security boundary; development of notification transport and staging can progress in parallel where identity assumptions are not violated.
