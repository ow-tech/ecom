# Checkout + Order Foundation

## Status

Implemented and integration-verified.

## Purpose

Turns a mutable active cart into one customer order spanning one or more suppliers,
with durable reservation ownership, immutable commercial evidence, and safe unpaid
cancellation. Payment and expiry build on this boundary through their own canonical
services; checkout itself still never establishes payment success.

## Behavior

`CheckoutService.prepare` supports DELIVERY and PICKUP. Delivery loads an owned
address and copies an immutable structured snapshot; Pickup loads an active platform
point and copies its immutable pickup snapshot. Both paths revalidate every listing's supplier, listing,
product, optional variant, current Decimal price, currency, and stock. Changed price
returns `PRICE_CHANGED`; it never silently accepts either stale or changed pricing.

Within one serializable transaction it establishes CheckoutAttempt idempotency,
creates the Order, groups lines by Supplier, creates exactly one SupplierOrder for
each group, writes one canonical OrderItem per line, allocates inventory across
active locations ordered by `createdAt,id`, records InventoryReservations, appends
PENDING_PAYMENT history, and converts the cart. Delivery fee is temporarily zero.

## Implementation Map

- `src/checkout/checkout.service.ts`: canonical checkout and idempotency resolver
- `src/inventory/inventory.service.ts`: owned allocation and release arithmetic
- `src/orders/orders.service.ts`: customer/supplier reads and unpaid cancellation
- `src/commerce/commercial-availability.service.ts`: checkout revalidation
- `prisma/schema.prisma`: attempts, orders, snapshots, supplier orders, reservations, history

## Entry Points

- `POST /customer/checkout/prepare` with `Idempotency-Key`
- `GET /customer/orders`
- `GET /customer/orders/:orderId`
- `POST /customer/orders/:orderId/cancel`
- `GET /organizations/:organizationId/supplier-orders`
- `GET /organizations/:organizationId/supplier-orders/:supplierOrderId`

## Database

`(customerProfileId,idempotencyKey)`, order numbers, supplier-order numbers,
`(orderId,supplierId)`, and `(checkoutAttemptId,inventoryItemId)` are unique.
CHECK constraints protect positive reservation/item quantities, exact line totals,
nonnegative order totals, and reservation terminal timestamps.

## Contracts

Checkout accepts only fulfillment method plus an owned address ID or active pickup
point ID. Price, totals,
supplier, reservation quantities, and locations are server-derived. Success is
PENDING_PAYMENT/UNPAID; it does not imply payment.

## Authorization

Customers see only Orders through their profile. Supplier reads require verified
organization context plus `orders.read`, granted only to owner/admin, and return
only that Supplier's SupplierOrders and line items.

## Invariants

INV-CHECKOUT-01..10 and INV-ORDER-01..10 are implemented: live revalidation,
owned reservations, atomic failure, no oversell, one customer Order, one
SupplierOrder per Supplier, exactly one SupplierOrder per item, immutable snapshots,
tenant isolation, append-only history, retained cancellation records, and exact-once
release.

## Concurrency

Serializable transactions plus atomic conditional InventoryItem updates prevent
oversell. Serialization failures are retried. Same customer/key is database-unique;
repeated or concurrent success resolves to the same Order without duplicate stock,
lines, or supplier orders. Location allocation is deterministic and never exceeds
each row's availability.

## Failure Behavior

Commercial conflicts return stable 409 codes: `PRICE_CHANGED`,
`INSUFFICIENT_STOCK`, `LISTING_UNAVAILABLE`, `CART_CURRENCY_MISMATCH`, or
`CHECKOUT_ALREADY_TERMINAL`. Any line failure rolls back all reservations, orders,
history, attempt, and cart changes.

## Tests

The real HTTP/PostgreSQL suite covers single/multi-supplier structure, snapshot
durability, concurrent same-key checkout, two-customer last-unit race,
multi-location allocation, price change, partial multi-line rollback, ownership,
supplier isolation, cancellation, release-once behavior, and history.

## Known Limitations

Courier integration, automated supplier payouts, and production scheduling remain
absent. Paystack settlement consumes reservations and a bounded platform operation
expires unpaid holds; deployment scheduling remains external.

## Operational Notes

`CHECKOUT_RESERVATION_TTL_MINUTES` defaults to 15 and must remain positive. Active
reservations increase `InventoryItem.reserved`; cancellation marks them RELEASED and
decrements the aggregate in the same transaction. Future payment logic will decide
consume/release/expiry transitions.

## Safe Continuation Point

Read this document plus customer-cart, inventory-foundation, and
catalogue-foundation. Preserve cart non-reservation, checkout ownership,
customer-scoped idempotency, one Order across suppliers, one SupplierOrder per
Supplier, Decimal/server-authoritative price, immutable snapshots, stock race safety,
and exact-once cancellation release. Payment continuation is documented in
`payment-settlement.md`; the next seam is fulfilment, delivery, and pickup.
