# Customer profile management

## Status

IMPLEMENTED_VERIFICATION_PARTIAL. Frontend integration is committed; browser and full package test execution remain pending.

## Purpose and customer behavior

An authenticated customer can open `/account/profile`, read their stored contact details, edit first/last names and primary/alternative phone numbers, and receive a server-confirmed success or explicit failure. Account email is displayed read-only. Existing order delivery snapshots remain unchanged.

## Canonical implementation

- UI: `apps/frontend/app/account/profile/page.tsx`, linked from `apps/frontend/app/account/page.tsx`.
- Client contract: `apps/frontend/lib/api.ts` (`customerProfile`, `updateCustomerProfile`).
- Backend: `GET /customer/profile`, `PATCH /customer/profile` in `apps/backend/src/customer/customer.controller.ts`.
- Service authority: `CustomerService.ensureCustomerProfile`, `CustomerService.updateProfile`.
- Database: existing `CustomerProfile` relation; **no new migration** required.
- Frontend regression: `apps/frontend/test/customer-profile.test.tsx`.
- Existing backend ownership tests: `apps/backend/test/customer-commerce-core.int.spec.ts`.

## Security and invariants

- Only the authenticated user identity determines the profile; no customerId or userId supplied by the browser.
- `SessionAuthGuard` protects reads and writes.
- DTO allowlisting permits only contact fields; direct writes to email, role, tenant membership, or financial information are not exposed.
- Account contact edits do not modify immutable historical order-address snapshots.
- Errors never display success messages; signed-out visitors are redirected without a customer-profile request.

## Validation and release limitations

Source was checked against the live `dev` branch before direct GitHub writes. Focused UI tests were added, but were **not executed** in this session because local pnpm dependencies and a runnable project checkout are unavailable. Run frontend typecheck, lint, focused Vitest, and authenticated browser QA at mobile and desktop sizes before claiming fully verified completion.

Password change, recovery, email verification, MFA, and sign-in abuse controls are separate account-security work, not delivered by this profile feature.

## Safe continuation

Read this file, `docs/FEATURE_INDEX.md`, `apps/backend/src/auth/auth.service.ts`, and `apps/backend/src/auth/auth.controller.ts`. Next feature: complete authentication recovery and session security, with migrations, backend and frontend, provider-email evidence, and failure/replay/concurrency tests. Do not duplicate customer-profile ownership logic.
