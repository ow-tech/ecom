const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/payment-state.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleValue = { exports: {} };
new Function("exports", "require", "module", "__filename", "__dirname", compiled)(moduleValue.exports, require, moduleValue, __filename, __dirname);
const { customerPaymentState, shouldPollPayment } = moduleValue.exports;
const order = (status, paymentStatus) => ({ status, paymentStatus });
const payment = (status) => ({ status });

test("maps the customer payment states conservatively", () => {
  assert.equal(customerPaymentState(order("PENDING_PAYMENT", "UNPAID"), null), "PAYABLE");
  assert.equal(customerPaymentState(order("PENDING_PAYMENT", "UNPAID"), payment("PENDING")), "PENDING_CONFIRMATION");
  assert.equal(customerPaymentState(order("PENDING_PAYMENT", "UNPAID"), payment("UNKNOWN")), "UNKNOWN");
  assert.equal(customerPaymentState(order("PAYMENT_CONFIRMED", "PAID"), payment("SUCCEEDED")), "PAID");
  assert.equal(customerPaymentState(order("PENDING_PAYMENT", "UNPAID"), payment("FAILED")), "FAILED");
  assert.equal(customerPaymentState(order("PAYMENT_REVIEW", "PAID_REVIEW"), payment("SUCCEEDED")), "PAYMENT_REVIEW");
  assert.equal(customerPaymentState(order("AWAITING_DELIVERY_QUOTE", "UNPAID"), null), "AWAITING_DELIVERY_QUOTE");
  assert.equal(customerPaymentState(order("EXPIRED", "UNPAID"), payment("PENDING")), "EXPIRED");
  assert.equal(customerPaymentState(order("CANCELLED", "UNPAID"), payment("PENDING")), "CANCELLED");
});

test("polling is bounded and only continues for nonterminal confirmation states", () => {
  assert.equal(shouldPollPayment("PENDING_CONFIRMATION", 0, 30), true);
  assert.equal(shouldPollPayment("UNKNOWN", 29, 30), true);
  assert.equal(shouldPollPayment("UNKNOWN", 30, 30), false);
  assert.equal(shouldPollPayment("PAID", 0, 30), false);
  assert.equal(shouldPollPayment("FAILED", 0, 30), false);
  assert.equal(shouldPollPayment("PAYMENT_REVIEW", 0, 30), false);
});

test("an exhausted client polling window leaves unresolved provider truth nonterminal", () => {
  const unresolved = customerPaymentState(order("PENDING_PAYMENT", "UNPAID"), payment("UNKNOWN"));
  assert.equal(shouldPollPayment(unresolved, 100, 100), false);
  assert.equal(unresolved, "UNKNOWN");
  assert.notEqual(unresolved, "FAILED");
});
