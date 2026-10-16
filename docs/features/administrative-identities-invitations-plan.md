# ECOM administrative identities, email invitations and head-admin management

**Master roadmap:** [../IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md), Phases 1–3. This file remains the authoritative detailed implementation contract for those three security phases.

**Status: PHASE 1 LOCAL_VERIFIED; PHASES 2–3 PARTIAL ON DRAFT BRANCH, NOT RELEASE READY.** The exclusive account-audience enforcement now has a dedicated implementation note [account-audience-phase1.md](account-audience-phase1.md). A narrow supplier staff permission and bounded platform role definitions exist on draft branch `feature/supplier-staff-delegation-phase2`; invitation delivery, lifecycle management, platform staff APIs and UI are NOT IMPLEMENTED.  This is a source-grounded implementation contract, not proof that these restrictions currently apply. Target: `ow-tech/ecom` `dev`. Implement in the dependency order below and complete backend/database, frontend, regression checks and documentation per vertical. No production data changes were made during planning.

## Business requirements

1. Suppliers have isolated organizational workspaces. Both the supplier **owner** and properly authorized **supplier admin** can invite employees by email, select permitted supplier roles and subsequently change/revoke them.
2. An invitation must work for a **new address**, not just a user who has already registered. Access begins only after the intended email owner verifies the invitation and accepts it.
3. The same normalized email address must **never** be both a consumer/customer account and any supplier or platform staff/admin account. A staff identity may serve more than one supplier organization with independently scoped roles.
4. ECOM has a platform **super admin** as its protected root administrator. Introduce a separate **head admin** role for managing subordinate platform administrators and their permissions. A head admin cannot create, grant, revoke, or impersonate the super admin, nor elevate themselves.
5. No staff manager may bypass organization ownership, change another supplier's data, mutate immutable financial records, assign roles outside their delegation scope, or claim an email was delivered when no verified provider is configured.

## Findings in current dev

- `User.emailNormalized` already has a unique index. However, `User` has no immutable account-audience classification; `AuthService.register` is public and creates a generic user. Customer commerce lazily creates `CustomerProfile` through `CustomerService.ensureCustomerProfile`. The same user can currently have a customer profile, `OrganizationMembership`, and `PlatformRoleAssignment`.
- `OrganizationMembersService.invite` requires an **existing active registered** user. It creates `INVITED` memberships and an in-app invitation; it sends no email. The recipient accepts from `/account/invitations`.
- `STAFF_ROLE_KEYS` is a fixed organization-scoped allowlist (admin/member/inventory/fulfilment/finance viewer), and owner/self protection exists. But `organization.admin` has `organization.members.read` and **not** `organization.members.manage`, so admin cannot invite or change staff today.
- **Do not grant `organization.members.manage` to supplier admins without an audit of its other consumers.** In particular `PayoutDestinationsService.supplierCreate/supplierDisable` presently require that permission, so naïvely extending it would also let supplier admins change bank/M-Pesa payout recipients.
- `platform.super_admin` is seeded, but there is no `platform.head_admin`, platform staff invitation/management API or `/platform/staff` UI. `RbacService.requirePlatform` checks role permissions per request, which can remain the platform authority.
- Password reset uses an optional Resend integration. The ordinary notification transport has no proven production email/SMS delivery. A new staff-email workflow needs a configured, verified email sender.

## Feature 1 — Exclusive customer versus workforce identity

**Deliver as one end-to-end migration, not only a UI check.**

