# Launch readiness

## Status: IMPLEMENTED_VERIFICATION_PARTIAL

| Area | Classification | Evidence / gap |
| --- | --- | --- |
| Customer registration/login/recovery | RELEASE_VERIFICATION_REQUIRED | Password change and reset backend/UI committed with hashed expiring tokens, session revocation and throttle tests; configured email sender and authenticated browser verification pending. |
| Supplier onboarding/approval | RELEASE_VERIFICATION_REQUIRED | Canonical A–J HTTP fixture proves submit/platform approval/history; browser and staging proof remain. |
| Catalogue and offers | RELEASE_VERIFICATION_REQUIRED | A–J and listing HTTP proof pass; browser image delivery remains. |
| Product media | RELEASE_VERIFICATION_REQUIRED | URL metadata projects safely in HTTP; fetch failure/fallback and host configuration remain unproven. `PRODUCT_MEDIA_BINARY_UPLOAD_NOT_IMPLEMENTED`. |
| Cart/checkout/payment/fulfilment/tracking | RELEASE_VERIFICATION_REQUIRED | Canonical A–J fixture and authenticated local Chrome at 375/1280 prove server lifecycle/layout; hosted-redirect and safe rejected/unknown error UI use a controlled provider double. Live-provider/public-webhook proof remains. |
| Pickup currency | RELEASE_VERIFICATION_REQUIRED | Nonzero pickup fees now have currency matching in preview/prepare; KES backfill assumptions for legacy points and staging multi-currency journeys need confirmation. |
| Delivery operational queue | RELEASE_VERIFICATION_REQUIRED | Permission-scoped paid order/supplier progress UI and HTTP contracts CI-tested; courier integration, driver operations and browser validation remain. |
| Supplier staff and reporting | RELEASE_VERIFICATION_REQUIRED | Owner-scoped in-app invitation/acceptance, delegated roles, revocation and finance-scoped reporting CI-tested; email invites, authenticated browser and staging roles remain. |
| Platform catalogue/finance/audit | RELEASE_VERIFICATION_REQUIRED | Canonical PATCH editing, manually evidenced settlement controls and audit explorer CI-tested; actual bank transfer is not implemented and admin browser authorization matrix remains. |
| After-sales end-to-end | RELEASE_VERIFICATION_REQUIRED | Customer refund/return/warranty submission and platform lifecycle UI CI-tested; physical logistics and live Paystack refund evidence not verified. |
| Background jobs / notifications | RELEASE_VERIFICATION_REQUIRED | Crash-lease recovery, atomic dedupe, account notification center and permission-scoped platform outbox explorer are CI-verified. Scheduling, real EMAIL/SMS adapter delivery, browser verification and operational alerts remain. |
| Supplier payout reconciliation | RELEASE_VERIFICATION_REQUIRED | Bank/M-Pesa payout destinations and manual settlement choice are implemented with masked records, encrypted details and audited privileged reveal. Real bank/M-Pesa payment evidence, key provisioning, browser security verification and operator reconciliation remain pending; ECOM does not initiate transfers. |
| Support privacy | RELEASE_VERIFICATION_REQUIRED | A–J fixture proves public reply/internal-note exclusion; browser proof remains. |
| Tenant/platform isolation | RELEASE_VERIFICATION_REQUIRED | A–J and focused suites prove cross-supplier/customer denial; staging proof remains. |
| Automated application regression | LOCAL_VERIFIED | GitHub dev CI run 38901310001: backend unit 23/23, frontend 25/25 test files, HTTP/PostgreSQL integration 83/83, 15 migrations, typecheck/lint/build green. Release-browser and provider proof remain separate. |
| Production DB, backups and restore | LAUNCH_BLOCKER | No tested production backup/restore evidence. |
| Deployment and TLS | LAUNCH_BLOCKER | Deployment/Nginx/TLS remain deferred. |
| Git release integrity | RELEASE_VERIFICATION_REQUIRED | Direct commits to GitHub `dev` and GitHub Actions verification are available. Tagged production release, rollback and provenance process still pending. |

## Required before launch

Verify authenticated customer/supplier/platform browser flows at 375px,
768px and 1280px; perform Paystack sandbox, image delivery/fallback, deployment,
TLS, database-backup and restore checks.

## Provider and media release gates

`PAYSTACK_SECRET_KEY` is required by backend configuration. A real test-mode
run additionally needs a public `PAYSTACK_CALLBACK_BASE_URL`, an Internet
reachable `/payments/paystack/webhook` endpoint, and a webhook signature check
using the configured secret. Staging must verify initialized payment, signed
success evidence, canonical convergence to `PAYMENT_CONFIRMED`, repeat evidence
dedupe, and the `PAYMENT_REVIEW` branch for late or ambiguous evidence.
The deterministic provider harness is not a live Paystack transaction.

Product media is URL metadata only. The API safely projects an external image
URL, but browser fetch failure/fallback and any production image-host policy
were not executed. `PRODUCT_MEDIA_BINARY_UPLOAD_NOT_IMPLEMENTED` remains a
separate post-launch capability, not a reason to claim media delivery proof.

## Deferred scope

Binary media upload/storage, advanced accounting, automatic supplier payouts,
tax reporting, CRM, recommendations and marketing automation remain out of scope.
