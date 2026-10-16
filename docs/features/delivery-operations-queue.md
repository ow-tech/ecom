# Delivery and pickup operational queue

Status: IMPLEMENTED_VERIFICATION_PARTIAL until the current dev CI run and authenticated browser evidence pass.

## Purpose
Platform operators can triage paid orders by delivery/pickup method and canonical order status across suppliers without needing supplier membership. Every supplier still owns its own fulfilment transitions; the queue is read-only.

## Canonical execution path
`/platform/delivery` -> `DeliveryOperations` -> `GET /platform/delivery/operations` -> `SessionAuthGuard` -> `RbacService.requirePlatform(platform.delivery.read)` -> `DeliveryService.operations` -> PostgreSQL `Order` and `SupplierOrder` projections.

The API returns bounded pagination (`page` 1+, `limit` 1–100, default 25), deterministic `createdAt DESC, id DESC`, optional `fulfillmentMethod` and actionable order `status`. Only paid `PAYMENT_CONFIRMED`, `PROCESSING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY` are eligible. It does not expose customer IDs, collection-code hashes/plaintext, full delivery addresses, item financials, or supplier internal notes.

## Invariants
- INV-DELIVERY-OPS-01: `platform.delivery.read` authorizes observation only; never grants supplier fulfilment mutation rights.
- INV-DELIVERY-OPS-02: Special payment-review/cancelled/expired and unpaid orders are excluded from active paid operations.
- INV-DELIVERY-OPS-03: The platform queue never recomputes order truth or calls provider APIs; it projects canonical `Order` and `SupplierOrder` state.
- INV-DELIVERY-OPS-04: No customer-private delivery address or collection credential enters this response.
- INV-DELIVERY-OPS-05: Stable pagination is server-side; filters reset frontend pagination.

## Tests
- `apps/backend/test/fulfilment-delivery-pickup.int.spec.ts`: authorization denial, valid paid pickup parent/supplier projection, redaction, validation bounds, canonical transition visibility.
- `apps/frontend/test/platform-delivery-operations.test.tsx`: success/refresh, filter behavior, and failed-read retry.
- `.github/workflows/ecom-verification.yml`: fresh migration/seed, backend/frontend checks and PostgreSQL integration.

## Remaining
No courier provider, driver assignment or live delivery GPS tracking is introduced. This is an operational visibility feature, not a claim that external courier dispatch or logistics integrations exist.

## Safe continuation
Preserve `FulfilmentLifecycleService` and parent-state aggregator as the only transition authorities. Review the operational queue on authenticated mobile and desktop browsers. Next supplier vertical: staff invitation, membership permissions, and reporting.

## Request-fencing correction (2026-10-16)

`DeliveryOperations` now increments a request generation when filters, pagination or manual refresh change, and ignores prior responses/errors. Unmount also invalidates outstanding requests. The matching frontend regression deliberately resolves the old-filter request after the new result and asserts the newer supplier queue remains visible. This is a frontend consistency fix: canonical authorization and order state remain backend-owned.
