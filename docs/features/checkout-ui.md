# Checkout UI

## Status

Implemented for checkout preparation and customer payment continuity.

## Routes

- `/checkout` prepares the server-authoritative unpaid Order.
- `/checkout/payment/:orderId` is the canonical order/payment detail and provider-return route.
- `/account/orders` lists the authenticated customer's Orders and links to the same detail route.
- `/account/addresses` provides owned address add, view, edit, delete, and
  set-default management.

The public product route remains product-centric: `/products/:slug` reads a Product and
lets a customer select a SupplierListing only as the offer to add to cart.

## Fulfilment preparation

Checkout keeps display labels separate from its request contract. The customer must
explicitly choose Delivery or Pickup; preparation sends only `fulfillmentMethod:
"DELIVERY"` with an owned address ID, or `fulfillmentMethod: "PICKUP"` with an
active PickupPoint ID. The browser never sends an InventoryLocation or fields from
the other fulfilment flow.

Checkout is divided into fulfilment, address/pickup, payment, final-confirmation,
and sticky order-summary sections. Saved delivery addresses are keyboard-selectable.
The shared address form captures recipient and alternate phones, county/region,
city/town, estate, street, building/house, landmark, and delivery instructions.
Saving an edit increments the local quote generation and requests a new backend
preview even though the selected address ID did not change.

The payment selector renders only backend-returned eligibility. Card presents Visa
and Mastercard recognition while explaining that Paystack—not Ecom—collects card
details. M-Pesa appears only when the backend exposes it and explains the hosted
Paystack plus handset-authorization flow. Selection remains an accessible radio
group with a visible selected state.

## Payment continuation

The payment route loads `GET /customer/orders/:orderId` and
`GET /customer/orders/:orderId/payment-status`. It initializes with only the Order ID
and a client idempotency key at `POST /customer/orders/:orderId/payments/initialize`.
Amount, currency, email, provider reference, eligibility, and settlement stay server
owned. A returned provider payment is verified through the persisted payment ID at
`POST /customer/orders/:orderId/payments/:paymentId/verify`; browser return parameters
never establish success.

When `PAYSTACK_CALLBACK_BASE_URL` is configured, the backend creates the Paystack
callback URL under `/checkout/payment/:orderId?paymentId=:paymentId`. It is optional
for existing deployments but required to exercise the full provider-return journey.

## State and polling

`lib/payment-state.ts` centralizes mapping: payable, pending confirmation, unknown,
paid, failed, payment review, awaiting quote, expired, and cancelled. Pending and
unknown poll status every two seconds for at most 100 checks. Network/API errors and
the timeout remain neutral; customers can check again. Polling stops for paid, failed,
review, expired, or cancelled states. Late captured money is shown as payment review,
not fulfilment success.

## UI and verification

The routes compose `StorefrontContainer`, `PageHeader`, `Surface`, `StatusBadge`,
`Alert`, `Button`, `Money`, and `OrderSummary`; they add no payment-specific visual
primitives. Node built-in frontend tests cover the shared state mapping and bounded
polling predicate. Focused React tests cover backend-eligible payment presentation,
selected state, full address CRUD interactions, persisted checkout address creation,
and quote refresh after an edit. Browser/live-provider proof remains environment
dependent.

Verification on 2026-10-12 completed backend unit tests (4 suites, 23 tests), the
frontend Node and Vitest suites (3 Node files plus 10 Vitest files/52 tests), backend
and frontend typechecks/lint/builds, and 9 focused HTTP/PostgreSQL integration tests
against all 12 migrations plus seed in a fresh disposable database. The disposable
database was removed after the run.

## Address authority and snapshots

All address endpoints resolve the authenticated customer's `CustomerProfile`; a
foreign ID returns not found. The first address becomes default automatically, only
one default is permitted by the existing partial unique index, and deleting the
default promotes the oldest remaining address. `POST
/customer/addresses/:addressId/default` is the explicit default transition.

Checkout reads the owned address again inside its serializable transaction, rates
the current fields, and copies them into `OrderDeliveryAddress`. Profile edits and
deletes never mutate that order-owned snapshot. Fresh real HTTP/PostgreSQL proof
covers CRUD ownership, default transitions, same-ID fee re-rating, and snapshot
immutability.

## Safe continuation point

Run authenticated browser checks at 375px, 768px, and 1280px for long address
content, form validation/focus, checkout section flow, sticky-summary behavior, and
hosted Paystack return. Live Card/M-Pesa and provider callback/webhook verification
remain blocked until a valid Paystack TEST merchant credential and public endpoints
are available.