- Introduce a server-owned `User.accountAudience` / equivalent enum: `CUSTOMER` or `WORKFORCE`. Only a customer onboarding flow can create CUSTOMER; only a verified, valid staff invitation or restricted bootstrap can establish WORKFORCE. Do not allow self-selected `WORKFORCE` in a public registration request.
- Keep one normalized email registry and database uniqueness. The customer sign-up path must reject emails reserved for workforce invites, or already owned by workforce users. A supplier/platform invitation must reject customer accounts and customer-reserved emails. Use atomic concurrency controls (unique reservation and transaction/row locking) so racing sign-up/invite cannot result in dual identity.
- Guard customer-profile creation, customer orders/cart/checkout and other customer-only operations by CUSTOMER audience. Guard `OrganizationsService.create`, organization membership grants, platform-role grants, supplier staff invitation acceptance and staff-only APIs by WORKFORCE audience. Enforce invariants on all canonical backend mutation paths and reinforce cross-relation constraints at the database boundary where feasible.
- Migrate safely: report existing users with customer activity and active supplier/platform roles, users with only lazily created empty `CustomerProfile`, and orphaned/pending memberships. **Never auto-delete customer orders or auto-repurpose an ambiguous email.** Preserve customer accounts and arrange distinct workforce emails for conflicted users; transfer only authorized organization memberships/roles with audit evidence. Stage adding account audience, audited backfill/remediation, then NOT NULL/database enforcement and route guards.
- Consumer and staff use distinct sign-up/invitation entry points and visible messaging. Recompute authorization server-side and revoke old sessions after any audience migration.

**Proof:** exact/case-insensitive email collision; CUSTOMER cannot join supplier/platform admin; WORKFORCE cannot open customer checkout; racing invites and sign-up converge safely; legacy conflicting users block promotion pending remediation; tenant isolation unchanged. Include direct HTTP/PostgreSQL regressions, not only browser routing tests.

## Feature 2 — Real supplier email invitations and delegated roles

- Add `organization.staff.invite` and `organization.staff.manage` (or equivalent narrow role-management permissions). Give both to `organization.owner` and authorized `organization.admin`, without accidentally granting bank-payout management or other owner-only capabilities. Keep supplier owner role non-delegable; keep self-demotion/removal, owner mutation and cross-organization changes prohibited.
- Create email-addressed invitation records distinct from live organization memberships: organization, normalized email, allowed role key, inviter, status (`PENDING/ACCEPTED/REVOKED/EXPIRED`), expiry, send evidence and acceptance timestamps. Pending invitations give **zero** operational permissions. Only acceptance creates/activates a scoped membership atomically.
- Allow invites to emails without a prior ECOM account. For existing WORKFORCE users, acceptance attaches the new organization's scoped role. For new workforce users, the one-time verified invite flow creates credentials and marks the email verified before attaching the role. For CUSTOMER users, reject the invitation using a privacy-conscious account-unavailable response; require a separate workforce email.
- Send through an outbox-backed provider adapter after the invitation transaction. Keep raw invitation secrets out of audit logs, URLs in generic telemetry and plain outbox rows. Prefer an invitation-ID job that generates a short-lived server-signed link at dispatch; use single-use transactional acceptance, replay protection, bounded resend and rate limits. Status must say queued/undeliverable until provider acknowledgement; no fake “email sent”.
- Supplier UI `/supplier/:organizationId/staff`: invite by email + allowed-role dropdown, pending/sent/expired status, resend, revoke, accept-state visibility, member role change, and disable/remove confirmation. Provide a dedicated staff invitation acceptance/set-password screen; it must not convert an existing customer identity.
- Server role registry remains authoritative. Supplier admins may delegate only roles that their granted permission set allows. No arbitrary custom role creation or platform privilege assignment in this phase.

**Proof:** new-email invite and verified acceptance; same-address customer denied; duplicate/resend/replay/expired/revoked links; admin vs owner role boundaries; invitation cannot be accepted by other email/user; immediate revocation; cross-supplier denial; secure mail-provider success/failure with an isolated test adapter. Authenticated browser QA at mobile/tablet/desktop.

## Feature 3 — Root super admin, head admin and platform staff directory

