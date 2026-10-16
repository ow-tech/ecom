# Supplier Domain + Supplier Onboarding

## Status

Implemented.

## Purpose

Supplier is the optional, one-to-one business extension of Organization. This
feature covers supplier profile, onboarding, platform review, and lifecycle
evidence only; it does not introduce catalogue or commerce data.

## Behavior

An organization owner creates one DRAFT Supplier. Authorized organization users
may read or update allow-listed profile fields. A complete draft can be
submitted for platform review. Platform-authorized users approve, reject,
suspend, or reactivate it through the canonical lifecycle service.

## Implementation Map

```text
Organization --1:0..1--> Supplier --> SupplierStatusHistory
organization routes ------> RbacService.organizationContext
platform review routes ---> RbacService.requirePlatform
```

## Entry Points

- `POST|GET|PATCH /organizations/:organizationId/supplier`
- `POST /organizations/:organizationId/supplier/submit`
- `GET /platform/suppliers` and `GET /platform/suppliers/:supplierId`
- `POST /platform/suppliers/:supplierId/{approve,reject,suspend,reactivate}`

## Important Files

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/suppliers/suppliers.service.ts`
- `apps/backend/src/suppliers/supplier-lifecycle.service.ts`
- `apps/backend/src/suppliers/suppliers.controller.ts`
- `apps/backend/src/suppliers/platform-suppliers.controller.ts`
- `apps/backend/test/supplier-domain.int.spec.ts`

## Architecture / Flow

Requested organization IDs are context requests only. Organization routes first
resolve `RbacService.organizationContext`, then constrain the Supplier lookup to
that verified organization. Platform review never uses organization membership;
it requires `RbacService.requirePlatform`. `SupplierLifecycleService` owns all
status validation, metadata writes, and history appends.

## Database

`Supplier.organizationId` and `Supplier.slug` are unique. Supplier has foreign
keys to Organization and lifecycle actors. `SupplierStatusHistory` references
Supplier and actor, is append-only by application design, and is indexed by
supplier plus creation time. Supplier status is indexed for platform filtering.
Initial creation history uses `previousStatus = null` and `newStatus = DRAFT`.

## Supplier Lifecycle

Allowed transitions are `DRAFT -> PENDING_REVIEW`, `PENDING_REVIEW -> ACTIVE`
or `REJECTED`, `ACTIVE -> SUSPENDED`, and `SUSPENDED -> ACTIVE`. Every
transition is transactional with a conditional status update and history row.
Approval, rejection, and suspension store the authenticated platform actor and
timestamp. Reactivation retains the most recent suspension metadata and history.
`REJECTED` is terminal for this feature.

## API Contracts

Creation requires `displayName`; other profile fields are optional in DRAFT.
PATCH allows only profile fields and never changes slug, organization binding,
or lifecycle metadata. Submit requires legal name, business email, phone,
two-letter uppercase country code, and three-letter uppercase currency code.
Platform list accepts bounded `page`, `limit`, optional `status`, and optional
basic search. Platform detail includes safe Organization identity context.

## Authorization

Organization permissions are `supplier.read`, `supplier.create`,
`supplier.update`, `supplier.submit`, and `supplier.staff.read`. Owner receives
all; admin receives read/update/staff-read; member receives read. Platform
super-admin receives `platform.suppliers.read`, `.review`, `.approve`, and
`.suspend`. No organization role can review lifecycle state, and platform role
does not imply membership.

## Invariants

- INV-SUPPLIER-01 through 02: one immutable Organization binding per Supplier.
- INV-SUPPLIER-03 through 04: tenant access derives from verified Organization
  membership, never requested identifiers.
- INV-SUPPLIER-05 through 06: platform-only, canonical lifecycle transitions.
- INV-SUPPLIER-07 through 09: Supplier suspension and tenant boundaries do not
  alter identity/session/membership state or leak between organizations.
- INV-SUPPLIER-10 through 13: history is append-only, PATCH is allow-listed,
  submission is complete-only, and rejection is terminal.

## Regression Surface

Authentication, sessions, organization creation/listing, and existing
organization/platform RBAC remain covered by the original integration suite.

## Failure Behavior

Invalid DTOs or incomplete onboarding return 400; missing authentication returns
401; permission or tenant-context failures return 403; absent suppliers return
404; duplicate bindings/slugs and invalid lifecycle transitions return 409.

## Tests

`pnpm test:integration` runs real Nest HTTP and PostgreSQL tests using the
existing `TEST_DATABASE_URL` convention. The supplier suite covers lifecycle,
actor evidence, profile mass-assignment resistance, tenant isolation, and RBAC.

## Operational Notes

Run the forward migration and deterministic seed against a separate test
database before integration tests. The seed is upsert-based and rerunnable.

## Known Limitations

There is no supplier UI, invitation/staff mutation API, public storefront,
catalogue, inventory, payouts, or rejected-onboarding reopen workflow. Stable
slugs are generated deterministically from display name with numeric suffixes
when necessary, and PATCH never changes them.

## Decisions

See DEC-008. Organization remains generic and Supplier is not a security
boundary.

## Safe Continuation Point

Read `docs/PROJECT_STATE.md`, this document,
`docs/features/identity-tenancy-rbac.md`, and `docs/ARCHITECTURE.md`. Preserve
Organization as the tenant boundary, `RbacService.organizationContext` as the
organization authorization seam, separate platform permissions, canonical
Supplier lifecycle, history, and stable slugs. The next exact seam is Catalogue
Foundation attached to approved Supplier organizations.
