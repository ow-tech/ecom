# Customer after-sales requests and tracking

Status: IMPLEMENTED_VERIFICATION_PARTIAL — committed frontend/UI tests, backed by existing canonical HTTP/PostgreSQL flows; release browser and actual Paystack refund verification pending.

## Purpose and behavior
Delivered, paid customer orders expose /account/orders/:orderId/after-sales linked from the order list and payment/order detail. The customer can choose an immutable order item and a positive bounded quantity for a return or refund request; or submit a warranty claim with an issue description for an item with a recorded warranty duration. Existing owned refund/return/warranty records show their current status; unavailable/ineligible orders display read-only state.

## Canonical chain
Customer UI -> frontend lib/api.ts -> authenticated Nest CustomerOrders/CustomerRefunds/CustomerPostOrder endpoints -> CustomerProfile ownership, PostOrderService/RefundsService -> PostgreSQL snapshots, allocation constraints, histories and operational notification intents.

Inputs never contain client-calculated money, supplier ownership, commission or provider references. A successful POST means request accepted, **not** refund issued. Existing platform-authorized processing and payment provider evidence remain unchanged. The API validates delivered-at history, warranty window, item belonging, allocation remaining quantity and concurrent submissions.

## Tests and invariants
- INV-AFTER-01: Customer identity determines item/order and request ownership; guessing foreign IDs returns 404.
- INV-AFTER-02: Only canonical backend calculates/refunds amounts; browser never creates a financial liability by marking success.
- INV-AFTER-03: Warranty terms derive from immutable `OrderItem.warrantyDaysSnapshot`.
- INV-AFTER-04: Return receipt/completion doesn't restock inventory automatically; refund resolution uses `RefundsService`.
- INV-AFTER-05: Failed writes show errors and preserve current request visibility; historical requests remain available on ineligible orders.

Frontend: `apps/frontend/test/customer-after-sales.test.tsx`; existing backend integration proof: `apps/backend/test/post-order-finance.int.spec.ts`.

## Limitations and continuation
New UI submits one order line per request. Multi-line refund/return DTOs already exist but bulk form UX is deferred. Physical return shipping, warehouse inspection evidence, external courier APIs and Paystack live refunds require separate operational integration and staging credentials. Responsive authenticated browser journeys must be tested before release.