- Preserve `platform.super_admin` as the protected root role. Create `platform.head_admin` below it plus limited platform roles (operations, catalogue/product, finance, support, audit/read-only as required). Assign individual permissions from the seeded platform permission registry; do not copy all root capabilities into head-admin by default.
- Introduce `platform.staff.read`, `platform.staff.manage` and a distinct `platform.head_admin.manage` / `platform.super_admin.manage` hierarchy as needed. Only an existing super admin may designate, downgrade or revoke a head admin. A head admin may manage lower platform roles and invitations **only**, never super admins, other head admins or their own privilege assignments.
- New platform admins join by emailed one-time WORKFORCE invitation. A generic public registration request must never yield a platform role. `PlatformRoleAssignment` remains the canonical permission source. All grant/change/revoke actions need server-side allowlist checks, row locking/concurrent-conflict handling and append-only audit records.
- Introduce `/platform/staff` with searchable/paginated platform-admin directory, invite/create workflow, role assignment, revoke/suspend, pending invitation expiry/resend and protected-role indicators. Hide unauthorized controls, but always enforce authorization in NestJS.
- Bootstrap the initial protected super admin only through a restricted, audited operator command/seeding procedure, **not** an HTTP self-registration route. Prevent removing or disabling the last active super admin; protect against self-escalation and unauthorized restoration. Require re-authentication/step-up control for sensitive high-privilege actions before production.
- Head admin manages suppliers through existing `platform.suppliers.*` roles where explicitly granted; management of supplier **employees** remains in the supplier's tenant unless a separately authorized support/recovery operation is designed.

**Proof:** only root can appoint/remove head admin; head can grant/revoke permitted ordinary platform roles; head cannot create or demote root, self-promote, grant finance-sensitive permissions outside allowance, modify other head admins or break last-root protections; staff invited from email cannot sign in to customer flows; revocation immediately blocks requests. Real HTTP/PostgreSQL and frontend role-matrix suites.

## Integration and rollout sequence

1. **Preflight:** inspect existing identity/membership conflicts and record a migration remediation report. Do not change data in production while discovering the migration scope.
2. **Feature 1:** account-audience classification, safe backfill, customer/staff guards and reserved-email uniqueness. This is the blocking security foundation for both invitation systems.
3. **Feature 2:** supplier-admin delegated staff permissions, new-email invitation transport/acceptance, staff UI and tests. Verify payout bank/M-Pesa detail permissions were **not** widened.
4. **Feature 3:** root/head-admin seeded roles, restricted platform invitations, management UI and privilege/last-root protections.
5. **Release validation:** existing CI (`pnpm typecheck`, `pnpm lint`, `pnpm build`, frontend tests, migrated PostgreSQL HTTP/integration suites); authenticated role-matrix browser checks; real verified email provider and secret-store configuration; audit and rate-limit review.

## Non-goals / explicit safety boundaries

No automatic conversion of a customer's email into an administrator. No customer-commerce access on a staff email. No supplier access based only on a route parameter. No plaintext invitation token persistence. No head-admin permission to create or manage super admins. No implied external email delivery without a real provider. Existing supplier commissions, bank/M-Pesa manual payouts, payment settlement and customer-order histories must remain unchanged by this identity work.

**Safe continuation:** Start with Feature 1 preflight/migration and protected `AuthService.register`, `CustomerService.ensureCustomerProfile`, `OrganizationsService.create`, `OrganizationMembersService.invite/accept` and platform-assignment safeguards. Preserve unique `User.emailNormalized` and existing RBAC invariants. Keep the index and this plan updated after each fully verified vertical.


## October 16 implementation checkpoint (draft branch only)

Phase 2: `organization.staff.manage` is seeded for supplier owner/admin and checked in the supplier staff mutation service and UI. `organization.members.manage` remains the owner-only payout mutation authority. Existing invitation still only targets registered WORKFORCE users and does not send email.

Phase 3: seed defines `platform.head_admin`, `platform.operations_admin`, `platform.support_admin`, `platform.audit_viewer` and the distinct platform staff/head-admin permissions. Head admin receives subordinate staff management but not `platform.head_admin.manage`, which is assigned only to super admin. These are registry definitions **only**: no API, UI, bootstrap, dynamic grant/revoke, last-root safety, email onboarding, verified tests or production deployment. New roles must never be considered ready until those enforcement checks exist.

