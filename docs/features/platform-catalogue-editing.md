# Platform catalogue editing — existing canonical contracts

Status: IMPLEMENTED_VERIFICATION_PARTIAL pending GitHub CI and responsive browser verification.

Platform administrators with `platform.categories.manage` or `platform.products.manage` can update existing categories, products, variants and URL media metadata through the canonical PATCH APIs. Read-only operators do not receive the mutation forms; backend `RbacService.requirePlatform` remains the final authority. Editing never mutates supplier listing price, supplier-owned stock or order historical snapshots.

- UI: `apps/frontend/components/platform-catalogue-edit.tsx` embedded in the existing platform categories/products workspaces.
- Contracts: `PATCH /platform/categories/:id`, `PATCH /platform/products/:id`, `PATCH /platform/products/:id/variants/:variantId`, `PATCH /platform/products/:id/media/:mediaId` — all already existed.
- Database: existing Category, Product, ProductVariant, ProductMedia; no migration.
- Media remains URL metadata, no binary upload implemented or claimed.
- Product search uses the existing server-side filtered catalogue-admin listing; more extensive pagination is separate.
- Tests: `apps/frontend/test/platform-catalogue-edit.test.tsx` plus existing backend catalogue HTTP contract tests.
- Failure semantics: backend failure leaves form visible with error; success reloads canonical records. Invalid JSON is not sent to the API.

Safe continuation: verify browser forms and backend RBAC, then continue advanced platform administration with role-specific operational and finance controls. Do not create a second catalogue state machine.

## Latest automated proof

GitHub `dev` verification run [38893118508](https://github.com/ow-tech/ecom/actions/runs/38893118508) passed backend unit 23/23, frontend 22/22 test files and PostgreSQL HTTP integration 79/79 with fresh migrations. This is local integration proof only. Authenticated browser and external integrations remain separate release gates.
