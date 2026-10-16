# Customer Profile + Cart

## Status

Implemented and integration-verified.

## Purpose

Adds customer-commerce identity without expanding `User`, owned delivery addresses,
and a mutable cart whose commercial lines reference supplier offers.

## Behavior

`ensureCustomerProfile(userId)` lazily creates exactly one profile. Customer APIs
derive ownership only from the authenticated user. Setting an address as default
transactionally clears the previous default. Orders later copy addresses and never
depend on mutable address rows.

One ACTIVE Cart exists per profile. Adding an existing SupplierListing increments
quantity. The backend derives and refreshes `unitPriceSnapshot`; one cart accepts
one currency. Reads return the snapshot, current price, eligibility, current
availability, product/variant names, supplier display name, and primary image
metadata. Cart operations never alter `onHand` or `reserved`.

## Implementation Map

- `src/customer/customer.service.ts`: `ensureCustomerProfile`, profile and address ownership
- `src/cart/cart.service.ts`: active-cart concurrency and cart mutations
- `src/commerce/commercial-availability.service.ts`: canonical listing eligibility, price, and active-location availability
- `prisma/schema.prisma`: CustomerProfile, CustomerAddress, Cart, CartItem

## Entry Points

- `GET|PATCH /customer/profile`
- `GET|POST /customer/addresses`
- `GET|PATCH|DELETE /customer/addresses/:addressId`
- `GET /customer/cart`
- `POST /customer/cart/items`
- `PATCH|DELETE /customer/cart/items/:cartItemId`
- `POST /customer/cart/clear`

## Database

`CustomerProfile.userId` and `CartItem(cartId,supplierListingId)` are unique.
PostgreSQL partial unique indexes protect one default address and one ACTIVE cart
per profile. CHECK constraints protect positive quantities and currency/address
formats. Decimal(18,2) stores prices.

## Contracts

Clients submit listing identity and quantity, never price, supplier, cart owner, or
profile owner. A cart snapshot is informational; checkout rejects a changed price.

## Authorization

Every route uses `SessionAuthGuard`; profile, address, cart, and item visibility is
constrained through the authenticated user's CustomerProfile. Foreign identifiers
resolve as not found.

## Invariants

INV-CUSTOMER-01 and INV-ADDRESS-01..03 are database/application protected.
INV-CART-01..10 are preserved: singleton ownership, SupplierListing identity,
positive quantity, unique line, server price, one currency, advisory availability,
and no inventory mutation.

## Concurrency

Profile and active-cart creation resolve unique races by loading the winner. Cart
line changes run serializably and retry serialization conflicts.

## Failure Behavior

DTO violations return 400; unauthenticated requests 401; invisible owned records
404; listing, availability, and currency conflicts return 409 with stable codes.

## Tests

`test/customer-commerce-core.int.spec.ts` proves ownership, singleton constraints,
default replacement, concurrent cart creation, server pricing, availability,
currency isolation, duplicate merging, and zero inventory mutation.

## Known Limitations

No customer UI, saved payment data, cart reservation, FX conversion, delivery
pricing, or cart abandonment job exists.

## Operational Notes

The partial unique indexes live in the forward migration because Prisma schema
syntax cannot represent them. Use Decimal values for all authoritative totals.

## Safe Continuation Point

Preserve `ensureCustomerProfile`, the commercial availability resolver, server-only
pricing, one ACTIVE cart, and the rule that carts never reserve inventory.

## Storefront continuation

The Cart page keeps checkout primary and exposes a secondary Continue shopping
action. It restores the last safe `/products` URL when the catalogue stored one;
empty carts expose the same Browse products fallback. This is browser navigation
only and does not change cart quantities, money, stock warnings, or checkout.

Checkout continues to be the primary action in the summary. The populated-cart
header uses an outline Continue Shopping Button which only follows a stored
relative `/products` URL. Clear Cart opens a controlled confirmation dialog;
only its destructive confirmation invokes the canonical CartProvider mutation.
Focused React tests verify the safe fallback for external return URLs, the
canonical outline action, confirmation cancellation, disabled in-flight clear,
and failed-clear error behavior without removing the rendered cart item.

## Product add feedback

Product-detail Add to Cart continues to await the canonical CartProvider
mutation before any visual success feedback. A failure presents its error and
does not animate, pulse, navigate, or claim a new count. On confirmed success,
the shared sticky storefront cart receives a decorative measured flight and
pulse; an accessible four-second confirmation names the actual product and
selected variant. The product page deliberately has no duplicate sticky mobile
purchase bar because its offer actions remain visible, reachable controls.
