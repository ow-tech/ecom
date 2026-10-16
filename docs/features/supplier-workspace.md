# Supplier Workspace

## Status

SUPPLIER_WORKSPACE_IMPLEMENTATION: COMPLETE

SUPPLIER_WORKSPACE_RELEASE_VERIFICATION: BROWSER_PENDING

Focused real Nest/PostgreSQL regression and jsdom interaction verification are complete. Authenticated browser and responsive verification remain pending.

## Routes

- `/supplier/:organizationId` — live overview derived from listings, inventory and supplier orders.
- `/supplier/:organizationId/profile` — supplier profile and DRAFT submission flow.
- `/supplier/:organizationId/listings` — supplier-owned listing list, create-draft form, and canonical activation/deactivation.
- `/supplier/:organizationId/inventory` — stock overview, receipt, locations, and append-only movement history.
- `/supplier/:organizationId/orders` and `/fulfilment` — supplier-scoped orders, histories, and supported fulfilment actions.
- `/supplier/:organizationId/finance` — read-only ledger-derived balances, commission records, and supplier-authorized settlements.
- `/supplier/:organizationId/returns` and `/warranties` — supplier-filtered after-sales projections; lifecycle commands remain platform-only.
- `/supplier/:organizationId/support` — organization-owned ticket list, public conversation, and permission-gated create/reply controls.

## Contracts and authorization

The browser uses only organization-scoped Nest endpoints for Supplier,
SupplierListing, Inventory, SupplierOrder and Fulfilment operations. The route
parameter is a context request, not proof: every backend operation resolves
`RbacService.organizationContext` and supplier ownership. Switching the
organization changes the route, remounts all scoped workspace queries, and
recomputes navigation from that membership's permissions.

The listing picker uses `GET /organizations/:organizationId/listings/products/selection`.
It is a supplier-listing-create-permission read-only projection of active products,
active variants, category label and safe image metadata. It is deliberately not
the availability-gated public catalogue or the platform product-admin API.

The UI does not offer platform lifecycle approval, direct status PATCHes, or
reserve/release/consume actions. Pickup completion submits the customer-presented
code only to `complete-pickup`, clears it immediately, and never displays stored
hashes or codes.

`GET /organizations/:organizationId/supplier/overview` is the authoritative
overview aggregate. It returns active-listing counts only with listings-read,
stock attention (`onHand <= reserved`) only with inventory-read, and preparation
or handover counts only with orders-read. The UI omits unavailable metrics rather
than issuing unauthorized resource requests or counting a paginated page.

## UI and limitations

Pages compose `WorkspaceShell` and canonical UI primitives. Loading, empty,
error/retry and pending mutation states are represented at each API boundary.
The inventory page exposes canonical stock receipt, removal, signed-delta manual
adjustment (with required reason and a confirmation), and movement evidence.
Listing editing exposes only the existing allow-listed commercial fields.

The latest focused verification used a fresh disposable PostgreSQL 16 database,
applied all 10 migrations, seeded twice, and ran the real Nest loopback supplier
suite (11 tests). Current frontend and backend typecheck, lint, and production
build commands also passed. The overview matrix proves active membership receives `200`,
while URL-only cross-tenant, suspended-membership, platform-only, and missing
`supplier.read` requests receive `403`. With `supplier.read` alone every metric
is omitted (`null`); listings-only returns active listings only; inventory-only
returns stock attention only; orders-only returns preparing and ready only; all
three scoped permissions return all metrics. The deterministic aggregate fixtures
produced 22 active listings (one inactive excluded), 2 stock-attention inventory
records (`onHand <= reserved`), 2 preparing (`CONFIRMED`/`PREPARING` definition),
and 2 ready (`READY_FOR_PICKUP`/`READY_FOR_DISPATCH` definition). Additional
records beyond ordinary list page sizes prove these totals do not depend on list
pagination. Supplier B fixtures do not affect Supplier A.

Vitest + jsdom and Testing Library now run ten SupplierWorkspace interaction
tests. They retain overview retry/metric omission, listing product/variant
selection, inventory conflict refresh/read-only controls, and deferred
organization-switch protection (an old response cannot overwrite the selected
organization). They also cover authorized secure pickup visibility, no backend
call for blank code, canonical trimmed-code submission to the selected
SupplierOrder, pending disable, authoritative reload and clearing, safe invalid
code behavior, conflict refresh without a second completion, unauthorized hiding,
and no code persistence in storage, URL, or logging.

BROWSER_VERIFICATION_PENDING_ENVIRONMENT: authenticated viewport journeys at
375px, 768px, and 1280px remain release verification debt; no browser runtime was
introduced by this task.
