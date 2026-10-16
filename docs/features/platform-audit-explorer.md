# Platform audit explorer

Status: IMPLEMENTED_VERIFICATION_PARTIAL pending current GitHub CI and authenticated browser QA.

The platform Audit navigation renders a read-only client of `GET /platform/audit`, authorized exclusively by `platform.audit.read` (Nest SessionAuthGuard + RbacService.requirePlatform). The API already enforces append-only history; UI renders timestamp, action, entity and truncated actor identifiers, not untrusted raw secret values. The audit service recursively strips credential, token, card and provider-body keys from stored metadata.

Action/entityType/actor query filters are server-applied, pages use bounded 25-record limits, refresh clears stale errors. No audit creation/edit/delete endpoints are introduced. Browser control availability is not an authorization boundary.

Tests: `apps/frontend/test/platform-audit-explorer.test.tsx`; existing `apps/backend/test/operations-layer.int.spec.ts` proves auth and sanitizer behavior. Next: browser QA, privileged audit completeness matrix. Preserve AuditService as canonical event authority.

## Latest automated proof

GitHub `dev` verification run [38893118508](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend 22/22 test files and PostgreSQL HTTP integration 79/79 with fresh migrations. This is local integration proof only. Authenticated browser and external integrations remain separate release gates.
