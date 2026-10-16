# Decisions

## DEC-001: Custom NestJS backend instead of Supabase

Use a custom NestJS backend for control of business logic, predictable
infrastructure ownership, and self-hosting.

## DEC-002: PostgreSQL

Use PostgreSQL as the primary persistence system.

## DEC-003: Modular monolith

Start as a modular monolith rather than microservices to keep domain logic and
operations coherent while the product model is established.

## DEC-004: pnpm workspace monorepo

Use pnpm workspaces for the frontend, backend, and explicit shared contracts.

## DEC-005: Prisma for initial schema and migrations

Use Prisma initially for database schema management and migrations.

## DEC-006: Docker-based VPS target

Target deployment to an Ubuntu VPS using Docker.

## DEC-007: Server-side opaque sessions and scoped RBAC

Use PostgreSQL-backed hashed opaque sessions. Keep platform roles separate from
organization membership roles, with permissions evaluated centrally.

## DEC-008: Supplier as an Organization extension

Supplier is a unique optional extension of Organization. It does not introduce
supplier-specific users, memberships, or roles. Supplier lifecycle transitions
are centralized, transactional, and recorded in append-only status history;
rejected onboarding is terminal until a future explicit reopen decision.

## DEC-009: Platform catalogue concepts are separate from supplier offers

Category, Product, ProductVariant, and ProductMedia metadata are platform-managed.
SupplierListing carries the supplier-specific price and supplier SKU, with Decimal
money and a database-protected supplier/product/variant uniqueness invariant.

## DEC-010: Inventory is listing-and-location scoped

Quantity is not a Product or SupplierListing field. A supplier location plus
supplier listing identifies an InventoryItem; PostgreSQL constraints and atomic
backend operations protect stock and reservation invariants.

## DEC-011: Checkout owns reservations and creates one multi-supplier order

Customer carts are advisory and never reserve stock. Checkout is a durable,
customer-scoped idempotency boundary and commits reservation ownership, one main
Order, one SupplierOrder per represented Supplier, immutable OrderItems, delivery
snapshot, history, and cart conversion in one serializable PostgreSQL transaction.
Unpaid cancellation preserves order history and releases ACTIVE reservations once.

## DEC-012: Provider truth and fulfilment safety are separate

Persist a payment attempt and server-generated Paystack reference before contacting
the provider. Only a signed webhook or server-side verification may establish
provider success, and all evidence uses one amount/currency/reference/customer
binding seam. One database transaction owns normal settlement. If money succeeds
after reservations were cancelled or expired, preserve Payment `SUCCEEDED` but move
the Order to `PAYMENT_REVIEW/PAID_REVIEW` without consuming unreserved inventory.
Reservation TTL remains authoritative for stock holds; bounded database-safe expiry
is exposed for external scheduling rather than introducing a queue framework now.

## DEC-013: SupplierOrder owns fulfilment; Order is the derived customer aggregate

Suppliers act only on their own SupplierOrders through explicit lifecycle commands.
One canonical aggregator derives Order progress and preserves special payment and
terminal states. Both levels use append-only status evidence.

## DEC-014: Fulfilment price is finalized before payment

Pickup fees and automatic delivery rates are server-derived and snapshotted. An
unmatched delivery address creates a manual quote workflow and cannot initialize
Paystack until the customer approves the quote. Quote-waiting orders use the normal
reservation TTL; no indefinite stock hold is introduced.

## DEC-015: PickupPoint is not InventoryLocation

PickupPoint is platform-managed customer collection configuration. InventoryLocation
remains supplier stock infrastructure. Historical Orders carry immutable pickup or
delivery snapshots and do not depend on later configuration edits.

## DEC-016: Post-order money is evidence-led and append-only

Customer refund requests, provider refunds, returns, warranties, commissions, ledger
entries, and settlements use distinct lifecycles. Provider ambiguity remains unresolved
until reconciliation evidence; historic monetary records are corrected with new ledger
entries rather than mutation. Supplier balances derive from signed ledger entries.

## DEC-017: Operational effects are durable but asynchronous

Notifications and other operational work are recorded in PostgreSQL outbox rows
within the business transaction, then claimed by a bounded retry worker. Delivery
failure cannot roll back payment, order, fulfilment, or refund truth.
