# Payment + Order Settlement

## Status and scope

Implemented and integration-verified for Paystack initialization, signed webhooks,
server-side verification, reconciliation, and order settlement. Refunds, manual
review resolution, supplier payouts, fulfilment, delivery pricing, pickup, and a
customer payment UI remain out of scope.

## Models and money

An Order may retain multiple immutable `Payment` attempts. Each attempt stores the
Order-derived Decimal amount/currency, normalized customer email, an immutable
server-generated `(provider, providerReference)`, and initialization/verification
evidence. `(orderId,idempotencyKey)` protects customer initialization retries. A
PostgreSQL partial unique index permits only one `SUCCEEDED` Payment per Order.

`PaymentEvent` is provider-facing append-only evidence. Exact raw webhook bytes are
SHA-256 hashed for deterministic event identity because Paystack charge events do
not expose a required stable event ID. Stored payloads are defensively stripped of
authorization/card fields. No event mutation API exists; processing metadata is set
by the webhook processor.

`toPaystackMinorUnits` is the only major-to-minor conversion seam. It uses Prisma
Decimal multiplication and decimal strings, never JavaScript floating point. This
increment explicitly supports two-decimal `KES`, `NGN`, `GHS`, `ZAR`, and `USD`.

## Initialization and provider contract

`POST /customer/orders/:orderId/payments/initialize` requires an authenticated
owner and `Idempotency-Key`. Only `PENDING_PAYMENT/UNPAID` Orders are payable. The
backend derives total, currency, and email, persists the attempt/reference, then
calls Paystack `POST /transaction/initialize`. Success remains Payment `PENDING` and
never changes the Order. A definite provider rejection becomes `FAILED`; a timeout
or network ambiguity becomes `UNKNOWN` and retains the same reference for later
verification. Initialization POSTs are never blindly retried.

`PaystackClient` is the provider boundary. It uses environment-only secret
credentials, bounded timeouts, normalized results, and no business settlement.
Current configuration is `PAYSTACK_SECRET_KEY`, `PAYSTACK_BASE_URL` (default
`https://api.paystack.co`), and `PAYSTACK_TIMEOUT_MS`. Optional
`PAYSTACK_CALLBACK_BASE_URL` lets the backend generate a stable, customer-owned
`/checkout/payment/:orderId?paymentId=:paymentId` provider return URL. It contains
only persisted identifiers and remains non-authoritative: the return route loads
status and invokes persisted-ID verification before presenting success.
The browser redirects only to the provider `authorization_url` returned by this
server initialization response.

## Webhook and binding

`POST /payments/paystack/webhook` is unauthenticated but requires Paystack's
HMAC-SHA512 `x-paystack-signature` over the exact raw body. Invalid signatures mutate
nothing. Unknown events are acknowledged safely. Duplicate raw events resolve via
the database event-identity unique constraint.

`PaymentBindingService` is canonical for webhook, verify, and reconciliation. It
requires the persisted reference, exact Decimal-derived minor amount, uppercase
currency, optional normalized customer email, and maps only Paystack `success` to
internal `SUCCEEDED`. `ongoing/pending/processing/queued` remain `PENDING`;
`failed` is `FAILED`; `abandoned` is `CANCELLED`; unknown vocabulary is `UNKNOWN`.

## Canonical settlement

`PaymentSettlementService.settleSucceededPayment` is the only provider-success to
business-success seam. Serializable PostgreSQL work locks Payment then Order and
retries serialization conflicts. Normal settlement atomically:

- records Payment `SUCCEEDED`, provider evidence, and settlement time;
- advances Order to `PAYMENT_CONFIRMED/PAID`;
- advances SupplierOrders to `CONFIRMED` without starting fulfilment;
- calls `InventoryService.consumeOwned` exactly once;
- changes ACTIVE reservations to CONSUMED;
- decrements both `reserved` and `onHand` and appends `STOCK_OUT` movements;
- appends one OrderStatusHistory record.

Repeated webhook/verify/reconcile calls return idempotently. A second attempt cannot
become successful after another Payment has succeeded.

## Late success and failure behavior

Cancellation or expiry releases reservation ownership. Later authoritative success
records Payment `SUCCEEDED`, changes the Order to `PAYMENT_REVIEW/PAID_REVIEW`, and
appends history, but never consumes or recreates stock. This is captured-money truth,
not fulfilment readiness. Manual resolution/refund is a future feature.

Provider initialization timeout and verification timeout remain `UNKNOWN`. A client
redirect never establishes success. Reference, amount, currency, or customer mismatch
cannot settle. A webhook arriving before the browser returns is safe because the
persisted reference is already authoritative. A missing client return has no effect.

## APIs and operations

- Customer: initialize, `GET .../payment-status`, and explicit persisted-ID verify.
- Platform: paginated payment read/detail and single/bounded reconciliation.
- Permissions: `platform.payments.read` and `platform.payments.reconcile`, seeded to
  `platform.super_admin`.

Operational output excludes secret keys, access codes, authorization URLs, customer
email, and raw event payloads. Reconciliation considers only unresolved attempts and
never creates a new attempt.

## Tests and continuation

Unit tests cover exact money conversion, official status mapping, signature checks,
initialization, timeout ambiguity, and malformed responses. Real HTTP/PostgreSQL
tests cover ownership/idempotency, binding failures, duplicate events, atomic stock
consumption, one success, verify/reconcile, permission, expiry races, and late success.

The customer UI uses `POST /customer/orders/:orderId/payments/initialize`,
`GET /customer/orders/:orderId/payment-status`, and persisted-ID verify. It polls
unresolved state every two seconds for at most 100 checks; unknown, timeout, and
temporary API failures remain nonterminal. Customer Order continuity is at
`/checkout/payment/:orderId` and `/account/orders`.

Preserve the browser-untrusted
contract, canonical binding/settlement, exact-once inventory arithmetic, and the
separation between provider truth and fulfilment safety.
