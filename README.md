# Ecom Platform

Development foundation for a multi-tenant ecommerce and supplier marketplace.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker with Docker Compose

## Local development

1. Copy `.env.example` to `.env` and replace the development password if needed.
2. Run `pnpm install`.
3. Start local infrastructure with `pnpm infra:up`.
4. Generate Prisma Client with `pnpm prisma:generate`.
5. Start both applications with `pnpm dev`.

If either default infrastructure port is occupied, set
`HOST_POSTGRES_PORT` and/or `HOST_REDIS_PORT` in `.env`, then make the
corresponding `DATABASE_URL` or `REDIS_URL` change.

The frontend runs at `http://localhost:3100`. The backend health endpoint is
available at `http://localhost:4000/health`.

## Useful commands

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm infra:down`

Read `docs/PROJECT_STATE.md` before extending the platform.
