# Overseas-shipped supplier listings

Status: PARTIAL — source branch `feature/overseas-listing-capability`; not verified or ready for merge.

## Product contract
Overseas shipping is a listing origin/lead-time label, **not** a sourcing request or quote product. Supplier sets the FINAL merchandise price. Existing delivery/pickup fees, if any, remain explicitly disclosed at checkout. The estimated shipping window is advisory; no new prices, currencies or payment lifecycle are introduced.

## Authority
`Supplier.overseasEnabled` defaults false. Only a WORKFORCE user with `platform.super_admin` role may use `PATCH /platform/suppliers/:supplierId/overseas-shipping` with `{ "enabled": true|false }`. Capability mutations are audited. Disabling prevents future activation and deactivates active overseas listings; paid order-item snapshots remain unchanged. Database listing trigger rejects OVERSEAS creation/update for unapproved suppliers.

## Data
Migration `20261016220000_overseas_listing_capability`: `ListingOrigin (LOCAL|OVERSEAS)`, supplier gate, listing origin + deliveryMinDays/deliveryMaxDays, order item immutable origin/ETA snapshot. LOCAL has null ETA; OVERSEAS requires ordered 1–365-day range. Existing rows default LOCAL; legacy orders remain LOCAL.

## Implementation map
- Prisma schema/migration
- Platform supplier capability service/controller
- Supplier listing DTO and service gate
- Checkout order item snapshot (existing amount and currency unchanged)
- Public catalogue origin and lead-time projection
- Frontend API client for super-admin capability mutation

## Remaining before feature complete
**Important blocker:** existing checkout uses physical inventory allocations, and public catalogue filters offers on local on-hand stock. Therefore an overseas product without stocked inventory is NOT yet buyable; do not fake stock quantities. Decide and implement supplier-defined overseas orderable quantity/capacity, atomic reservation and cancellation/release semantics, or require a clearly documented preloaded stock model. The former is likely needed. Add capability control to actual platform suppliers UI, origin/ETA selection to supplier listing UI, customer labels at product/cart/checkout, order and tracking timelines with ETA snapshot; ensure revoked suppliers cannot obtain new sales, including concurrent activation/checkout. Add complete HTTP/PostgreSQL/frontend authorization/pricing/inventory tests and verify migrated CI. No production migration performed.

## Dangerous invariants
1. Supplier cannot self-grant overseas shipping; only super admin.
2. Listed price is final merchandise price; no quote, markup or post-payment price change.
3. Checkout must never promise overseas stock it cannot safely reserve.
4. Snapshot ETA/origin on payment order; later listing edits cannot alter existing orders.
5. Revocation must block future overseas fulfilment sales, without deleting historical orders.
6. Supplier tenant isolation and ordinary local checkout must remain unchanged.

## Safe continuation
Trace inventory.reserve, checkout validation, public-product offer filtering, supplier listing editing UI, order detail/tracking serialization. Implement overseas orderable capacity and reservation under transaction lock, then end-to-end UIs and tests. Keep PR draft until these are verified.
