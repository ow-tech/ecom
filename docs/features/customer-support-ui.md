# Customer Support UI

## Status

Implemented against the existing support domain. Live Nest loopback HTTP/PostgreSQL verification is complete; browser journey and responsive viewport verification remain pending.

## Customer routes

- `/account/support` lists tickets from `GET /customer/support/tickets`.
- `/account/support/new` creates a ticket through `POST /customer/support/tickets`; an optional `orderId` becomes an `ORDER` relationship that the backend ownership validator checks.
- `/account/support/:ticketId` reads public conversation through `GET /customer/support/tickets/:ticketId` and posts replies to `POST /customer/support/tickets/:ticketId/messages`.
- Order detail links to the create route with its owned order ID.

## Contract and privacy

Customer ticket creation now requires `category`, `subject`, and initial `message`. The initial public SupportMessage and ticket are created together. Customer reads filter messages to `PUBLIC`, so internal notes and staff assignment data are not sent to this UI. The backend resolves a foreign ticket/order as unavailable and rejects replies to `CLOSED` tickets.

The frontend does not expose a customer-controlled status transition. It displays server status/priority/category and uses canonical form, surface, alert, button, and state primitives with labelled, associated form controls.

## Verification

On a fresh disposable PostgreSQL 16 database, real authenticated Nest HTTP tests cover customer ticket creation and its initial public message, foreign-ticket denial, platform public reply visibility, internal-note exclusion, customer follow-up, and closed-ticket rejection. The transaction is implemented as one nested Prisma create; the suite verifies the persisted public initial message with its ticket. Frontend tests, typecheck, lint, and production build pass. Browser session/reload and responsive viewport verification were not run.
