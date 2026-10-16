# Platform Operations

All operations endpoints require `platform.operations.read`. `GET /platform/operations/summary` uses database `COUNT` queries only and returns authoritative counts for support, payment review/unknown payments, delivery queues, post-order queues, settlements, and outbox state.

`GET /platform/operations/outbox` is a permission-gated, sanitized view of operational delivery intent; payloads are never exposed. The paginated queues are `payment-review`, `delivery-quotes`, `refunds`, `returns`, `warranties`, `settlements`, `support-overdue`, and `outbox-failures`. They deliberately return triage fields only (identifiers, current state, timestamps, amounts/currency where appropriate, and assignment where appropriate).

Support and audit use separate, least-privilege platform permissions.
