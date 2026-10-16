# Operational Outbox and Notifications

Operational side effects are written to `OperationalOutboxEvent` in the same PostgreSQL transaction as commerce transitions. `dedupeKey` is unique. The polling processor claims rows with `FOR UPDATE SKIP LOCKED`, increments attempts, uses bounded exponential retry, and leaves terminal failures observable. `ORDER_CREATED`, `PAYMENT_REQUIRED`, and `ORDER_CANCELLED` are emitted by the checkout/cancellation transaction; payment confirmation and supplier fulfilment lifecycle notifications retain their existing canonical seams.

`Notification` is recipient-owned and deduplicated. In-app delivery is available immediately. Every external delivery creates an append-only attempt: a failed attempt is never rewritten by a retry, and a configured test transport may record a later `SUCCEEDED` attempt. EMAIL and SMS have no production provider configured, so requests without a transport record `NOT_CONFIGURED` with `PROVIDER_NOT_CONFIGURED`, never delivery success. Optional in-app categories honor a stored disabled preference; mandatory `PAYMENT_CONFIRMED`, `REFUND_COMPLETED`, and `SECURITY` notices remain available.

Run a worker as an explicit process which invokes `OperationalOutboxProcessor`; the web process does not poll by default. Configure `OUTBOX_BATCH_SIZE` (25) and `OUTBOX_MAX_ATTEMPTS` (8) to tune bounded processing.

Run the worker with `pnpm --filter @ecom/backend worker:operations`. The worker performs one bounded cycle and exits, making process supervision/scheduling explicit. In-app notifications are delivery-attempted as `AVAILABLE`; email and SMS are not configured and must never be represented as delivered. Financial confirmation (`PAYMENT_CONFIRMED`) is mandatory; optional categories may be disabled by recipient preferences when a configured channel is added.

Current customer event mapping: `ORDER_CREATED`, `PAYMENT_REQUIRED`, `PAYMENT_CONFIRMED`, `PAYMENT_REVIEW`, `ORDER_EXPIRED`, `ORDER_CANCELLED`, `DELIVERY_QUOTE_READY`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `REFUND_APPROVED`, terminal `REFUND_COMPLETED`/`REFUND_FAILED`, `RETURN_STATUS_CHANGED`, `WARRANTY_STATUS_CHANGED`, `SUPPORT_REPLY`, and `SUPPORT_RESOLVED`. New return/warranty requests and settlement lifecycle events resolve supplier recipients from active organization memberships with the relevant return, warranty, or `finance.read` permission. Each payload derives its recipient from authoritative ownership or membership; callers never supply a recipient.

Fulfilment customer notices are parent-`Order` events. A supplier-order transition first recomputes the authoritative parent aggregate; only a newly reached `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, or `DELIVERED` parent state enqueues a notice. This prevents a partial multi-supplier order from notifying early and makes the order-state dedupe key the single logical notification identity. A successful payment settlement also emits one `PAID_SUPPLIER_ORDER` intent per eligible active supplier member (`orders.read` or `fulfilment.update`) for each actionable supplier order.

Verification status: the focused HTTP/PostgreSQL fulfilment regression proves the parent-order `READY_FOR_PICKUP` and `ORDER_DELIVERED` intents and retry dedupe. The complete commerce notification matrix, supplier-recipient matrix, operations queue matrix, and privileged-audit matrix remain verification-pending until their requested canonical-action-to-processor-to-notification rows are executed.

`apps/backend/test/operations-layer.int.spec.ts` is the focused real Nest HTTP/PostgreSQL suite. It covers durable enqueue shape, concurrent dedupe, concurrent processor claiming, retry evidence, notification dedupe, recipient isolation, unread reads, optional preference suppression, and mandatory-policy override. It must be run with a migrated disposable `TEST_DATABASE_URL`; it is not a unit substitute for PostgreSQL locking.

| Invariant | Seam | Focused proof |
| --- | --- | --- |
| INV-OUT-01 | `OperationalOutboxService.enqueue` | durable enqueue assertion |
| INV-OUT-02 | unique `dedupeKey` | concurrent enqueue assertion |
| INV-OUT-03 | `OperationalOutboxProcessor.processBatch` | two concurrent processors |
| INV-OUT-04 | processor failure branch | failure then retry assertion |
| INV-NOT-01/02/03 | `NotificationService` and controller | recipient HTTP isolation and concurrent dedupe |
| INV-NOT-04 | immutable delivery attempts | in-app `AVAILABLE`, failed/retry/unconfigured external attempt proof |

## Crash recovery and lease fencing (2026-10-16)

`OperationalOutboxProcessor.processBatch` now reclaims `PROCESSING` rows with a stale `claimedAt` lease (default 300 seconds, configured by `OUTBOX_CLAIM_LEASE_SECONDS`). It marks exhausted abandoned claims `FAILED` with `CLAIM_LEASE_EXPIRED`, preserving audit/operations visibility. Eligible reclaims use PostgreSQL `FOR UPDATE SKIP LOCKED`. Completed/failure updates compare event ID, `claimedBy`, and attempt generation, so an old worker cannot overwrite status after its lease has been reclaimed. Existing `NotificationService.create` unique `dedupeKey` is the replay side-effect boundary.

The focused real PostgreSQL suite verifies concurrent crashed-claim recovery, stale-worker completion/failure fencing, exactly one recipient-visible notice and terminal exhausted-lease failure. No new table or migration needed. A worker remains a one-shot bounded process: deployment must schedule it periodically and monitor long-running handlers. A lease longer than normal handler processing is recommended. This does not prove external email/SMS delivery; those remain NOT_CONFIGURED without adapters.
