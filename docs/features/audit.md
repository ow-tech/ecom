# Audit Foundation

Ecom had no reusable audit module or Central Audit client at implementation time. This feature adds append-only `AuditEvent` as the canonical local seam. Metadata is recursively sanitized: keys indicating credentials, secrets, tokens, cookies, authorization, collection/access codes, payment card data, or raw provider/request bodies are removed at every nesting level while unrelated safe fields are retained. Reads require `platform.audit.read`; no mutation API exists.

Committed supplier lifecycle transitions, product updates, and manual inventory adjustments emit audit evidence in the same Prisma transaction as their canonical mutations. The operations integration suite proves recursive removal from top-level objects, nested objects, and array members while retaining safe context.

Platform payment reconciliation emits `PAYMENT_RECONCILED` in the reconciliation/settlement transaction when a platform actor commits a new result. Provider refund execution or reconciliation emits `REFUND_PROVIDER_RECONCILED` only for a newly applied provider result; idempotent repeats do not add another successful-action event. Terminal return completion and warranty resolution emit `RETURN_COMPLETED` and `WARRANTY_RESOLVED` in their respective canonical transactions. Focused real Nest/ PostgreSQL tests prove the payment reconciliation, refund-provider, return-completion, and warranty-resolution audit rows, including exactly-once retry behavior where the canonical operation is idempotent.

`GET /platform/audit` supports actor, action, entity type/id, inclusive `from`/`to` timestamps, and bounded `page`/`limit` pagination. It returns only append-only events.

## Platform audit viewer

The `/platform/audit` navigation now displays `PlatformAuditExplorer` backed by the existing `GET /platform/audit` endpoint. Records are read-only; action/entity/actor filters and stable pages are executed server-side. See [platform-audit-explorer.md](platform-audit-explorer.md). Metadata continues to use the canonical recursive sanitizer, with no browser-side audit mutations.