Next safe implementation: transactional invitation database model, reserved-email collision protection, secure invitation delivery/acceptance and role management; then protected platform staff grant/revoke services with step-up and last-super-admin protections, APIs and UI. Reconcile seeded role permissions against existing databases before deploy; the existing upsert code adds permissions but does not remove obsolete grants. No production migration or mail delivery was performed.


## Implementation checkpoint — invitation and platform staff APIs (draft PR #1)

**Status: IMPLEMENTED_VERIFICATION_PARTIAL, NOT MERGEABLE WITHOUT TESTS.** This is source implementation, not evidence of successful CI or delivery.

Branch: `feature/supplier-staff-delegation-phase2`.

Implemented source seams:
- `apps/backend/prisma/migrations/20261016210000_staff_invitations/migration.sql` and Prisma model (separate invitation lifecycle, case-folded normalized email, pending uniqueness and one-time hash).
- `apps/backend/src/organizations/staff-invitations.service.ts` and controller: supplier and platform email invites, tenant-scoped permissions, token acceptance, 48-hour expiry, role checks at acceptance, bounded resend with token rotation, revoke and audit.
- `apps/backend/src/notifications/brevo-mail.service.ts`: free-tier Brevo transactional HTTP sender, configuration fail-closed, no token logging. Provider acknowledgment is not proof of delivery.
- `apps/backend/src/auth/auth.service.ts`: pending invitation reservation checked under advisory email lock during CUSTOMER registration.
- `apps/backend/src/organizations/platform-staff.service.ts` and controller: platform directory, subordinate grant/revoke, super-admin-only head admin role mutations, owner/self/protected-root and head-admin delegation restrictions.
- `apps/frontend/components/supplier-staff-management.tsx`, `platform-staff-management.tsx`, `platform-workspace.tsx`, and `apps/frontend/app/(auth)/staff/invitation/page.tsx`: email-only invites, pending state, resend/revoke, head/staff directory and first-time password activation.
- `apps/backend/test/staff-invitations.int.spec.ts`: HTTP/PostgreSQL regression source, not yet executed.

Configuration (backend only; use secure secret manager in deployed environments):
```env
BREVO_API_KEY=<from Brevo API key settings>
BREVO_FROM_EMAIL=notifications@your-verified-domain.example
BREVO_FROM_NAME=Ecom
ACCOUNT_PUBLIC_URL=https://your-storefront-domain.example
```
Verify sending domain SPF/DKIM in Brevo, ensure HTTPS application URL, and confirm the recipient inbox with a real test address. Never set keys in `NEXT_PUBLIC_*`, source control, logs or frontend configuration. No key/domain is configured by code and no actual emails have been sent by this work.

**Release verification outstanding:** execute `pnpm --filter @ecom/backend prisma:generate` and migrate a fresh disposable PostgreSQL database; run backend typecheck, lint, build, targeted staff/identity/finance HTTP tests, frontend typecheck/tests/build; inspect CI; perform authenticated responsive-browser role matrix and Brevo deliverability test; run production mixed-account/email collision preflight before database migration. Current implementation sends Brevo mail directly after invitation transaction rather than through a durable outbox. Unexpected crashes between invitation persistence and provider delivery are recoverable by resend but not automatically retried; harden with a transactional outbox before production certification. Platform super-admin bootstrap and step-up authentication are still operational release gates. Legacy registered-user invitation POST returns HTTP 410; outstanding pre-existing legacy INVITED memberships require a reviewed transition plan.

**Critical security matrix to prove before merge:** customer email cannot be invited; customer registration rejects reserved workforce email, including simultaneous registration/invitation; revoked/expired/replayed token never grants membership; inviter loses authority before acceptance; supplier admin cannot mutate bank/M-Pesa destinations; tenant A cannot mutate B; head admin cannot manage root, head peers or self; root is never delegable via staff API; role revocation denies subsequent platform requests; seed remains idempotent and does not leave obsolete permissions. No production writes have been performed.
