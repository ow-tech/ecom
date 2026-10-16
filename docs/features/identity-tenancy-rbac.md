# Identity, Tenancy, and RBAC Foundation

## Status

Implemented.

## Authentication and sessions

`POST /auth/register`, `/auth/login`, `/auth/logout`, and `GET /auth/me` use
Argon2id password hashes and opaque 14-day server-side sessions. The raw token
is only an HttpOnly, SameSite=Lax cookie; PostgreSQL stores SHA-256 token hashes.
Revocation, expiry, and non-active users are rejected by `SessionAuthGuard`.

## Tenancy and authorization

Organization is the tenant boundary. `RbacService.organizationContext` is the
canonical resolver: it requires an active membership, active organization, and
organization-scoped permission before returning verified context. Platform
assignments are a separate relation and are evaluated by `requirePlatform`.

## Data and seed

The `20261004131643_identity_tenancy_rbac` migration creates User, Credential,
Session, Organization, OrganizationMembership, Role, Permission and mapping
tables. `pnpm --filter @ecom/backend prisma:seed` is deterministic and seeds
owner/admin/member and platform.super_admin with foundation permissions.

## API

Authenticated users can create organizations atomically with an ACTIVE creator
membership and `organization.owner` role. List returns only active memberships;
individual reads go through canonical organization context.

## Invariants

Passwords and raw tokens are never stored; email normalization is unique;
active membership is required; organization and platform roles remain separate;
and client organization IDs never establish authorization.

## Limitations and continuation

No invitation workflow, reset, verification delivery, MFA, role-management UI,
or frontend auth UI exists. Next seam: Supplier as the one-to-one business
extension of Organization, using the documented verified context.
