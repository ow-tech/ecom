# Platform Operations

All operations endpoints require `platform.operations.read`. `GET /platform/operations/summary` uses database `COUNT` queries only and returns authoritative counts for support, payment review/unknown payments, delivery queues, post-order queues, settlements, and outbox state.

`GET /platform/operations/outbox` is a permission-gated, sanitized view of operational delivery intent; payloads are never exposed. The paginated queues are `payment-review`, `delivery-quotes`, `refunds`, `returns`, `warranties`, `settlements`, `support-overdue`, and `outbox-failures`. They deliberately return triage fields only (identifiers, current state, timestamps, amounts/currency where appropriate, and assignment where appropriate).

Support and audit use separate, least-privilege platform permissions.

## Platform background jobs client (2026-10-16)

`/platform/operations` displays a permission-gated, paginated operational-outbox projection from existing `GET /platform/operations/outbox` under `platform.operations.read`. It defaults to FAILED, supports PROCESSING/PENDING/PROCESSED/all filters and request-fenced refresh/pagination. Event payloads, recipient identity and provider secrets are never projected to the browser. The UI has no arbitrary retry buttons, no direct balance, refund, session or inventory mutation. Server-bound worker lease recovery is independent of this read-only interface. Tests cover filtered reads, stale-response suppression, backend errors and retry.
