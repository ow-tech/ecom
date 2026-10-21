# Account logout, password reveal, and actionable KPI drilldowns

Status: IMPLEMENTED_VERIFICATION_PARTIAL — full CI and authenticated local browser QA are release gates.

## User-facing contract

- The backend owns server session revocation through `POST /auth/logout`.
- Every signed-in storefront user sees an explicit Sign out action. Supplier and platform workspaces use the same action, as does the saved account overview.
- Logout waits for a successful server revocation before clearing session-bound browser checkout intent, then navigates to customer or workforce login as appropriate. API failure is displayed without claiming successful logout.
- Password inputs in registration, customer/staff login, reset, security change, and invitation activation can temporarily reveal or conceal their value. Controls are accessible buttons with `aria-pressed`, do not submit the form, and do not copy secrets to storage.
- Platform KPI cards link to permission-controlled suppliers, orders, payments, delivery quotes, refunds and support views with relevant filters/actions.
- Supplier KPI cards link to active listings, stock-attention records, preparing orders and ready-for-handover orders. Financial KPI cards link to ledger, commission and settlement evidence.
- Stock attention is defined by the existing backend as `onHand <= reserved`. Inventory view `ATTENTION`, `RESERVED`, `INACTIVE` or `ALL` is validated and filtered in PostgreSQL **before** pagination. Every row is restricted to the caller's supplier organization.
- Physical inventory is per supplier listing **and location**. Separate warehouse/store rows for one listing are not erroneous duplicates.
- No KPI click grants permissions or mutates financial/order state. Explicit actions are available only when authorized and eligible.

## Browser HTTP caching

An authenticated `GET` receiving `304 Not Modified` with an `If-None-Match` header is normal conditional-cache behavior and is not proof of a failing inventory endpoint. For user-scoped live API values ECOM now sets private no-store cache directives, suppresses Express ETags in the real backend bootstrap, and fetches API data with `cache: no-store`. Compare actual JSON body and server data; do not treat `304` as an empty inventory response.

## Verification and operational gates

- Backend: unit, HTTP/PostgreSQL inventory filtering/authorization/pagination, migrations; no production writes.
- Frontend: logout accepted/rejected behavior, audience redirect, password visibility, KPI link targets, status filtering, accessible interactive controls, existing dashboard regressions.
- Manual: customer and workforce session transitions across tabs, failed network logout, multiple mobile breakpoints, filtered actions with read-only roles, hidden/revealed password autofill, and private-cache handling.
- Paystack customer recovery, cart restoration, and overseas payment reconciliation originate from the parent feature branch and must pass the full test matrix before merging. Never treat unresolved payments as cancelled.
