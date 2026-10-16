# Testing

Unit tests run without infrastructure:

```sh
pnpm test
```

The identity, tenancy, and RBAC integration suite starts a real NestJS HTTP
listener and uses real PostgreSQL persistence. It deliberately requires a
separate, migrated and seeded database through `TEST_DATABASE_URL`; it will
refuse to use the active `DATABASE_URL` value.

```sh
export TEST_DATABASE_URL='postgresql://ecom:change-me@localhost:5432/ecom_test'
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ecom/backend prisma:migrate:deploy
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ecom/backend prisma:seed
pnpm test:integration
```

The suite uses one unique run prefix and removes only records it created. Do
not point `TEST_DATABASE_URL` at a shared or development database.
