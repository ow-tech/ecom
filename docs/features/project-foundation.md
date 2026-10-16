# Project Foundation

## Status

Implemented.

## Purpose

Provide the local development foundation for a multi-tenant ecommerce and
supplier marketplace without introducing speculative business functionality.

## Behavior

The frontend serves a minimal running-status shell. The backend validates its
required environment at startup and exposes `GET /health`, which returns
`{ "status": "ok" }`. Docker Compose runs local PostgreSQL and Redis.

## Implementation Map

```text
apps/frontend        Next.js App Router shell and design tokens
apps/backend         NestJS bootstrap, configuration validation, health route
apps/backend/prisma  Prisma datasource and client generation configuration
packages/shared-types Reserved explicit shared-contract package
docker-compose.yml   Local PostgreSQL and Redis
```

## Important Files

- `package.json`
- `.env.example`
- `docker-compose.yml`
- `apps/backend/src/config/environment.validation.ts`
- `apps/backend/src/health/health.controller.ts`
- `apps/frontend/app/globals.css`

## Architecture / Flow

```text
Browser -> Next.js frontend -> NestJS API -> PostgreSQL
                              NestJS API -> Redis
```

The backend owns business logic and server-side infrastructure access. The
frontend remains a browser application only.

## Database

Prisma is configured with PostgreSQL through `DATABASE_URL`. There are no
domain models or migrations yet: tenancy, identity, RBAC, and commerce schema
are deliberately deferred.

## Contracts

The only current HTTP contract is `GET /health` returning `{ "status": "ok" }`.
`packages/shared-types` contains no domain contracts yet.

## Invariants

- INV-FOUNDATION-01: Frontend must never receive PostgreSQL credentials.
- INV-FOUNDATION-02: Database access belongs to backend/server processes only.
- INV-FOUNDATION-03: No real secrets may be committed.
- INV-FOUNDATION-04: The initial backend is a modular monolith.
- INV-FOUNDATION-05: No supplier/customer/business schema should be invented.
- INV-FOUNDATION-06: Future tenant identity must not rely solely on a supplier
  identifier provided by a client request.

## Regression Surface

This is an initial scaffold. The regression surface is limited to root project
files, Git configuration, and any future user-authored files.

## Security / Authorization

There is no authentication or authorization yet. The backend fails startup
when its database, Redis, or port configuration is missing or invalid, and the
health endpoint intentionally exposes no infrastructure detail.

## Tests

The backend unit test verifies the health response. Build, lint, typecheck,
Prisma, Docker Compose, local service health, and HTTP endpoint verification
are the required foundation checks.

## Operational Notes

Copy `.env.example` to `.env` for local development, then run `pnpm infra:up`.
The root `.env` remains ignored by Git. Prisma commands are exposed through
root `pnpm prisma:*` scripts.

## Known Limitations

No authentication, organizations, tenant model, RBAC, workers, or commerce
domain functionality exists. Redis is provisioned but is not yet used by the
application.

## Decisions

See `docs/DECISIONS.md`, particularly the custom backend, PostgreSQL, modular
monolith, pnpm workspace, Prisma, and Docker VPS decisions.

## Safe Continuation Point

Read `docs/PROJECT_STATE.md`, this document, and `docs/ARCHITECTURE.md` before
the next feature. Preserve backend-only database access, the modular monolith,
the no-secrets rule, and server-derived tenant identity. The next exact seam is
the identity/organization database model and backend authorization foundation.
