const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/auth-routing.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleValue = { exports: {} };
new Function("exports", "require", "module", "__filename", "__dirname", compiled)(moduleValue.exports, require, moduleValue, __filename, __dirname);
const { loginHref, postAuthDestination } = moduleValue.exports;

test("returns customers to an in-app page after authentication", () => {
  assert.equal(postAuthDestination("/products?category=home"), "/products?category=home");
  assert.equal(loginHref("/checkout"), "/login?returnTo=%2Fcheckout");
});

test("fails closed for external and authentication-page return targets", () => {
  for (const destination of [undefined, "https://attacker.example", "//attacker.example", "/login", "/login?returnTo=%2Fcheckout", "/register"]) assert.equal(postAuthDestination(destination), "/");
});
