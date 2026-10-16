# Marketplace E2E verification

## Evidence boundary — 2026-10-08

This records executed evidence, not a claim that the entire A–J workflow passed.
An isolated PostgreSQL 16 instance was migrated from zero with all ten checked-in
migrations and seeded twice.

## Platform listing oversight

`GET /platform/listings` requires `platform.products.read` and supports `page`,
`limit`, `supplierId`, `productId`, `status`, and `search`. Ordering is
`createdAt DESC, id ASC`. The read-only projection returns product/variant,
supplier display name, price/currency, status, coarse availability and dates;
it omits raw inventory, private SKUs, supplier financial data, customer/payment
data, and provider data.

The focused real Nest HTTP catalogue suite passed 4/4. It created two suppliers
and offers, then proved pagination, filters, availability, platform access,
supplier/non-platform denial, and redaction. The frontend passed 2 Node tests
and 13 Vitest tests, including two listing-control tests.

## Marketplace scenario status

| Scenario | Status | Evidence |
| --- | --- | --- |
| A catalogue creation | PASS | Platform HTTP category, product, variant and URL media creation. |
| B supplier onboarding | PASS | Supplier submit, platform-only approval, ACTIVE history evidence. |
| C supplier listing | PASS | Supplier offer activation, location, receipt and movement assertion. |
| D customer catalogue | PASS | Anonymous safe media/offer projection and private-field exclusion. |
| E cart and checkout | PASS | No cart reservation, idempotent prepare, immutable snapshots and reservations. |
| F payment and settlement | PASS (test provider) | Signed deterministic webhook, server-derived amount/currency/email and repeat-evidence exact-once inventory proof. |
| G supplier fulfilment | PASS | Owned delivery lifecycle and parent aggregate through canonical routes. |
| H customer tracking | PASS | Owned tracking projection and internal-field exclusion. |
| I support privacy | PASS | Customer initial public message, platform public reply, private internal note. |
| J multi-supplier checkout isolation | PASS | One parent/two supplier orders plus cross-supplier detail denial. |

## Regression and safe continuation

Backend/frontend typecheck, lint and production builds passed. No authenticated
browser, responsive viewport, live image delivery or live Paystack proof was
performed. Fresh PostgreSQL 16 reproduction did not reproduce a `P2034`: the
focused post-order finance suite passed 14/14 and the operations outbox suite
passed 8/8, including real concurrent outbox deduplication and concurrent
processor claiming. Return history also matched its lifecycle contract (six
rows: creation, four transitions, and completion). A separate stale test
assertion was corrected: under `createdAt DESC, id DESC`, equal-timestamp rows
are deterministic but a currency row need not be on page one.

`apps/backend/test/marketplace-e2e.int.spec.ts` is the cohesive fixture. It
does not constitute live Paystack, browser, image fetch/fallback, or deployment
proof; those remain release-verification gates.
