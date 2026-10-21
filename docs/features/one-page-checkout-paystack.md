# One-page checkout and Paystack channels

`/checkout` is the customer checkout surface. It loads owned addresses and pickup
points, requests the read-only `POST /customer/checkout/preview` quote for the
selected fulfilment input, then creates an order only through the existing
serializable `POST /customer/checkout/prepare` seam.

The browser compares the quote visible at Pay-click time with the persisted
order totals. A changed total is displayed and requires another explicit Pay
click; the browser never submits a price. A manual delivery quote creates the
existing awaiting-quote order and never initializes Paystack.

`POST /customer/orders/:orderId/payments/initialize` requires a separate
idempotency key and `{ method: "CARD" | "MPESA" }`. The backend locks the Order
row, permits one unresolved attempt, records `Payment.requestedChannel`, and
initializes Paystack with `channels: ["card"]` or `channels: ["mobile_money"]`.
M-Pesa is returned by preview and accepted by initialization only for KES while
`PAYSTACK_MPESA_ENABLED=true`. Webhook/verify binding also requires provider
channel evidence to equal the persisted selection.

After server initialization, the page redirects to the exact Paystack-hosted
`authorization_url` returned by the backend. It does not construct a provider URL,
send the secret to the browser, or depend on a popup/CDN script opening reliably.
The provider callback is only a return route and is not payment proof. Existing
payment state uses one serialized chain of owned status reads and rate-limited
backend verification: `/checkout` waits about two seconds after each completed request,
polls for at most 100 checks, and requests authoritative provider verification
on the initial check and about every 16 seconds. Response object replacement
does not restart polling, and status/verification requests never overlap.
Unresolved attempts can be resumed with the same session-local idempotency key
only when the backend reports a usable provider session. Failed attempts use a
fresh payment idempotency key only when the backend permits retry. The legacy
`/checkout/payment/:orderId` route remains the callback and historical recovery
surface.

Checkout persists the payment intent before provider initialization and gives
that intent display priority while the cart refreshes in the background. An
initial status-read failure exposes a recoverable **Check again** action.
Exhausting browser polling or losing provider connectivity leaves the attempt
pending/`UNKNOWN`; neither condition creates a second attempt or implies
failure.

An idempotency key is bound to its original requested channel. Reusing it with
a different method is rejected. Initialization timeouts, unreadable/malformed
responses, and reference ambiguity remain `UNKNOWN`; they are never converted
to failure merely to permit a second attempt. Success settlement requires the
persisted reference, exact minor-unit amount, currency, normalized customer
email, and selected provider channel.

Release order: apply Prisma migration, deploy backend, then deploy frontend.
Live Card/M-Pesa test merchant access and webhook delivery are release gates,
not covered by local mocked provider tests.

`pnpm --filter @ecom/backend paystack:test-check` calls only the Paystack
balance endpoint and refuses missing, placeholder, or live keys. It does not
create an Ecom Order or transaction.

Focused local proof uses a migrated, seeded disposable PostgreSQL database and
`test/payment-settlement.int.spec.ts`. It covers server-owned money, method/key
binding, M-Pesa gating and `mobile_money`, Card binding, ambiguous outcomes,
signed webhook rejection and replay, exact-once settlement, reservation expiry,
late-success review, canonical reconciliation, and customer verification
throttling. `PaymentSettlementService` remains the only success-settlement
authority.

## Verification evidence — 2026-10-12

- All 12 forward migrations applied from zero and the deterministic seed ran on
  the isolated `ecom_checkout_verify_20261012` PostgreSQL database. The database
  was retained; no destructive reset or drop was performed.
- The complete backend integration aggregate passed 10/10 suites and 72/72
  tests in 48.44 seconds. This includes the corrected marketplace fixture; the
  catalogue pagination fixture was also narrowed to its owned categories so a
  seeded USD offer cannot alter its totals.
- Frontend verification passed all 3 Node test files and all 8 Vitest files (35
  tests). Focused regressions prove that exhausting 100 client polls stops
  polling while `UNKNOWN` remains `UNKNOWN`, never `FAILED`, and a definite
  provider failure retries with a fresh payment idempotency key.
- Headless Chrome exercised an authenticated checkout at 1280×900 and 375×812.
  Both rendered the server quote, accessible payment radiogroup, Card choice and
  enabled Pay control without horizontal overflow. Before the direct hosted-redirect
  change, a controlled provider double proved the hosted fallback. The current
  direct redirect is interaction-test covered but was not rerun in Chrome. A
  controlled `UNKNOWN` response
  rendered retry controls and an accessible temporary-error alert containing
  “This does not mean the payment failed,” without rendering a failed state.
- These browser/pending checks are local controlled-provider evidence,
  not live Paystack transaction or hosted-page proof.
- Ignored environments were classified without printing values. The QA key is
  intentionally synthetic and M-Pesa is unset/disabled. The normal actual-looking
  `sk_test_` key reached Paystack's read-only balance endpoint but received HTTP
  401, and both configured callback bases are local rather than publicly
  reachable. Both ignored credential files were tightened from mode `0664` to
  owner-only `0600`. Consequently no actual TEST Card or M-Pesa transaction,
  account channel eligibility, or public signed-webhook delivery was verified.

## Safe continuation point

Install a valid TEST secret in ignored configuration, keep production keys out
of this workflow, and rerun `paystack:test-check` until the balance read passes.
Then confirm the test merchant exposes Card and, before setting
`PAYSTACK_MPESA_ENABLED=true`, M-Pesa/mobile-money for KES. From a public test
callback/webhook endpoint, execute one Paystack-hosted Card success and eligible
M-Pesa success; retain provider references and prove signed delivery, duplicate
delivery dedupe, refresh recovery, retry after definite failure, and canonical
database convergence. Live-provider and public-webhook proof remain release
gates even though the equivalent local PostgreSQL/provider-double contracts
pass.

