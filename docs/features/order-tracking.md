# Order Tracking

## Contract

`GET /customer/orders/:orderId/tracking` requires authenticated customer ownership and
returns order number, payment/fulfilment/current status, quote state, immutable pickup
or delivery data, per-supplier public progress, and a deterministic chronological
timeline.

The projection reads `OrderStatusHistory`, `SupplierOrderStatusHistory`, DeliveryQuote,
and current SupplierOrder state. It does not create a second mutable tracking table.
Supplier display names and `publicMessage` may be returned. `internalNote`, provider
evidence, supplier costs, credentials, and unrelated identifiers are excluded.

## Verification and continuation

Integration proves owner access, foreign-customer denial, payment and fulfilment events,
chronological output, public-message visibility, internal-note privacy, pickup readiness,
delivery progress, completion, and mixed supplier-safe progress. Anonymous public
tracking, notifications, courier events, proof media, and live maps are future scope.

Preserve the append-only evidence projection and ownership boundary when adding returns,
refunds, warranties, or future courier integrations.

## Customer UI

The canonical customer order detail/payment-continuity route is
`/checkout/payment/:orderId`. It consumes this projection through a reusable timeline,
renders timestamped public events only, separates supplier progress when more than one
supplier participates, and displays only customer-safe pickup/delivery information.
