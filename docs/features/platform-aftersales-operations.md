# Platform after-sales operational UI

Status: IMPLEMENTED_VERIFICATION_PARTIAL pending GitHub CI and authenticated responsive browser testing. External Paystack refund delivery is unverified.

## Complete control surface
The platform UI loads only the domains permitted by the caller's platform read permissions. All mutations require their corresponding platform management/review/execution/reconciliation permission, and the backend remains authoritative. Returns move REQUESTED → APPROVED → AWAITING_ITEM → ITEM_RECEIVED → INSPECTING → COMPLETED, or REQUESTED → REJECTED. Warranties move SUBMITTED → UNDER_REVIEW → APPROVED → IN_SERVICE → RESOLVED, or UNDER_REVIEW → REJECTED. Resolutions use the existing DTO enums. Refund requests support review, single confirmed provider execution of CREATED refunds, and evidence reconciliation of UNKNOWN/PENDING outcomes.

## Canonical paths
UI `apps/frontend/components/platform-after-sales.tsx` → `apps/frontend/lib/api.ts` → existing `RefundsService`, `PostOrderService`, `FinancePostingService` and provider binding. No backend state machine or database migration added.

## Critical invariants
- A refund request is distinct from a provider refund. Only a user click with confirmation may invoke `/platform/refunds/:id/execute`; unresolved operations may only be reconciled, not blindly executed again.
- Return REFUND and warranty REFUND flow through canonical refund requests. No direct payout, order mark-paid, inventory-restock, or supplier ledger manipulation is allowed in the browser.
- The frontend cannot grant itself privileges; a return-only operator can enter the after-sales workspace without gaining refund-read access.
- User-visible successes occur only after the canonical API acknowledges the transition; failure surfaces an error and retains server state.
- Provider refunds remain external verification debt until valid TEST merchant and public staging evidence exist.

## Tests and safe continuation
Run frontend after-sales interaction tests, backend post-order finance HTTP/PostgreSQL suite, and entire CI. Browser verify least-privilege roles, transitions, retries and real provider callback reconciliation. Customer after-sales entry remains the next exact UI seam.
