# Supplier Business Management UI

## Status

Implemented and integration-verified supplier workspace extension. Supplier
ticket creation persists its required initial public message atomically with the
ticket. Authenticated responsive browser verification remains pending.

## Routes and contracts

- `/supplier/:organizationId/finance` uses `GET /organizations/:organizationId/finance/balance`, `/ledger`, `/commissions`, `/settlements`, and `/settlements/:id`.
- `/supplier/:organizationId/returns` uses `GET /organizations/:organizationId/returns` and the existing supplier-filtered projection.
- `/supplier/:organizationId/warranties` uses `GET /organizations/:organizationId/warranties`.
- `/supplier/:organizationId/support` uses `GET/POST /organizations/:organizationId/support/tickets` and `GET/POST /organizations/:organizationId/support/tickets/:id[/messages]`.

Navigation is rendered only for the existing `finance.read`, `returns.read`,
`warranties.read`, and `support.read` permissions. Support creation and replies
are additionally gated by `support.create` and `support.reply`.

The backend remains authoritative: a route parameter and frontend permission
check are never tenancy proof. Supplier-scoped reads resolve active organization
membership and the matching supplier. A suspended membership, a different
organization, or a platform-only role does not grant supplier access.

## Finance semantics

The balance endpoint is authoritative and groups the append-only supplier ledger
by currency. The UI never totals currencies. `ledger` is offset-paginated with
`page`/`limit` (default 25, maximum 100), deterministic `createdAt DESC, id DESC`
ordering, and `{ data, page, limit, total }` metadata. Previous/Next controls
derive from that metadata, reset on organization change, and never use the page
sum as a balance. Positive ledger entries increase the amount owed to the
supplier; negative entries reduce it. Supplier settlement and commission views
are read-only: settlement creation, approval, paid marking, and manual
adjustments remain platform actions.

Commission records remain immutable fulfilment evidence. Settlement details show
the server-selected entries and historical status, including approval and paid
timestamps where returned. A settlement is not a payout command in the supplier
UI, and later ledger rows do not rewrite paid settlement history.

## After-sales and support isolation

Supplier returns are backend-filtered to the supplier's own return items and
warranties to its own order items. These pages state the existing read-only
supplier lifecycle truth; all return/warranty transitions and any refund linkage
remain platform-owned canonical flows. Supplier support includes public messages
only; its required initial public message is persisted in the canonical create
write, and the UI has no platform assignment, escalation, or internal-note control.

Returns and warranties are deliberately read-only at the currently supported
supplier contract. The browser renders only the item-filtered supplier
projection; refunds and all lifecycle transitions stay with the canonical
platform workflows. Warranty presentation uses the purchased item snapshot,
never the current listing configuration.

## UI and limitations

The extension composes the existing `WorkspaceShell` and `components/ui.tsx`
primitives (`PageHeader`, `SectionHeader`, `Card`, `Money`, `StatusBadge`,
`Alert`, `Skeleton`, `EmptyState`, and `ErrorState`). Scoped loaders key all
data by organization ID, so changing the organization clears the previous state
and ignores delayed responses.

## Evidence and release debt

- `pnpm --filter @ecom/frontend exec vitest run test/supplier-workspace.test.tsx`:
  11/11 interaction tests passed, including ledger next/previous navigation,
  authoritative balance rendering, and a deferred organization-switch race.
- A fresh localhost-only disposable PostgreSQL 16 database applied all 10
  migrations and seeded twice. `post-order-finance.int.spec.ts` passed 14/14
  real Nest loopback HTTP tests, including ledger pagination, finance/settlement
  isolation, multi-supplier returns, warranty snapshot/refund behavior, and
  lifecycle authorization.
- `operations-layer.int.spec.ts` passed 8/8 on that same database, including
  atomic supplier ticket opening messages, supplier/platform public replies,
  internal-note exclusion, cross-supplier denial, closed-ticket rejection, and
  suspended-membership denial.

This is not browser proof. Authenticated journeys at 375px, 768px, and 1280px
remain `BROWSER_VERIFICATION_PENDING_ENVIRONMENT`. Live payment-provider and
authenticated-browser journeys remain release-verification debt.
