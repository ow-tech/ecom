# Supplier Finance and Settlements

## Commission and ledger

Completion of each `SupplierOrder` creates at most one immutable `CommissionRecord` per OrderItem. The rate comes from an effective supplier override, else the effective platform-managed default, else validated initial `DEFAULT_COMMISSION_RATE` (10%), and is snapshotted on the record, and uses Decimal half-up two-decimal commission rounding. A nonzero supplier net posts one `SUPPLIER_EARNING` ledger entry; a valid zero net (for example, a 100% commission) remains an immutable commission record but creates no prohibited zero-value ledger entry.

The append-only ledger is supplier-perspective: positive means the platform owes more; negative means it owes less. Successful refunds post proportional `REFUND_DEBIT` entries using the historical commission rate. Corrections are manual adjustment entries, never mutations. Balances are sums of ledger entries by supplier/currency.

## Supplier ledger pagination

`GET /organizations/:organizationId/finance/ledger?page=1&limit=25` is an
active-membership, `finance.read` supplier projection. It returns
`{ data, page, limit, total }`; `page` starts at 1 and `limit` is an integer
from 1 through 100 (default 25). Rows are ordered `createdAt DESC, id DESC`,
so equal timestamps remain deterministic. `total` and `limit` let the client
derive whether another offset page exists. The endpoint intentionally does not
promise a snapshot across concurrent inserts; a newly inserted row can shift a
later offset page. The separate balance endpoint remains authoritative and is
never derived from a ledger page.

## Settlements

Platform creates a single-currency DRAFT settlement from server-selected, unclaimed ledger entries. `SupplierSettlementItem.ledgerEntryId` is unique and transactionally claimed, preventing double settlement. Only a positive net can be approved and marked paid. Marking paid is a manual acknowledgement, not a bank transfer; it appends one `SETTLEMENT_DEBIT`, preserving a complete running balance.

## Invariants

INV-FIN-01 through INV-FIN-07 and INV-STL-01 through INV-STL-06 cover immutable commission terms, append-only balances, refund adjustments, supplier isolation, server-derived settlement composition, single currency, and concurrent claim safety.

## Verification

Real Nest HTTP/PostgreSQL coverage asserts Decimal historical commission terms,
supplier-perspective balance derivation, and an exactly-once settlement debit on
mark-paid. Concurrent platform settlement creation over the same eligible ledger
entry produces one settlement and one safe conflict, proving no duplicate payout
liability is created.

The focused matrix also proves finance cross-organization denial, platform-finance
read access for a least-privilege role, and denial of settlement creation without
`platform.settlements.manage`. Direct PostgreSQL assertions verify the commission
per-order-item unique index, commission-rate range check, nonzero ledger check, and
ledger supplier foreign key. Existing no-PATCH/no-DELETE controller surfaces remain
the append-only API boundary.

The final HTTP/PostgreSQL edge matrix rejects zero and negative payable settlement
sets, proves per-currency claims, and proves that later earnings, refunds, and manual
adjustments are new ledger entries rather than edits to a paid settlement. A repeated
paid command is idempotent and preserves the original payment evidence; there is no
operational update route for settlement money, currency, supplier, or item linkage.

The ledger pagination HTTP fixture creates 27 supplier-A rows (including equal
timestamps, USD/KES entries, a negative refund debit, and a supplier-B row).
It verifies page 1/2 coverage without duplicates or omissions, tuple order,
maximum-bound rejection, cross-organization denial, suspended-member denial,
and unchanged currency-separated balances.

## Invariant evidence matrix

