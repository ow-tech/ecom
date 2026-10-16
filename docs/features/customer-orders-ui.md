# Customer Orders UI

## Status

Implemented in the customer frontend. The production build and real Nest loopback HTTP/PostgreSQL verification are complete; browser journey and responsive viewport proof remain pending.

## Routes and contracts

- `/account/orders` calls `GET /customer/orders` and shows owned order snapshots, payment/order states, fulfilment method, total, and item summary.
- `/checkout/payment/:orderId` remains the canonical order detail and payment-continuity route. It calls owned order/payment endpoints plus `GET /customer/orders/:orderId/tracking`.
- The detail view renders immutable OrderItem product, variant, supplier, SKU, price, quantity, fee, and total snapshots. It never substitutes current catalogue prices.

## Tracking and fulfilment

`OrderTrackingTimeline` renders only committed OrderStatusHistory and SupplierOrderStatusHistory projection timestamps and public messages. It uses separate supplier progress rows for multi-supplier orders and does not derive aggregate completion in the browser. Pickup shows the immutable customer-safe pickup snapshot; delivery shows only a coarse customer-safe destination. Pending delivery quotes stay visibly non-payable.

Payment actions continue to use the existing server-owned payment state mapping. Paid and review states are informational; expired/cancelled orders cannot start payment.

## Privacy and UI

All reads are authenticated customer-owned backend routes. The tracking projection excludes internal operational notes and provider evidence. Pages compose `StorefrontContainer`, `PageHeader`, `Surface`, `StatusBadge`, `Money`, `OrderSummary`, `Skeleton`, `EmptyState`, and `ErrorState`; mobile layouts stack naturally.

## Verification

The production build completed after adding Suspense boundaries around the two static routes that use `useSearchParams` (`/account/support/new` and `/checkout/payment/[orderId]`). Without those boundaries Next's static-page worker exited with code 1 during generation; compilation and TypeScript had already succeeded.

A disposable PostgreSQL 16 database received all 10 current migrations and the deterministic seed twice. Real Nest loopback HTTP coverage proves owned order list/detail, immutable order-item price snapshots, tracking timestamps and public-message projection, multi-supplier progress, payment ownership/continuity, and cross-customer denial. Frontend test/typecheck/lint/build passed. Browser checks at 375/768/1280 and live Paystack verification were not run.
