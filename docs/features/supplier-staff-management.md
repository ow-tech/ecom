# Supplier Staff and Membership Management

Status: IMPLEMENTED_VERIFICATION_PARTIAL — latest CI on `dev` passed backend, frontend and 78 HTTP/PostgreSQL tests; authenticated browser proof remains pending.

Existing registered users are invited by an organization owner, accept via their own authenticated account, and receive only the selected organization-scoped role. Membership removal immediately blocks organization requests because `RbacService.organizationContext` resolves active membership per API call.

## Canonical execution path
- Owner UI: `/supplier/:organizationId/staff` -> `GET/POST /organizations/:organizationId/members`, `PATCH .../:id/role`, `DELETE .../:id`.
- Recipient UI: `/account/invitations` -> `GET /organization-invitations`, `POST /organization-invitations/:id/accept`.
- Backend: `OrganizationMembersService` -> existing `OrganizationMembership`, `MembershipRole`, `Role`.
- Role definitions are seeded by `apps/backend/prisma/seed.ts`; no schema migration.
- Existing roles `organization.owner`, `organization.admin`, `organization.member` remain. Delegable roles: admin, member, inventory staff, fulfilment staff, finance viewer.
- No email invite to unregistered users is claimed: they must register first, then owner sends an in-app invitation.

## Invariants
- INV-STAFF-01: authenticated active owner permission `organization.members.manage` controls every mutation; serializable transactions lock the organization and recheck role authority.
- INV-STAFF-02: owner roles cannot be delegated or edited through this staff endpoint. Managers cannot change their own role or remove themselves, nor remove an owner.
- INV-STAFF-03: invitation does not grant tenant access until the intended authenticated recipient accepts it; no one can accept another user's invite.
- INV-STAFF-04: removing a membership blocks organization API permission checks immediately; no direct supplier or platform role is inferred.
- INV-STAFF-05: role changes replace the selected staff role in one transaction; no stale admin permissions survive.
- INV-STAFF-06: re-invitation after removal requires new acceptance; no cross-organization permission inheritance.

## Verification
`apps/backend/test/identity-tenancy-rbac.int.spec.ts` proves unauthorized invites, owner protections, invitation acceptance/ownership, role transition, revocation, and re-invitation. Frontend tests cover manager and read-only views, recipient acceptance and failure behavior.

Run the current GitHub `ecom-verification.yml` on `dev`, including seed and a disposable PostgreSQL database, then authenticated browser QA on desktop and mobile. This feature does not implement invitation email, employee SSO, bespoke roles, or custom role editor.

## Safe continuation
Do not duplicate membership authorization in the UI. Keep `RbacService.organizationContext` authoritative. Next supplier scope: server-derived reporting, segregated by `orders.read`, `inventory.read`, and `finance.read`.

## User interface

Owner/managers with `organization.members.read` see `/supplier/:organizationId/staff`. Only `organization.members.manage` reveals invite/change/remove controls; owners and own memberships cannot be removed or delegated. The recipient accepts from `/account/invitations` and `SessionProvider.refresh` retrieves the newly active organization permissions. API membership state remains authoritative.


## Phase 2 delegated staff permission (in progress)

Status: PARTIAL — branch `feature/supplier-staff-delegation-phase2`, not merged or CI-certified.

The supplier staff mutation seam now checks `organization.staff.manage`, granted through the Prisma seed to organization.owner and organization.admin. The older `organization.members.manage` permission is retained for existing owner-only payout destination create/disable operations. The supplier staff UI uses the narrower permission. This prevents delegating staff management from silently granting supplier bank/M-Pesa destination mutation.

**Not implemented by this increment:** unregistered-address invitations, verified email delivery, token acceptance, expiry/revocation/resend, password setup, browser QA, cross-tenant/role matrix regressions. The legacy invite endpoint still requires a registered WORKFORCE user. Do not present this branch as complete Phase 2.

**Validation required:** reapply seed and check role permission deltas; verify supplier admin staff invite/change/remove and owner/self restrictions; prove supplier admin receives 403 on payout destination create/disable; verify existing owner payout behavior; run backend HTTP/PostgreSQL, frontend staff/payout tests and CI. New email invitation flow remains the next implementation seam.
