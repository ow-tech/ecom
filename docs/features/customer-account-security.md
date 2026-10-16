# Customer account security

## Status

IMPLEMENTED_VERIFICATION_PARTIAL — backend and customer UI are committed to `dev`. Migration and tests require execution in an isolated PostgreSQL environment. Resend test email, live sender/domain verification, and authenticated browser QA remain external release gates.

## Purpose and user journeys

- Signed-in users change password at `/account/security` after proving their current password. Successful change revokes every previous session and clears the active cookie. They must sign in again.
- A visitor can use `/forgot-password` and `/reset-password?token=...`. The API accepts unknown addresses without revealing whether an account exists. A known active account receives a time-limited reset link only when the optional Resend provider is configured.
- Login and password-reset requests use durable rate-limit buckets keyed by digests, not plaintext identifiers.

## Canonical implementation map

- Database: `User`, `Credential`, `Session`, `PasswordResetToken` (unique hashed token per user), `AuthLoginThrottle`.
- Migration: `apps/backend/prisma/migrations/20261016100000_account_security_recovery/migration.sql`.
- Routes: `POST /auth/password/change`, `POST /auth/password/request-reset`, `POST /auth/password/reset`, `POST /auth/login`.
- Business logic: `apps/backend/src/auth/auth.service.ts`. Browser UI: `apps/frontend/app/account/security/page.tsx`, `apps/frontend/app/(auth)/forgot-password/page.tsx`, `apps/frontend/app/(auth)/reset-password/page.tsx`.
- Frontend API: `apps/frontend/lib/api.ts`. Backend integration tests: `apps/backend/test/identity-tenancy-rbac.int.spec.ts`.

## Important invariants

- INV-ACCOUNT-01: Argon2id credentials only. No raw tokens or passwords persisted.
- INV-ACCOUNT-02: Login rechecks credential hash under a user row lock before creating a session, closing the successful-login-versus-reset race.
- INV-ACCOUNT-03: Password reset and authenticated change revoke all previous sessions, remove/consume reset tokens in the same transaction as credential update, and never silently extend an old session.
- INV-ACCOUNT-04: Reset tokens expire after 30 minutes, are one-time, and cannot be replayed. Reset link is not rendered in server logs.
- INV-ACCOUNT-05: Error state in the browser never reports successful credential mutation; unauthenticated change is denied.
- INV-ACCOUNT-06: An account cannot be recovered by a user who only knows its email. Email delivery requires provider credentials; no reset secret is returned from the public API.
- INV-ACCOUNT-07: Login throttles repeated invalid attempts per IP/account; reset request throttles all requests per IP, including unknown accounts.

## Environment / integrations

Server-only ignored environment values:

```
RESEND_API_KEY=...
ACCOUNT_EMAIL_FROM=Ecom <noreply@your-verified-domain>
ACCOUNT_PUBLIC_URL=https://your-frontend.example
```

The backend calls Resend with `fetch` and no frontend provider credentials. Use an HTTPS public URL for production. Without configured provider secrets, the reset request returns 503 rather than claiming mail delivery. External delivery attempts may return a generic accepted response for security; observe provider failure through protected backend logs.

No live Resend email was sent or verified. Signed webhook/payments are unrelated.

## Tests and acceptance

The focused identity integration suite now contains cases for valid/invalid password change, cross-session invalidation, hashed reset storage, reset replay rejection, unknown-user generic response, and repeated invalid-login throttling. Execute against a **fresh migrated disposable** `TEST_DATABASE_URL`; verify browser routes at 375px, 768px, 1280px. Add/re-run simultaneous sign-in versus reset concurrency test if changing the login/session seam.

```sh
pnpm prisma:generate
pnpm --filter @ecom/backend typecheck
pnpm --filter @ecom/frontend typecheck
pnpm --filter @ecom/backend test:integration
pnpm --filter @ecom/frontend test
```

## Limitations and next safe continuation

Test execution and external sender verification remain pending. This feature does **not** introduce email verification, MFA, global token theft response, or multi-provider transport abstraction. Retention cleanup of old throttle buckets and enforcing trusted proxy/client-IP configuration need deployment-level consideration.

Read this feature note and `docs/features/identity-tenancy-rbac.md` before touching authentication again. Preserve `RbacService.organizationContext` and platform-role boundaries. After account verification, proceed to `docs/features/payment-reconciliation-concurrency.md`.
