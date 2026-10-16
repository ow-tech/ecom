# Architecture

```text
Browser
  -> Next.js frontend
  -> NestJS API
  -> PostgreSQL

NestJS
  -> Redis
```

The platform starts as a modular monolith. PostgreSQL is the primary
persistence system. The NestJS backend owns business logic and access to
PostgreSQL; the frontend must never access PostgreSQL directly.

Redis is available to backend processes for future cache, coordination, and
queue use. Future workers must use shared business logic rather than creating
parallel implementations of domain rules.

Identity is server-managed: opaque session tokens live only in HttpOnly cookies
and PostgreSQL stores hashes. Organization is the tenant boundary. A verified
tenant context requires an authenticated active user, active membership, and
organization-scoped permission. Platform roles are stored separately from
organization membership roles.

Supplier is an optional one-to-one business extension of Organization, not an
authorization boundary. Supplier profile access uses the verified organization
context; platform onboarding review uses separate platform permissions. Supplier
lifecycle transitions are centralized and write append-only status history.

Catalogue concepts (Category, Product, ProductVariant, and ProductMedia metadata)
are platform-owned. SupplierListing is the tenant-owned commercial offer, resolved
through Supplier and the verified Organization context; it is not a Product field.

Inventory is supplier-scoped: locations belong to Supplier and an InventoryItem
is a SupplierListing at a location. Canonical backend operations own quantity
arithmetic; availability is derived as onHand minus reserved.

Customer commerce identity is a lazy one-to-one `User -> CustomerProfile`
extension. Addresses and the single active cart are owned through that profile;
cart lines reference SupplierListing and carry advisory server-derived price
snapshots, but carts never reserve inventory.

`CheckoutService` is the sole mutable-cart-to-order boundary. A customer-scoped
idempotency key owns one CheckoutAttempt; one serializable PostgreSQL transaction
revalidates commercial truth, allocates owned reservations through InventoryService,
creates one customer Order, splits one SupplierOrder per Supplier, snapshots each
OrderItem and delivery address, appends initial history, and converts the Cart.
Pending unpaid cancellation releases those reservations exactly once.

`PaymentsService` creates immutable Paystack attempts from Order money and a
server-generated reference. Signed raw-body webhooks, explicit verification, and
platform reconciliation all pass normalized provider evidence through one binding
validator and `PaymentSettlementService`. Settlement serializes on Payment and
Order, then atomically marks provider truth, advances the Order/SupplierOrders,
consumes owned reservations through InventoryService, writes physical movements,
and appends order history. Captured money after cancellation/expiry is preserved as
Payment `SUCCEEDED` while the Order becomes `PAYMENT_REVIEW/PAID_REVIEW`; released
stock is never recreated or consumed.

`ReservationExpiryService` is the canonical bounded expiry processor. It locks the
Order, skips known successful payments, conditionally expires ACTIVE reservations,
releases only aggregate reserved quantity, and advances fully expired unpaid orders.
The platform endpoint is the current deployment scheduling seam; no in-process cron
assumes a single application replica.

`FulfilmentLifecycleService` is the only SupplierOrder transition authority.
Organization authorization resolves the Supplier from verified membership; explicit
commands advance only that Supplier's operational unit. Each actual transition writes
`SupplierOrderStatusHistory`, then `OrderFulfilmentAggregationService` derives the
customer Order state without overwriting cancellation, expiry, or payment-review truth.

PickupPoint is platform-owned customer collection configuration and remains separate
from supplier InventoryLocation. Pickup checkout snapshots the point and server fee on
the Order and stores only a collection-code hash. Delivery uses one deterministic
country/region/city resolver and an active same-currency rate. Unmatched delivery
creates an `AWAITING_DELIVERY_QUOTE` Order; payment is blocked until the customer
approves a non-expired platform quote and the Decimal total is finalized. These orders
retain the normal reservation TTL rather than holding stock indefinitely.

Authenticated customer tracking projects Order and SupplierOrder append-only histories,
quote state, and immutable pickup/delivery snapshots. Public messages are included;
supplier internal notes are never returned.

Post-order operations remain separate: RefundRequest is customer/platform review state,
Refund is Paystack-provider evidence, ReturnRequest is operational item recovery, and
WarrantyClaim uses immutable OrderItem terms. Completion creates immutable per-item
CommissionRecords and append-only supplier-perspective ledger entries. Settlement batches
claim ledger rows once and manual paid marking appends a debit; no automatic payout exists.

The production target is a Docker-based Ubuntu VPS deployment. Nginx and
production deployment configuration are intentionally deferred.

Operational side effects use a PostgreSQL transactional outbox. Workers claim
events with database locking and create recipient-owned, deduplicated in-app
notifications outside the authoritative commerce transaction. Support tickets
are customer- or verified-organization-owned; platform-only status, assignment,
internal notes, and audit evidence use explicit permissions and append-only
history.
