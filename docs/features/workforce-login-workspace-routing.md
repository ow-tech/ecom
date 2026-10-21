# Permission-aware workforce post-login routing

Status: IMPLEMENTED_VERIFICATION_PENDING

## Cause

The previous workforce login redirected to `/supplier` by default. Valid
platform-only administrators (including super-admins with no organization
membership) reached a misleading "Workspace unavailable" page despite
successful workforce authentication and platform permissions.

## Canonical behavior

The login API sets its authenticated cookie. The frontend then awaits
`SessionProvider.refresh()`, which returns the freshly fetched `/auth/me`
session. The decision is made against `accountAudience`, organizations,
and platform permissions from that response, not from a saved cookie,
a client-supplied role, or the login audience alone.

- Platform-only with permissions: `/platform`.
- Supplier-only with active permitted organization: `/supplier/{organizationId}`.
- Hybrid: first honor a safe and authorized `returnTo` for a specific
  organization or platform section; otherwise platform is the default.
- Unknown organization, missing section permission, external URL,
  protocol-relative URL, backslash/unsafe path: ignore `returnTo` and use
  the correct entitled default.
- Workforce account without either entitlement: `/staff/access-unavailable`
  with honest instructions and a working sign-out action.
- Missing or mismatched `/auth/me` after login: stay on the login form
  and display an error rather than guessing a destination.
- `/supplier` also redirects a platform-only user to `/platform`.
  Do not create synthetic organization membership for platform staff.

The pure resolver mirrors workspace navigation's section permissions;
the backend remains the authoritative security boundary on every action.

## QA gates

- Pure routing suite: platform, supplier, hybrid and no-access cases;
  permitted and forbidden section routes; external/protocol-relative paths.
- UI: customer vs workforce login API, fresh session verification,
  platform admin with zero organizations, supplier entry fallback.
- Full frontend/backend typecheck, lint, production builds, isolated
  PostgreSQL migrations and HTTP integration regressions.
- Manual local browser check with current QA platform-only admin and
  supplier account, including valid and invalid `returnTo`.

No new migrations or local database changes.
