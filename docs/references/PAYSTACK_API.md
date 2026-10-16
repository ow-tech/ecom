# Paystack references

- [API overview](https://paystack.com/docs/api/)
- [Paystack documentation](https://paystack.com/docs/)
- [Authentication](https://paystack.com/docs/api/authentication/)
- [Transactions](https://paystack.com/docs/api/transaction/)
- [Payment channels](https://paystack.com/docs/payments/payment-channels/)
- [InlineJS v2](https://paystack.com/docs/developer-tools/inlinejs/)
- [Webhooks](https://paystack.com/docs/payments/webhooks/)
- [Verify payments](https://paystack.com/docs/payments/verify-payments/)
- [Test payments](https://paystack.com/docs/payments/test-payments/)

The platform uses `https://api.paystack.co` for TEST and LIVE; the server-only
secret key selects the environment. Do not add it to browser variables. TEST
fixtures are only entered into Paystack-hosted UI: success card
`4084084084084081` / future expiry / CVV `408`, declined card
`4084080000005408` / future expiry / CVV `001`, and (where the merchant is
eligible) M-Pesa `+254710000000`.

## Environment and preflight

Obtain `PAYSTACK_SECRET_KEY` from Paystack Dashboard **Settings → API Keys &
Webhooks** (or the Developers overview in Paystack Canvas). Use the TEST secret
for this workflow, store it only in ignored server configuration or a secrets
manager, and never expose it through `NEXT_PUBLIC_*` variables or commit it.
`PAYSTACK_SECRET_KEY` must be a real `sk_test_` key for test verification.
`PAYSTACK_ENVIRONMENT=test` makes the intended key class explicit.
`PAYSTACK_BASE_URL` normally remains `https://api.paystack.co`,
`PAYSTACK_CALLBACK_BASE_URL` must identify the customer-owned return route, and
`PAYSTACK_MPESA_ENABLED` defaults to `false`. Enabling the flag does not grant
the merchant M-Pesa capability; the Paystack test account must also expose that
channel and the checkout currency must be KES.

Configure the public webhook URL in the same Dashboard/Canvas integration as
`https://<api-host>/payments/paystack/webhook`. Localhost cannot receive provider
delivery. The callback base must be the public customer frontend origin; callback
arrival never marks an order paid.

Run `pnpm --filter @ecom/backend paystack:test-check` before transaction QA. It
performs only the authenticated balance read, rejects live keys and known
placeholder/synthetic test keys locally, and creates no Ecom order or Paystack
transaction. HTTP 401 means the credential is not usable and blocks all claims
of live TEST Card, merchant-channel, or webhook verification.
