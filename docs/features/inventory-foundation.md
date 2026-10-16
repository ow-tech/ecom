# Inventory Foundation

## Status

Implemented and integration-verified.

## Ownership and models

`Supplier -> InventoryLocation` is supplier stock-control infrastructure, not a
customer PickupPoint. `InventoryItem` is the one stock record for
`SupplierListing + InventoryLocation`. Product remains platform-owned and
SupplierListing has no quantity field. `available` is derived as `onHand - reserved`.

`InventoryMovement` is immutable application-owned evidence for every physical
on-hand change. It records type, positive quantity, prior/new on-hand values,
optional reference metadata, reason, and actor. Consume emits `STOCK_OUT`;
reserve/release do not alter physical stock.

## Constraints and concurrency

Location codes are unique per supplier and items per listing/location. Database
checks enforce nonnegative values and `reserved <= onHand`. Receive is a
transactional upsert; physical mutations write their movement in the same
transaction. Reserve/release use conditional `UPDATE ... RETURNING`; reserve
requires `onHand - reserved >= quantity`, preventing concurrent oversell. The
real Nest HTTP/PostgreSQL integration suite launches two last-unit reserve
requests concurrently with `Promise.allSettled`; exactly one succeeds, one
returns insufficient availability, and the persisted state is `onHand=1`,
`reserved=1`, `available=0` (INV-INV-12). Future checkout must reuse
`InventoryService` rather than copy stock arithmetic.

## Authorization and API

Routes use `RbacService.organizationContext`, derive Supplier from verified
organization context, then constrain every location/listing/item to it. Owners
and admins receive all inventory permissions; members have location/inventory
read access.

- `GET|POST|GET|PATCH /organizations/:organizationId/inventory/locations`
- `GET /organizations/:organizationId/inventory`
- `POST .../receive`, `POST .../adjust`, `POST .../:id/remove|reserve|release|consume`
- `GET .../:id` and `GET .../:id/movements`

Locations use INACTIVE rather than hard deletion. Supplier/listing suspension
does not delete stock or alter movement history.

## Tests and verification

`apps/backend/test/inventory-foundation.int.spec.ts` covers location and RBAC
authorization, supplier tenant isolation, quantity validation, lazy item
creation, physical movement evidence, reservation/release/consume semantics,
failed-mutation atomicity, movement immutability, and real PostgreSQL
concurrency. It also verifies the required last-unit reservation race and the
reserve/remove constraint race.

## Limitations and continuation

Checkout now owns reservations, payment settlement consumes them, and bounded expiry
releases stale holds through transaction-aware InventoryService cores. Fulfilment,
transfer, procurement, valuation, and public stock display remain absent. Preserve
listing/location ownership, derived availability, immutable movements, atomic
operations, and verified tenant authorization.
