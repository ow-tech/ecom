# Returns and Warranties

## Returns

Returns are operational recovery, not refunds. They are restricted to delivered orders and canonical `DELIVERED` history evidence inside `RETURN_WINDOW_DAYS` (default 30). `ReturnItem` allocations protect remaining quantity under serializable transactions. Status history is append-only. Receiving or completing a return never restores inventory; later restock/quarantine/write-off remains a separate operator decision. Supplier endpoints are read-only projections; lifecycle commands are platform-permission commands.

A return resolution of `REFUND` creates a normal server-derived refund request through `RefundsService`; it does not calculate money or call Paystack itself. Supplier return reads filter to that supplier's order items only.

## Warranties

Supplier listings may declare `warrantyDays`; checkout snapshots it into `OrderItem.warrantyDaysSnapshot`. Claims require a positive snapshot and delivered evidence; `null` and `0` mean no warranty. The window starts at canonical `DELIVERED` history time and is inclusive at its exact final millisecond; the next millisecond is expired. Later listing edits cannot alter historical eligibility. Warranty history is append-only and supplier reads are item/supplier scoped. A refund resolution reuses the same canonical refund request seam.

## Invariants

INV-RET-01 through INV-RET-05 protect quantity, lifecycle, isolation, no automatic restock, and history. INV-WAR-01 through INV-WAR-04 protect snapshot terms, delivery-based start, supplier isolation, and history.

## Verification

Real Nest HTTP/PostgreSQL coverage exercises delivered-history eligibility, return
quantity conflicts, the documented return lifecycle and append-only history, and
the invariant that receipt/completion never creates sellable stock or stock-in
movement. Warranty coverage proves the immutable purchase snapshot remains in force
after current listing terms change, and verifies its documented lifecycle history.

Additional HTTP/PostgreSQL coverage proves an organization cannot fetch a guessed
return belonging to another supplier, including a shared request where every supplier
receives only its own `ReturnItem`s from the backend query. Customer and platform
views retain the complete request. The current public API has no supplier transition
endpoint; return and warranty state transitions remain platform-permission commands.

Warranty REFUND resolution locks the claim before entering the canonical
`RefundsService` path and retries PostgreSQL serialization conflicts. A repeated or
concurrent terminal command therefore returns the one linked logical refund outcome;
provider execution and supplier debit remain exclusively on the ordinary refund path.

## Invariant evidence matrix

| Invariant | Implementation seam | Test | Status | Limitation |
| --- | --- | --- | --- | --- |
| INV-RET-01 | `PostOrderService.createReturn` | `uses delivery history for return and warranty eligibility...` | PASS | Quantity race is covered. |
| INV-RET-02 | return transition service | `uses delivery history for return and warranty eligibility...` | PASS | Canonical lifecycle exercised. |
| INV-RET-03 | `supplierReturns` projection | `enforces refund, finance, return, and warranty privacy...` | PASS | Guessed cross-supplier detail is denied. |
| INV-RET-04 | return completion | `uses delivery history for return and warranty eligibility...` | PASS | No inventory restoration is asserted. |
| INV-RET-05 | `ReturnStatusHistory` | `uses delivery history for return and warranty eligibility...` | PASS | One history row per exercised transition. |
| INV-WAR-01 | `OrderItem.warrantyDaysSnapshot` | `uses delivery history for return and warranty eligibility...` | PASS | Listing changes do not rewrite purchase terms. |
| INV-WAR-02 | `createWarranty` delivery evidence | `proves warranty eligibility boundaries and the complete platform lifecycle` | PASS | Null/zero, delivery timestamp, inclusive final boundary, and first invalid millisecond are HTTP-proven. |
| INV-WAR-03 | `supplierWarranties` scope | `enforces refund, finance, return, and warranty privacy...` | PASS | Cross-supplier list exclusion is covered. |
| INV-WAR-04 | warranty transition/history | `proves warranty eligibility boundaries and the complete platform lifecycle`; `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | Terminal history remains append-only, including REFUND resolution. |
| INV-RET-MULTI-01 | `PostOrderService.supplierReturns` item relation filter | `projects a shared multi-supplier return item-by-item without truncating customer or platform views` | PASS | Supplier A and B each receive only their own item. |
| INV-RET-MULTI-02 | Prisma nested `items.where.orderItem.supplierId` | `projects a shared multi-supplier return item-by-item without truncating customer or platform views` | PASS | Filtering is in the backend query, not a browser projection. |
| INV-RET-MULTI-03 | `PostOrderService.customerReturns` | `projects a shared multi-supplier return item-by-item without truncating customer or platform views` | PASS | Customer detail retains both owned items. |
| INV-RET-MULTI-04 | `PostOrderService.platformReturns` | `projects a shared multi-supplier return item-by-item without truncating customer or platform views` | PASS | Platform detail retains both operational items. |
| INV-WAR-REF-01 | `PostOrderService.resolveWarranty` -> `RefundsService.createFromResolution` | `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | No warranty-specific money/provider path exists. |
| INV-WAR-REF-02 | locked `WarrantyClaim.resolutionRefundRequestId` | `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | Exactly one linked request and allocation are asserted. |
| INV-WAR-REF-03 | canonical `RefundsService.execute` | `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | One resulting `Refund` and one mocked provider execution are asserted. |
| INV-WAR-REF-04 | `RefundsService.applyEvidence` ledger posting | `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | One historical supplier `REFUND_DEBIT` is asserted. |
| INV-WAR-REF-05 | serializable warranty lock/retry | `resolves a warranty refund once across retries and concurrent HTTP requests` | PASS | Two concurrent HTTP resolutions converge to one terminal history row. |

## Supplier workspace visibility

The Supplier Workspace uses the supplier-filtered return and warranty projections
as read-only operational views. It provides no return/warranty transition or refund
controls; those remain the existing platform-authorized canonical lifecycle seams.
See `supplier-business-management-ui.md` for the UI contract.

## Platform return and warranty management UI

The platform after-sales section drives existing state transitions, completes returns with one of REFUND/REPLACEMENT/NO_ACTION, and resolves warranties with REPAIR/REPLACEMENT/REFUND/NO_FAULT_FOUND. The UI cannot issue a provider refund directly from a return or claim; the canonical refund-request lifecycle remains authoritative.