| Invariant | Implementation seam | Test | Status | Limitation |
| --- | --- | --- | --- | --- |
| INV-FIN-01 | `FinancePostingService.postCommissions` | `posts a commission once when concurrent canonical completion requests converge` | PASS | Covers the canonical completion race at 10%. |
| INV-FIN-02 | `SupplierLedgerEntry` append-only routes | `posts immutable commission and ledger entries once...` | PASS | API surface and running-balance proof. |
| INV-FIN-03 | `RefundsService` historical commission posting | `derives and protects refund quantities...` | PASS | Historical 10% refund allocation is covered. |
| INV-FIN-04 | `FinanceService.supplier` | `enforces refund, finance, return, and warranty privacy...` | PASS | Cross-organization read denial is covered. |
| INV-FIN-05 | `FinanceService.createSettlement` | `posts immutable commission and ledger entries once...` | PASS | Concurrent ledger claim is covered. |
| INV-FIN-06 | `FinanceService.createSettlement` | `marks an approved settlement paid once...` | PASS | Single USD settlement accounting is covered. |
| INV-FIN-07 | `CommissionRecord` and ledger database constraints | `has database-enforced financial uniqueness...` | PASS | PostgreSQL constraint proof. |
| INV-STL-01 | `FinanceService.createSettlement` | `posts immutable commission and ledger entries once...` | PASS | Concurrent claiming yields one create and one conflict. |
| INV-STL-02 | `FinanceService.approveSettlement` | `posts immutable commission and ledger entries once...` | PASS | DRAFT approval exercised. |
| INV-STL-03 | `FinanceService.markPaid` | `marks an approved settlement paid once...` | PASS | Serializable retry converges to one debit. |
| INV-STL-04 | `SupplierSettlementItem.ledgerEntryId` | `uses Decimal half-up commission economics and settlement eligibility without client amounts` | PASS | Direct duplicate settlement-item insert is rejected by PostgreSQL uniqueness. |
| INV-STL-05 | `SupplierLedgerEntry.SETTLEMENT_DEBIT` | `marks an approved settlement paid once...` | PASS | +90 -20 +5 -75 equals zero. |
| INV-STL-06 | platform settlement RBAC | `enforces refund, finance, return, and warranty privacy...` | PASS | Read-only platform user cannot create a settlement. |
| INV-STL-EDGE-01 | `FinanceService.createSettlement` positive-net guard | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | 0.00 and -10.00 both return conflict and create no payout. |
| INV-STL-EDGE-02 | `FinanceService.createSettlement` currency predicate | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | KES 100.00 settlement excludes USD 50.00. |
| INV-STL-EDGE-03 | append-only `SupplierLedgerEntry` balance | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | New KES 25.00 remains after an immutable KES paid settlement. |
| INV-STL-EDGE-04 | `RefundsService.applyEvidence` / settlement immutability | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | Paid USD 90.00 settlement remains unchanged; later refund balance is -20.00. |
| INV-STL-EDGE-05 | `FinanceService.manualAdjustment` | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | Post-paid +15.00 then -5.00 produces the expected -10.00 carry balance. |
| INV-STL-EDGE-06 | `FinanceService.markPaid` and no mutation routes | `preserves settlement currency, non-positive, and post-paid append-only accounting boundaries` | PASS | Draft direct payment conflicts; repeated PAID call is idempotent and cannot rewrite evidence. |

## Supplier workspace visibility

The Supplier Workspace consumes the existing organization-scoped balance, ledger,
commission, and settlement read APIs. It is deliberately read-only: settlement
creation, approval, payment marking, and manual adjustments remain platform actions.
See `supplier-business-management-ui.md` for the UI contract.

## Platform finance interface

The platform finance UI reads balances and settlement records. A privileged operator may create server-derived DRAFT settlements, approve them, and enter an external payment reference to acknowledge payment. This is **not** an automatic bank payout. See [platform-finance-operations.md](platform-finance-operations.md).

## Manual bank and M-Pesa payout methods (2026-10-16)

The Supplier Finance portal now includes `SupplierPayoutDestinations`: owner-managed encrypted payee instructions and masked financial-reader records. The Platform Finance portal selects an active, same-currency payout destination when creating a draft and can explicitly reveal a linked recipient for manual transfer under `platform.settlements.manage`. Existing settlement and ledger amounts are already net of platform commission: never deduct it again at payout. See [manual-supplier-payouts.md](manual-supplier-payouts.md).

## Configurable platform and supplier commission

The platform default is editable in Platform Finance and stored as effective-dated `PlatformCommissionRate` history; initial default remains 10% if no platform row exists. Existing supplier rate schedules have priority while active. Supplier Finance displays the current effective and platform default rates. Reset of current supplier overrides causes automatic future fallback without rewriting any prior `CommissionRecord`. See [configurable-commission-policy.md](configurable-commission-policy.md).
