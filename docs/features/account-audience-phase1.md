# Phase 1 — Exclusive customer and workforce accounts

## Status
IMPLEMENTED_VERIFICATION_PENDING. Schema, customer/workforce APIs, direct PostgreSQL audience guardrails, customer-only lazy profile, workforce-only organization/RBAC boundaries, frontend sign-in separation and regression tests have been committed to `dev`. CI green and authenticated browser evidence are required to mark this phase LOCAL_VERIFIED. Email invitations, head-admin provisioning and production workforce onboarding remain Phase 2/3.

## Read-only preflight (mandatory before any database migration)
The migration `20261016190000_exclusive_account_audience` **fails closed** when it finds users who own both any `CustomerProfile` and an organization membership or platform role. A lazy empty profile is still a conflict until the account owner validates it and its related objects. Do not delete, reassign or convert the user automatically.

Execute using a privileged **read-only** Postgres connection before deploy:
```sql
SELECT u.id, u."emailNormalized",
       EXISTS(SELECT 1 FROM "CustomerProfile" p WHERE p."userId" = u.id) AS customer_profile,
       EXISTS(SELECT 1 FROM "OrganizationMembership" m WHERE m."userId" = u.id) AS workforce_membership,
       EXISTS(SELECT 1 FROM "PlatformRoleAssignment" a WHERE a."userId" = u.id) AS platform_role,
       (SELECT COUNT(*) FROM "Order" o JOIN "CustomerProfile" p ON p.id=o."customerProfileId" WHERE p."userId"=u.id) AS customer_orders
FROM "User" u
WHERE EXISTS(SELECT 1 FROM "CustomerProfile" p WHERE p."userId"=u.id)
  AND (EXISTS(SELECT 1 FROM "OrganizationMembership" m WHERE m."userId"=u.id)
       OR EXISTS(SELECT 1 FROM "PlatformRoleAssignment" a WHERE a."userId"=u.id));
```
Retain this report securely; it contains email identifiers. **Zero rows** are required for automatic cutover. Mixed users with orders or history need an approved separate workforce email, separately authorized membership transfer and audit; never move historical orders between users just to satisfy this migration.

## Invariants
- `User.emailNormalized` remains globally unique for every audience and case-folded at registration.
- `User.accountAudience` is `CUSTOMER` (public customer sign-up) or `WORKFORCE` (staff provisioning). It cannot be changed through ordinary API/Prisma updates. One address cannot represent both.
- A `CustomerProfile` can only belong to CUSTOMER; an `OrganizationMembership` or `PlatformRoleAssignment` can only belong to WORKFORCE. Triggers read/lock User for direct SQL/Prisma enforcement, protecting concurrent grants and customer-profile creation.
- `CustomerService.ensureCustomerProfile` returns 403 to workforce identities even if called through a customer URL; customer IDs cannot create supplier organizations. `RbacService` validates WORKFORCE in addition to scoped membership and platform privileges.
- `OrganizationMembersService.invite/accept` checks WORKFORCE; a consumer email cannot be granted organization access even if it registered earlier.
- Login endpoints are audience-scoped: `POST /auth/login` for CUSTOMER and `POST /auth/workforce/login` for WORKFORCE. The account-audience check runs before issuing a server-side session and is re-checked under the login User row lock.
- `POST /auth/workforce/register` is a **temporary non-production-only** onboarding seam to populate development/QA fixtures while verified email invitations are still missing. It returns 403 when `NODE_ENV=production`. It never assigns an organization or platform role. Phase 2 must replace this with invitation-bound, email-verified activation; public production workforce self-signup is deliberately unavailable for now.
- `POST /auth/register` still creates CUSTOMER only. Ordinary customer login is never an admin login, and the `/staff/login` screen uses workforce credentials. Workspaces' authentication links lead to the workforce login. Existing customer password recovery continues to own credentials but does not change audience.
- This phase does not claim email verification, staff invite sending, platform admin recruitment, identity recovery, browser certification or actual production migration. Those remain independently gated.

## Code index
- Prisma User enum and column: `apps/backend/prisma/schema.prisma`.
- Forward migration, mixed-account hard stop and direct-writing triggers: `apps/backend/prisma/migrations/20261016190000_exclusive_account_audience/migration.sql`.
- Auth registration/login and sessions: `apps/backend/src/auth/auth.service.ts`, `auth.controller.ts`, `auth.types.ts`.
- Tenant/account service guards: `apps/backend/src/customer/customer.service.ts`, `apps/backend/src/organizations/organizations.service.ts`, `organization-members.service.ts`, `apps/backend/src/rbac/rbac.service.ts`.
- Customer/staff UIs: `apps/frontend/components/auth-form.tsx`, `apps/frontend/app/(auth)/staff/login/page.tsx`, `apps/frontend/app/(auth)/staff/register/page.tsx`, `apps/frontend/lib/auth-routing.ts`.
- QA fixtures: `apps/backend/scripts/qa/seed.ts`, `verify.ts`.
- Real HTTP/Postgres tests: `apps/backend/test/identity-tenancy-rbac.int.spec.ts` plus existing merchant/customer/payment/order integration suites.
- Frontend routing: `apps/frontend/test/auth-routing.test.cjs`.

## Verification and rollout
1. Validate migration against a copied staging database; run preflight query first. If conflicts exist, record and resolve separately before retrying. Do not forcibly set User audience by a production script.
2. Run `pnpm prisma:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, frontend/backend unit and all HTTP/PostgreSQL integration suites on disposable DB. Verify migration applies and QA seed remains idempotent.
3. Exercise case-insensitive customer/staff duplicate-email races, unauthorized customer org/role access, workforce customer-profile denial, unauthorized direct database inserts and immutable account-audience updates.
4. Test customer and staff login/redirect/session/logout behavior in authenticated mobile/tablet/desktop browsers. Keep all existing payment, refund, fulfilment and finance authority unchanged.
5. Only after above mark LOCAL_VERIFIED; do not claim launch readiness until staff email invitations and account remediation are operational.

## Future Phase 2 integration
New supplier/platform invitations will reserve a unique email as WORKFORCE and verify it before account activation, replacing nonproduction registration. Supplier admins require separately scoped staff-management permission and must not inherit bank/M-Pesa payout access via `organization.members.manage`. See `administrative-identities-invitations-plan.md`.
