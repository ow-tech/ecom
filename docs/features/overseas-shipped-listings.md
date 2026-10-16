# Overseas-shipped supplier listings

## Status
IMPLEMENTED_VERIFICATION_PARTIAL on draft PR #2 (`feature/overseas-listing-capability`). Implementation source exists; **no executed CI, migrated PostgreSQL or real authenticated-browser verification has been confirmed**. Do not merge/deploy without proving safety.

## Business contract
Overseas shipping is a supplier-listing attribute, not a sourcing-request or quote module. The displayed item price is the final merchandise price; normal delivery/pickup fees remain separately disclosed before payment. Each overseas listing includes a supplier-defined, disclosed estimated delivery window in days. The same platform product can have local and overseas supplier offers.

## Authority
- `Supplier.overseasEnabled` defaults false and can only be changed by an active WORKFORCE user with the canonical `platform.super_admin` role.
- `PATCH /platform/suppliers/:supplierId/overseas-shipping` with `{ enabled: boolean }` is transactional and audited.
- `platform.overseas.manage` exists in the seeded root permission set for frontend action visibility only; backend checks the **actual super-admin role**, not an ordinary platform supplier approval permission.
- Revocation deactivates active overseas listings and blocks future orderable checkout while leaving existing paid orders and order snapshots intact.
- Direct SQL/Prisma listing writes cannot create overseas origins when the supplier is not approved.

## Data and migrations
- `20261016220000_overseas_listing_capability`: ListingOrigin enum, super-admin supplier switch, listing ETA constraints and immutable order-item origin/window snapshots.
- `20261016230000_overseas_capacity_reservations`: separate overseasOrderable, overseasReserved and overseasCommitted counters, counter nonnegativity/capacity constraints, owned OverseasReservation rows and checkout/order relations.
- `LOCAL` remains the default for existing suppliers, listings and orders.
- Overseas orderable quantity is **not** physical `InventoryItem.onHand` inventory. It represents the finite additional units the supplier commits to make available for overseas orders.

## Canonical runtime
- `CommercialAvailabilityService.resolve`: for overseas listings, available = overseasOrderable - overseasReserved - overseasCommitted, gated by active supplier and approval; local listings still use physical stock.
- `InventoryService.allocateOwned`: atomic SQL conditional reserve of overseas capacity; physical inventory remains untouched.
- `InventoryService.consumeOwned`: payment-authoritative consumption turns reserved overseas units into committed units, without inventing stock movements; retries cannot double-consume.
- `InventoryService.releaseOwned` and `expireOwned`: cancel/expire overseas reservations and restore orderable capacity transactionally.
- `ReservationExpiryService.expireBatch`: scans both physical and overseas reservations, and expires an order only after no owned active reservations remain.
- `CheckoutService.prepare`: preserves listing origin and delivery window in `OrderItem` snapshots while retaining canonical total, currency and idempotency behavior.
- `PublicCatalogueService`, cart service, cart normalization and storefront: labels overseas offers and delivery estimate without presenting them as physically in stock.
- Supplier workspace: origin, lead-time range and orderable capacity controls.
- Platform supplier workspace: root-only overseas enable/disable control.

## Important invariants
- INV-OVERSEAS-01: only super admin can enable a supplier; supplier cannot self-grant.
- INV-OVERSEAS-02: item unit price is unchanged at checkout, and paid item price/ETA/origin snapshots never follow later listing edits.
- INV-OVERSEAS-03: atomic capacity claim prevents overselling; overseas units cannot create/consume physical inventory.
- INV-OVERSEAS-04: cancellation, expiry and payment consume owned reservation exactly once; mixed physical+overseas carts pass through the same canonical functions.
- INV-OVERSEAS-05: revocation prevents new orders but never rewrites payment evidence or historical order obligations.
- INV-OVERSEAS-06: listing quantity cannot fall below reserved+committed; changing to LOCAL is blocked if historical overseas commitments remain.
- INV-OVERSEAS-07: role, tenant and account-audience checks remain server-authoritative.

## Test sources and remaining verification
`apps/backend/test/supplier-domain.int.spec.ts` includes new test sources for root approval denial, direct SQL protection, customer-independent orderable count, reservation exhaustion, payment consumption, duplicate consumption denial, release, expiry and revocation. **These tests have not been executed in this session.**

Required before merge: fresh database migration, Prisma generate, backend typecheck/lint/build, supplier/commerce/inventory/checkout/payment integration suites, frontend tests/typecheck/build and authenticated mobile/desktop browser QA. Add or confirm concurrency stress tests, mixed-cart settlement and provider ambiguity/reconciliation, and regression for local physical inventory. CI green alone is not a production deployment certificate.

## Safe continuation
Read this document, `inventory.service.ts` owned reservation methods, `payment-settlement.service.ts`, `reservation-expiry.service.ts`, `commercial-availability.service.ts` and the new supplier-domain regression. Inspect branch diff before changes. Verify migrations and tests, fix only confirmed defects, update this status with actual CI identifiers. No production writes have been performed.
