# Reservation Expiry

## Status and policy

Implemented as a bounded, replica-safe service and protected platform operation.
Reservation TTL is authoritative for the stock hold even while a provider attempt is
`PENDING` or `UNKNOWN`. Expiry never changes physical `onHand`.

## Canonical processing

`ReservationExpiryService.expireBatch` selects a bounded set of Orders with due
ACTIVE reservations. `expireOrder` runs serializably, locks the Order, and retries
serialization conflicts. It skips non-pending/non-unpaid Orders and any Order with a
known successful Payment. `InventoryService.expireOwned` conditionally claims each
due ACTIVE reservation before decrementing aggregate `reserved`, so concurrent
workers cannot release twice.

When no ACTIVE reservations remain, Order becomes `EXPIRED`, SupplierOrders become
`EXPIRED`, and history is appended. CONSUMED, RELEASED, EXPIRED, and future ACTIVE
reservations are untouched. If payment success wins the lock first, normal settlement
consumes the reservation. If expiry wins first, later success routes to
`PAYMENT_REVIEW/PAID_REVIEW` and leaves inventory unchanged.

## Operation and configuration

`POST /platform/payments/reservations/expire` requires
`platform.payments.reconcile` and accepts an optional bounded limit.
`RESERVATION_EXPIRY_BATCH_SIZE` defaults to 100 and caps each call. Deployment should
invoke this operation every minute through a trusted scheduler. No Nest cron or
BullMQ dependency is introduced, avoiding single-replica assumptions and a parallel
business-logic path.

## Failure and continuation

A transaction failure rolls back reservation, aggregate quantity, Order,
SupplierOrder, and history changes together. Repeated calls are no-ops. Database
serialization conflicts retry up to three times. Manual payment-review resolution,
refunds, fulfilment, delivery, and pickup remain future work.
