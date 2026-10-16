const key = process.env.PAYSTACK_SECRET_KEY;

if (!key || !key.startsWith("sk_test_") || /REPLACE_WITH|CHANGE_ME|example|integration[_-]?only|qa[_-]?only|local[_-]?only/i.test(key)) {
  throw new Error("PAYSTACK_SECRET_KEY must be an actual sk_test_ key; no provider request was made.");
}

const baseUrl = (process.env.PAYSTACK_BASE_URL || "https://api.paystack.co").replace(/\/$/, "");
void fetch(`${baseUrl}/balance`, { headers: { Authorization: `Bearer ${key}` } }).then(async response => {
  if (!response.ok) throw new Error(`Paystack account check failed with HTTP ${response.status}`);
  const body = await response.json() as { status?: unknown };
  if (body.status !== true) throw new Error("Paystack account check returned an unsuccessful response");
  process.stdout.write("Paystack TEST account access confirmed. No Ecom order or payment was created.\n");
}).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "Paystack account check failed"}\n`); process.exitCode = 1; });
