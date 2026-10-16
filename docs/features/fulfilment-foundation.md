# Fulfilment Foundation

## Status and ownership

Implemented and integration-verified. `Order` remains the customer aggregate;
`SupplierOrder` is the supplier operational unit. Supplier reads require `orders.read`.
Owner/admin receive `fulfilment.update`; members remain read-only.

## Lifecycle

`FulfilmentLifecycleService` owns explicit commands. Delivery follows `CONFIRMED ->
PREPARING -> READY_FOR_DISPATCH -> OUT_FOR_DELIVERY -> COMPLETED`; pickup follows
`CONFIRMED -> PREPARING -> READY_FOR_PICKUP -> COMPLETED`. Method-crossing and unpaid
transitions fail. Conditional updates, row locks, serializable retries, and same-target
idempotency prevent contradictory or duplicate history under concurrency.

Each SupplierOrder starts with history, payment settlement records confirmation, and
every actual operational transition appends actor, reason, customer-safe public message,
and optional internal note. Cancellation and expiry append supplier history as well.

## Order aggregation

`OrderFulfilmentAggregationService` is the only parent-state authority. All completed
becomes `DELIVERED`; all pickup units ready/completed becomes `READY_FOR_PICKUP`; all
delivery units out/completed with at least one out becomes `OUT_FOR_DELIVERY`; mixed
post-payment progress becomes `PROCESSING`. `PAYMENT_REVIEW`, `CANCELLED`, and `EXPIRED`
are never overwritten. An Order history row is written only when the aggregate changes.

## Collection

Pickup checkout derives a repeatable customer collection code server-side and persists
only its SHA-256 hash. Completion requires authenticated supplier authorization, the
supplier's own ready SupplierOrder, and a matching code. One Order code applies across
all suppliers at the same PickupPoint; each supplier completes only its own unit, and
the parent completes only after all units complete.

## Verification and limits

The integration suite proves read/update RBAC separation, cross-supplier denial,
method-specific transitions, aggregation, collection-code failure/success, exact-once
concurrent completion, and history. No courier, driver, return, refund, warranty,
settlement, notification, or supplier/customer UI is included.

## Safe continuation

Preserve SupplierOrder as the operational unit, explicit commands, append-only history,
the canonical aggregator, and terminal/special-state protection. Next: post-order
returns, refunds, warranties, and supplier financial foundations.
