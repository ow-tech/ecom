# Brevo transactional email — ECOM

Status: IMPLEMENTED_VERIFICATION_PARTIAL — source configured on draft branch, no production credentials or delivery certification.

## Canonical implementation
- `apps/backend/src/notifications/brevo-mail.service.ts`: single Brevo REST API adapter (`POST https://api.brevo.com/v3/smtp/email`); backend-only key, sender validation, bounded HTTP timeout, no secret payload logging.
- `apps/backend/src/notifications/transactional-email.module.ts`: shared provider import.
- `apps/backend/src/auth/auth.service.ts`: password recovery through Brevo, preserves token hashing, 30-minute expiry, rate limits and non-enumerating response.
- `apps/backend/src/organizations/staff-invitations.service.ts`: supplier/platform invitations through Brevo; provider acceptance recorded, not confused with inbox delivery.
- `apps/backend/src/notifications/notification-delivery.service.ts`: Brevo EMAIL delivery transport when requested by existing notification delivery pipeline. SMS remains unconfigured. Provider delivery attempts use existing attempt rows.
- `apps/frontend/app/(auth)/reset-password/page.tsx`: consume fragment-based recovery token with legacy query-link support.
- Existing business/event outbox and in-app notifications are retained; **no new automatic notification-email scheduler is claimed**.

## Production configuration
Use https://app.brevo.com to create an account and an API key (not an SMTP key). Add your domain and sender under transactional sending. Configure the exact DNS records given by Brevo for your domain, including DKIM; verify SPF/DMARC alignment and DNS propagation. Do not invent DNS values.

Server-only environment (secret manager, not Git):
```env
BREVO_API_KEY=<private Brevo transactional API key>
BREVO_FROM_EMAIL=notifications@your-verified-domain.example
BREVO_FROM_NAME=Ecom
ACCOUNT_PUBLIC_URL=https://your-real-storefront.example
```

Backend must reach `https://api.brevo.com:443` outbound. Restart/redeploy backend after injecting secrets. Never configure `NEXT_PUBLIC_BREVO_*`, expose the key to browsers, or store it in docs / source / logs.

## Verification before release
1. Verify Brevo domain and sender configuration and test a real inbox (including spam, delivery, bounce).
2. Trigger one workforce invitation and one password reset; verify API provider acceptance and single-use/expiry behavior.
3. Trigger an email channel attempt from a test notification and verify that it creates a Brevo provider record; disabled SMS remains NOT_CONFIGURED.
4. Verify malformed sender/missing key fail closed; provider timeouts or 429 are not reported as delivered.
5. Verify checkout/order/payment behavior unchanged; avoid leaking PII or invitation/reset links into logs, telemetry or unnecessary webhook payloads.
6. Run focused auth, staff invitation, notifications integration/regression suites, Prisma migrations, backend/frontend typechecks, lint and build. Verify all release CI.
7. Review rate limits, quotas, Brevo events/webhooks, real retry scheduling, transactional outbox and exact operational rules before a production email campaign.

**Important:** Brevo accepting an email is not proof of delivery. The existing invocation paths do not constitute comprehensive automated multi-channel notification delivery. Do not claim that every checkout/order/customer event now sends email. Do not flip production feature gates without verification.

## Safe continuation
Reuse `BrevoMailService.send` for additional security, order, receipt and support notifications. Avoid a second transport. Build durable worker dispatch and verified Brevo delivery/bounce webhook reconciliation for automatic lifecycle email. Preserve the provider acceptance vs delivered distinction.
