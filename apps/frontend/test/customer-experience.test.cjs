const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadTypeScript(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleValue = { exports: {} };
  new Function("exports", "require", "module", "__filename", "__dirname", compiled)(moduleValue.exports, require, moduleValue, __filename, __dirname);
  return moduleValue.exports;
}

const { canReplyToSupportTicket, customerOrderStatusTone, customerVisibleSupportMessages, showsSeparateSupplierProgress, validateSupportTicketInput } = loadTypeScript("../lib/customer-experience.ts");
const { customerPaymentState } = loadTypeScript("../lib/payment-state.ts");
const { ApiError, api } = loadTypeScript("../lib/api.ts");

test("maps customer order status and separately renders multi-supplier progress", () => {
  assert.equal(customerOrderStatusTone("PAID"), "success");
  assert.equal(customerOrderStatusTone("PAID_REVIEW"), "warning");
  assert.equal(customerOrderStatusTone("UNPAID"), "info");
  assert.equal(showsSeparateSupplierProgress([{ status: "PROCESSING" }]), false);
  assert.equal(showsSeparateSupplierProgress([{ status: "PROCESSING" }, { status: "OUT_FOR_DELIVERY" }]), true);
});

test("allows payment continuation only for server-payable orders", () => {
  assert.equal(customerPaymentState({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }, null), "PAYABLE");
  assert.notEqual(customerPaymentState({ status: "PAYMENT_REVIEW", paymentStatus: "PAID_REVIEW" }, { status: "SUCCEEDED" }), "PAYABLE");
  assert.notEqual(customerPaymentState({ status: "EXPIRED", paymentStatus: "UNPAID" }, null), "PAYABLE");
});

test("validates ticket input and prevents replies to closed tickets", () => {
  assert.equal(validateSupportTicketInput(" ", "message"), "Enter a subject for your request.");
  assert.equal(validateSupportTicketInput("Subject", " "), "Enter a message for your request.");
  assert.equal(validateSupportTicketInput("Subject", "Message"), undefined);
  assert.equal(canReplyToSupportTicket("OPEN"), true);
  assert.equal(canReplyToSupportTicket("CLOSED"), false);
});

test("projects only public support messages when visibility is present", () => {
  assert.deepEqual(customerVisibleSupportMessages([{ body: "Customer message", visibility: "PUBLIC" }, { body: "Internal note", visibility: "INTERNAL" }, { body: "Legacy public projection" }]), [{ body: "Customer message", visibility: "PUBLIC" }, { body: "Legacy public projection" }]);
});

test("turns backend failures into a customer-safe API error", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: "Order not found" }) });
  try {
    await assert.rejects(() => api.customerOrder("foreign-order"), error => error instanceof ApiError && error.status === 404 && error.message === "Order not found");
  } finally {
    global.fetch = previousFetch;
  }
});