## Completion audit — 2026-10-12

- Pay now uses the server-returned hosted authorization URL directly. This removes
  the additional InlineJS load/popup boundary that could leave a persisted attempt
  without visibly opening checkout, while preserving the same callback and recovery
  routes.
- Initialization failures now expose only safe categories: rejected merchant
  configuration, provider rejection, uncertain network/timeout, or uncertain
  provider response. Raw provider details and secrets remain server-only. Definite
  failures permit a fresh idempotency key; uncertain outcomes continue to block a
  second charge.
- Integration setup now always replaces inherited Paystack credentials with the
  suite-only key and unreachable provider base, so deterministic tests cannot call
  a real provider accidentally.
- A fresh database received all 12 migrations and the seed. The focused real
  HTTP/PostgreSQL payment suite passed 8/8, covering Card and M-Pesa channel binding,
  initialization ambiguity, signed webhook rejection/replay, exact-once settlement,
  cancellation/expiry late success, reconciliation, and pending verification. The
  uniquely named disposable database was then removed.
- Backend unit tests passed 4 suites/23 tests. Frontend tests passed 3 Node files and
  9 Vitest files/49 tests; backend/frontend typechecks and lints passed.
- The read-only `paystack:test-check` reached Paystack and returned HTTP 401 for the
  configured ignored TEST key. Therefore hosted Card/cancellation, eligible M-Pesa,
  provider callback, and public webhook delivery remain externally blocked and were
  not claimed as passed. No live charge was initiated.

## Checkout polling and hosted-redirect regression — 2026-10-12

- Payment confirmation now uses a latest-snapshot ref, one in-flight guard and
  completion-relative `setTimeout` scheduling. Focused timer proof covers no
  response-identity restart, no overlapping verification, two-second status
  cadence and the next authoritative verification at about 16 seconds.
- Checkout persists the intent before initialization, renders one stable
  initialization state, and mounts payment progress only after initialization
  returns. Provider resume and retry controls are gated by backend-owned
  capabilities.
- The complete frontend test command passed 3/3 Node files and 9/9 Vitest files
  (40 Vitest tests). Frontend typecheck, lint and production build passed.
  Backend typecheck, lint, build and the 12-test Paystack unit suite passed.
- A fresh disposable database received all 12 migrations and baseline seed;
  the focused loopback HTTP/PostgreSQL payment suite passed 8/8, after which the
  disposable database was removed.
- Read-only QA inspection found the reported order still `PENDING_PAYMENT` and
  `UNPAID`; its only payment remains `UNKNOWN` with `NETWORK_ERROR`, no provider
  status and no initialization timestamp. No database state was changed by the
  inspection.


## Provider readiness, customer recovery and saved account data (2026-10-21)

The configured backend is NOT proof that the real Paystack merchant account or key works.
A missing/placeholder/wrong-merchant `PAYSTACK_SECRET_KEY` may cause HTTP 401/403 or
provider initialization rejection; the application never exposes the key to the browser.
Use a real test-mode key from the correct Paystack business for sandbox runs.
Live keys require merchant onboarding/activation and a separate authorized release.
For local diagnostics, source `.env` privately, then run
`pnpm --filter @ecom/backend paystack:test-check`: this sends a read-only
balance request and checks authentication, but does not certify checkout
currency/channel eligibility. Never share or commit the secret key.

`PAYSTACK_CALLBACK_BASE_URL` must be the actual customer-facing frontend
origin, and browser users must be able to open the callback
`/checkout/payment/:orderId`. The callback is not settlement evidence.
For webhook delivery, register the **public HTTPS** backend URL
`/payments/paystack/webhook` in the corresponding Paystack merchant dashboard;
`localhost` cannot receive Paystack events. The webhook verifies the raw
HMAC signature before settlement. Real account activation, KES eligibility,
card/mobile money channel permissions, and DNS/TLS/webhook reachability
are external release gates not proven by CI.

Customers can voluntarily abandon only an uncharged/definitively failed
unpaid order. The UI calls the server-owned cancellation endpoint, which
rejects orders with a PENDING, INITIALIZATION_PENDING, UNKNOWN or SUCCEEDED
payment. A successful cancel releases physical and overseas reservations,
then clears only that browser's stored checkout intent and returns to cart.
Provider-unknown attempts must be verified or reviewed; never clear them
as if they were failed. Late authoritative success after a cancelled order
still enters PAYMENT_REVIEW rather than silently losing payment evidence.

`/account` loads the customer's persisted `/customer/profile` and
`/customer/addresses` and displays the saved contact fields and default
delivery address. These customer-only APIs are not queried for workforce
accounts. Sensitive payout destination data is a separate permission-controlled
supplier finance domain and is not displayed in the customer account overview.

## Operator error classification

| Observation | What to check |
| --- | --- |
| HTTP 401/403, `CONFIGURATION_REJECTED` | Paystack merchant test key, environment and key ownership |
| Provider HTTP rejection, `PROVIDER_REJECTED` | Supported currency, amount, enabled channel, merchant country |
| `NETWORK_UNCERTAIN` or `UNKNOWN` | API reachability/timeouts and authoritative verification; never duplicate |
| Hosted checkout opens but callback fails | `PAYSTACK_CALLBACK_BASE_URL` and frontend port/proxy |
| Callback returns but payment remains pending | Provider verify evidence, signed webhook delivery, reconciliation worker |
| M-Pesa option not visible | Order currency KES, merchant channel eligibility and `PAYSTACK_MPESA_ENABLED` |
| Paid overseas order sent to review | Verify overseas reservation status and combined settlement invariants |
