# Refunds

## Status

Implemented foundation. A customer `RefundRequest` is distinct from a provider `Refund`.

## Contract

Customers may request a refund only for their own paid, delivered order items. The server derives each allocation from immutable `OrderItem.unitPrice * quantity`; delivery and pickup fees are not automatically refunded. Active refund allocations reserve quantity, so pending, approved, or refunded requests cannot exceed the purchased quantity. Platform review creates one Refund bound to the original successful Payment.

`POST /platform/refunds/:id/execute` persists `UNKNOWN` before the Paystack call. A timeout remains unresolved and may only be reconciled with Paystack fetch/list evidence; it is never blindly resubmitted. Provider success appends `RefundEvent`, updates only the post-order refund dimension, and posts historical supplier adjustments once.

Paystack uses the original transaction reference, minor-unit amount, currency, and an internal merchant-note identity. `processed` is treated as authoritative refund success; pending/processing remain pending; definite failures are failures.

## Invariants

INV-REF-01 through INV-REF-07: customer ownership, server-derived amount, paid-amount cap, idempotent provider boundary, unresolved ambiguity, append-only provider evidence, and exact-once financial effects.

## Verification

Real Nest HTTP/PostgreSQL integration coverage proves customer ownership, immutable
item-price derivation, partial-allocation protection, concurrent final-quantity
rejection, platform-only approval/execution, and exactly one provider-create call.
The deterministic Paystack double covers processed evidence and timeout ambiguity;
reconciliation queries persisted provider identity and does not create another refund.
Successful evidence posts one proportional historical-commission supplier debit.

Additional HTTP/PostgreSQL matrix coverage proves a customer cannot list another
customer's requests, organization staff cannot approve a refund merely because they
own the fulfilling supplier, and least-privilege platform roles enforce the separate
read and review permissions. Provider output continues to be sanitized by the refund
output projection; no provider credentials or raw authorization evidence is returned.

## Invariant evidence matrix

| Invariant | Implementation seam | Test | Status | Limitation |
| --- | --- | --- | --- | --- |
| INV-REF-01 | `RefundsService.create` | `derives and protects refund quantities...` | PASS | Customer ownership is HTTP-proven. |
| INV-REF-02 | immutable `OrderItem` pricing | `derives and protects refund quantities...` | PASS | Server-derived amount is asserted. |
| INV-REF-03 | allocation transaction | `derives and protects refund quantities...` | PASS | Final-quantity concurrency is asserted. |
| INV-REF-04 | provider execution/reconciliation | `derives and protects refund quantities...` | PASS | One provider call and timeout ambiguity are covered. |
| INV-REF-05 | refund status/evidence | `derives and protects refund quantities...` | PASS | Unknown state is reconciled without blind resubmission. |
| INV-REF-06 | `RefundEvent` | `derives and protects refund quantities...` | PASS | Provider evidence is persisted through the canonical path. |
| INV-REF-07 | historical finance posting | `derives and protects refund quantities...` | PASS | One proportional supplier debit is asserted. |

## Platform refund execution UI

Platform after-sales provides an explicitly confirmed `POST /platform/refunds/:id/execute` for CREATED provider refunds (not unresolved replays) and evidence reconciliation for UNKNOWN/PENDING. Real Paystack REFUND execution remains an external release-verification gate.

## Customer request interface

Customers can now request an item-specific refund and see its lifecycle in `/account/orders/:orderId/after-sales`. The browser supplies item ID, quantity and reason only; money remains server-derived, and payment-provider execution remains platform-only. See [customer-aftersales-ui.md](customer-aftersales-ui.md).
