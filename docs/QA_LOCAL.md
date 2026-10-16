# Local QA environment

The QA environment is a dedicated, persistent Docker Compose project named
`ecom-qa`. It uses database `ecom_local_qa` on local port `55434`, so it does
not share the normal development volume or the disposable integration-test
database. It is never suitable for production or staging.

## One-time configuration

Copy `.env.qa.local.example` to the ignored `.env.qa.local`, then provide the
local-only `QA_SEED_PASSWORD` value through that ignored file or the shell.
The seed refuses to run unless `QA_SEED_ENABLED=true`, `NODE_ENV` is not
production, the host is local, and the database name is exactly
`ecom_local_qa`. Do not add this password to a tracked file.

## Commands

```sh
pnpm qa:up       # starts persistent PostgreSQL/Redis, migrates, seeds, launches apps
pnpm qa:verify   # validates fixture counts, invariants, and password hashes
pnpm qa:seed     # idempotently refreshes only named QA fixtures
pnpm qa:down     # stops only services started by this QA workflow; preserves volumes
QA_RESET_CONFIRMATION=DELETE_QA_FIXTURES pnpm qa:reset
```

`qa:reset` is deliberately conservative: it refuses if customer QA orders
exist, because those must first be cancelled through their canonical workflow.
It never truncates global tables or deletes Docker volumes. To restart after a
laptop reboot, use `pnpm qa:up`; no reseed is required for persistence.

Frontend: `http://localhost:3100`. Backend health: `http://localhost:4000/health`.
Set `FRONTEND_PORT` before `pnpm qa:up` only when 3100 is occupied; the launcher
waits for both HTTP services and prints their log locations instead of reporting
success for a dead detached process.

The frontend command is `pnpm --filter @ecom/frontend exec next dev --port
<port>`; passing `-- --port` through the package script is invalid because Next
then treats `--port` as a project directory. If a healthy backend already owns
the configured port but is not owned by the QA launcher PID, `qa:up` stops with
an environment-isolation error. It neither reuses nor terminates that unverified
process. Choose an unused backend port or stop the known owner first. Logs are
`.qa/backend.log` and `.qa/frontend.log`.

## Accounts and data

The local-only password is shared by these QA accounts: platform super admin
`admin@gmail.com`; platform operations/catalogue/support admin accounts;
`customer@gmail.com` and `customer2@gmail.com`; supplier owners
`supplier@gmail.com` and `supplier2@gmail.com`; and Supplier A staff accounts
`inventory.staff@gmail.com`, `orders.staff@gmail.com`,
`finance.staff@gmail.com`, and `supplier.support@gmail.com`.

Supplier A is **Madina Tech & Lifestyle** and Supplier B is **Nairobi Everyday
Store**. The dataset has 10 active QA categories, 20 active products, variants
on six products, 25 listings (including two inactive and one zero-stock), three
inventory locations, three pickup points, a Nairobi delivery rate, two customer
profiles with fictional addresses, and three ordered Unsplash-derived gallery
images per product (main, top detail, and bottom detail) for product-detail
thumbnail/carousel QA.

The seed only establishes safe catalogue, inventory, access, pickup, delivery,
and customer-profile fixtures. Orders, payments, fulfilled returns/warranties,
finance entries, sessions, reservations, and notifications are intentionally
not fabricated: create those during browser/API QA through checkout, payment
test evidence, fulfilment, and after-sales APIs. This protects the authoritative
commerce and audit lifecycles.

## Coverage

| Area | Population | Safe manual editing |
| --- | --- | --- |
| Users, RBAC, organizations, suppliers | QA-named reusable fixtures | Yes; rerunning restores base data |
| Categories, products, media, variants, listings | 10 / 20 / 20 / 14 / 25 | Yes; rerunning restores core fields |
| Inventory and locations | 25 items across 3 locations | Use inventory APIs for historical movement fidelity |
| Pickup, delivery, addresses | 3 points, 1 zone/rate, 2 profiles | Yes |
| Orders, payments, reservations, finance, returns, warranties | Intentionally unpopulated | Create only through canonical APIs |

The canonical RBAC catalogue currently provides owner, admin, and member roles;
it does not contain narrower inventory-only, orders-only, or finance-viewer
system roles. The seed therefore uses organization admin for inventory/orders
staff and member for the finance/support fixtures, without inventing a parallel
RBAC model.
