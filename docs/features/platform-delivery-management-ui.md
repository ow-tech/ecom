# Platform delivery and pickup management

## Status

IMPLEMENTED_VERIFICATION_PARTIAL — permission-aware platform configuration UI is committed on `dev`. Focused frontend tests are committed but were not executed in this session. Backend canonical fulfilment integration fixtures exist from earlier work; staging/browser operations remain unverified.

## Purpose

Platform operations staff need to manage active pickup points, delivery zones/rates and manual delivery quotations without direct database edits. Customers continue to choose delivery or pickup through the existing `/checkout` server-owned pricing/quote flow.

## Implementation map

- UI: `apps/frontend/components/platform-delivery-management.tsx`, rendered by the existing delivery section of `apps/frontend/components/platform-workspace.tsx`.
- Client API: `apps/frontend/lib/api.ts`: list/create/update platform pickup points; delivery zones/rates; view/issue delivery quotes.
- Existing backend:
  - `apps/backend/src/pickup-points/pickup-points.controller.ts`
  - `apps/backend/src/delivery/delivery.controller.ts`
  - `apps/backend/src/pickup-points/pickup-points.service.ts`
  - `apps/backend/src/delivery/delivery.service.ts`
- Database: existing `PickupPoint`, `DeliveryZone`, `DeliveryRate`, `DeliveryQuote` and immutable customer order snapshots. No migration.
- UI regressions: `apps/frontend/test/platform-delivery-management.test.tsx`.
- Existing real HTTP/PostgreSQL: `apps/backend/test/fulfilment-delivery-pickup.int.spec.ts`.

## Important invariants

- INV-DELIVERY-01: Organization InventoryLocation is distinct from platform-managed customer PickupPoint.
- INV-DELIVERY-02: Pickup fee, rates, approved delivery quote, pickup location and address snapshots remain server-owned during checkout; edits to configuration never modify historic orders.
- INV-DELIVERY-03: A manual quote cannot initialize payment before customer approval; its amount/currency is derived and validated by the server.
- INV-DELIVERY-04: Platform pickup read/write require their separate permissions; delivery rate/zone writes require platform.delivery.manage; manual quotes require platform.delivery.quote. UI hides unavailable controls; API is still authoritative.
- INV-DELIVERY-05: Supplier fulfilment transitions remain owned by `FulfilmentLifecycleService`, including secure collection confirmation; this UI does not introduce another order lifecycle.

## Known boundaries / TODO

- `PickupPoint.pickupFee` stores an amount but not an explicit fee currency. The admin UI displays a raw fee instead of guessing one. Confirm checkout pricing for non-KES suppliers before release; a model change requires a business decision and migration.
- No courier-provider integration, fleet dispatch, warehouse scans, driver assignment, or route optimization is added by this feature.
- Historical checkout release verification remains pending: real authenticated mobile/desktop browsers and staging Paystack/customer pickup or delivery journey.
- The backend already validates price/quote snapshots and secure pickup codes; do not duplicate validation in the browser.

## Acceptance and safe continuation

Execute fresh disposable PostgreSQL migration+seed, then the focused backend delivery/fulfilment suite and frontend Vitest/typecheck/lint/build. Browser-test role-protected create/edit/activate/deactivate point, zone and rate; customer point selection and quote re-rating; manual quote issuance/approval; secure pickup; and two-supplier delivery aggregation. Verify denied actions through direct HTTP requests, not merely hidden controls.

Read this document and `docs/features/delivery-pickup.md` next. The canonical next seam is operational end-to-end verification, not a redesign of the underlying fulfilment service.
