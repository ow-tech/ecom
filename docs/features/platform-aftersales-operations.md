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

## Latest automated proof

GitHub `dev` verification run [38893118508](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend 22/22 test files and PostgreSQL HTTP integration 79/79 with fresh migrations. This is local integration proof only. Authenticated browser and external integrations remain separate release gates.

## Canonical after-sales read recovery (2026-10-16)

All three source lists are generation-fenced across permission changes and component unmount. A return, warranty or refund mutation only displays the standard `Current server status refreshed` notice after the post-action read actually succeeds. A failed refetch presents the backend error and clears previously visible operational records, rather than claiming refreshed lifecycle truth. Focused frontend regression covers a successful canonical transition with a failed follow-up read. No provider-refund logic, inventory state or financial ledger rules are changed.
