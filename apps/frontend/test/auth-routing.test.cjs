const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/auth-routing.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleValue = { exports: {} };
new Function("exports", "require", "module", "__filename", "__dirname", compiled)(moduleValue.exports, require, moduleValue, __filename, __dirname);
const { loginHref, postAuthDestination, workforceDestination, WORKFORCE_ACCESS_UNAVAILABLE } = moduleValue.exports;

test("returns customers to an in-app page after authentication", () => {
  assert.equal(postAuthDestination("/products?category=home"), "/products?category=home");
  assert.equal(loginHref("/checkout"), "/login?returnTo=%2Fcheckout");
});

test("fails closed for external and authentication-page return targets", () => {
  for (const destination of [undefined, "https://attacker.example", "//attacker.example", "/login", "/login?returnTo=%2Fcheckout", "/register"]) assert.equal(postAuthDestination(destination), "/");
});

test("workforce workspace routes use workforce sign-in instead of customer sign-in", () => {
  assert.equal(loginHref("/supplier/organization-1/finance"), "/staff/login?returnTo=%2Fsupplier%2Forganization-1%2Ffinance");
  assert.equal(loginHref("/platform/staff"), "/staff/login?returnTo=%2Fplatform%2Fstaff");
  assert.equal(loginHref("/account/orders"), "/login?returnTo=%2Faccount%2Forders");
});

const platform = { accountAudience: "WORKFORCE", platformPermissions: ["platform.operations.read", "platform.orders.read"], organizations: [] };
const supplier = { accountAudience: "WORKFORCE", platformPermissions: [], organizations: [{ id: "org-1", permissions: ["supplier.read", "inventory.read", "orders.read"] }] };
const hybrid = { ...supplier, platformPermissions: platform.platformPermissions };

test("platform admins with no supplier membership land on platform", () => {
  assert.equal(workforceDestination(platform), "/platform");
  assert.equal(workforceDestination(platform, "/supplier/org-1"), "/platform");
  assert.equal(workforceDestination(platform, "/platform/orders?status=PAYMENT_REVIEW"), "/platform/orders?status=PAYMENT_REVIEW");
  assert.equal(workforceDestination(platform, "/platform/finance"), "/platform");
});
test("supplier-only staff resolve to a real authorized organization, not platform", () => {
  assert.equal(workforceDestination(supplier), "/supplier/org-1");
  assert.equal(workforceDestination(supplier, "/supplier/org-1/inventory?view=ATTENTION"), "/supplier/org-1/inventory?view=ATTENTION");
  assert.equal(workforceDestination(supplier, "/platform"), "/supplier/org-1");
  assert.equal(workforceDestination(supplier, "/supplier/other-org/orders"), "/supplier/org-1");
});
test("hybrid workforce returnTo remains entitlement-bound and defaults to platform", () => {
  assert.equal(workforceDestination(hybrid), "/platform");
  assert.equal(workforceDestination(hybrid, "/supplier/org-1/orders"), "/supplier/org-1/orders");
  assert.equal(workforceDestination(hybrid, "/platform/orders"), "/platform/orders");
  assert.equal(workforceDestination(hybrid, "/supplier/other-org/inventory"), "/platform");
});
test("external, protocol-relative, backslash and control-character redirects never leave the app", () => {
  for (const target of [
    "https://attacker.example", "//attacker.example", "/\\\\attacker.example", "/%2fattacker.example",
    "/platform/finance", "/platform/unknown", "/platform/orders/other",
    "/platform\n/orders",
  ]) {
    assert.equal(workforceDestination(platform, target), "/platform");
  }
});
test("unassigned workforce and mismatched account audiences fail to explicit unavailable state", () => {
  assert.equal(workforceDestination({ accountAudience: "WORKFORCE", organizations: [], platformPermissions: [] }), WORKFORCE_ACCESS_UNAVAILABLE);
  assert.equal(workforceDestination({ ...platform, accountAudience: "CUSTOMER" }), WORKFORCE_ACCESS_UNAVAILABLE);
});
