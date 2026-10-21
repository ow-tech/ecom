import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Prisma, ProductStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as cookieParser from "cookie-parser";
import { createHash, createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import { PaystackClient } from "../src/payments/paystack/paystack.client";
import { PaystackEvidence, PaystackProviderError } from "../src/payments/paystack/paystack.types";
import { ReservationExpiryService } from "../src/payments/reservation-expiry.service";
import { PaymentReconciliationService } from "../src/payments/payment-reconciliation.service";
import { PrismaService } from "../src/prisma/prisma.service";

// Integration responses intentionally cover several endpoint contracts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = { status: number; body: Record<string, any>; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };
type OrderFixture = { customer: Account; customerEmail: string; owner: Account; orderId: string; itemId: string; totalMinor: string };

const prefix = `payments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("Paystack payment settlement and reservation expiry integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let expiry: ReservationExpiryService;
  let config: ConfigService;
  let baseUrl: string;
  const initialized: Array<{ reference: string; amountMinor: string; currency: string; email: string; orderId: string }> = [];
  const verification = new Map<string, PaystackEvidence | Error>();
  const paystack = {
    initialize: jest.fn(async (input: { reference: string; amountMinor: string; currency: string; email: string; orderId: string }) => {
      initialized.push(input);
      return { reference: input.reference, authorizationUrl: `https://checkout.test/${input.reference}`, accessCode: `access_${input.reference}` };
    }),
    verify: jest.fn(async (reference: string) => {
      const result = verification.get(reference);
      if (result instanceof Error) throw result;
      if (!result) throw new Error("Missing verification fixture");
      return result;
    }),
  };

  const email = (label: string) => `${prefix}-${label}@example.test`;
  const slug = (label: string) => `${prefix}-${label}`;

  async function http(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
      const request = httpRequest(`${baseUrl}${path}`, { method, headers: { ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}), ...(cookie ? { cookie } : {}), ...headers } }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : {}, headers: response.headers }); });
      });
      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  async function account(label: string): Promise<Account> {
    const response = await http("POST", (/owner|admin|member|staff|platform|supplier|inventory|locations|receive-|physical-|reservation-|history-|concurrency-|constraint-|tenant-|oversight|payviewer|finance-reader|refund-reader|refund-reviewer|multi-org|list-|roles-|url-owner|rbac-|suspend-owner|approve-|reject-|submit-|create-|support-agent|foreign-org|pickup-foreign|pickup-outsider/i.test(label) ? "/auth/workforce/register" : "/auth/register"), { email: email(label), password, displayName: label });
    expect(response.status).toBe(201);
    return { id: response.body.id, cookie: (response.headers["set-cookie"] as string[])[0].split(";", 1)[0] };
  }

  async function createOrder(label: string, price = "10.00", quantity = 1, currencyCode = "USD", origin: "LOCAL" | "OVERSEAS" = "LOCAL"): Promise<OrderFixture> {
    const customer = await account(`${label}-customer`);
    const owner = await account(`${label}-owner`);
    const organization = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.body.id, displayName: `${label} supplier`, slug: slug(`${label}-supplier`), status: SupplierStatus.ACTIVE, overseasEnabled: origin === "OVERSEAS" } });
    const category = await prisma.category.create({ data: { name: `${label} category`, slug: slug(`${label}-category`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${label} product`, slug: slug(`${label}-product`), status: ProductStatus.ACTIVE } });
    const listing = await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, price: new Prisma.Decimal(price), currencyCode, status: SupplierListingStatus.ACTIVE, origin, overseasOrderable: origin === "OVERSEAS" ? quantity + 2 : 0, deliveryMinDays: origin === "OVERSEAS" ? 14 : null, deliveryMaxDays: origin === "OVERSEAS" ? 21 : null } });
    const location = await prisma.inventoryLocation.create({ data: { supplierId: supplier.id, name: `${label} location`, code: label.slice(-80).toUpperCase() } });
    const item = await prisma.inventoryItem.create({ data: { supplierListingId: listing.id, inventoryLocationId: location.id, onHand: quantity + 2 } });
    const address = await http("POST", "/customer/addresses", { recipientName: "Payment Customer", phone: "+254700000000", countryCode: "KE", region: "Nairobi", city: "Nairobi" }, customer.cookie);
    expect((await http("POST", "/customer/cart/items", { supplierListingId: listing.id, quantity }, customer.cookie)).status).toBe(201);
    const preview = await http("POST", "/customer/checkout/preview", { fulfillmentMethod: "DELIVERY", addressId: address.body.id }, customer.cookie);
    expect(preview.body).toEqual(expect.objectContaining({ currencyCode, subtotal: new Prisma.Decimal(price).mul(quantity).toFixed(2), total: new Prisma.Decimal(price).mul(quantity).toFixed(2), deliveryQuoteRequired: false }));
    expect(await prisma.order.count({ where: { customerProfile: { userId: customer.id } } })).toBe(0);
    expect(await prisma.payment.count({ where: { order: { customerProfile: { userId: customer.id } } } })).toBe(0);
    expect(await prisma.inventoryReservation.count({ where: { order: { customerProfile: { userId: customer.id } } } })).toBe(0);
    const checkout = await http("POST", "/customer/checkout/prepare", { fulfillmentMethod: "DELIVERY", addressId: address.body.id }, customer.cookie, { "idempotency-key": `${label}-checkout` });
    expect(checkout.status).toBe(201);
    return { customer, customerEmail: email(`${label}-customer`), owner, orderId: checkout.body.orderId, itemId: item.id, totalMinor: new Prisma.Decimal(price).mul(quantity).mul(100).toFixed(0) };
  }

  async function initialize(fixture: OrderFixture, key = "payment-key", method?: "CARD" | "MPESA") {
    return http("POST", `/customer/orders/${fixture.orderId}/payments/initialize`, method ? { method } : undefined, fixture.customer.cookie, { "idempotency-key": key });
  }

  async function webhook(event: Record<string, unknown>, signatureValid = true) {
    const raw = JSON.stringify(event);
    const signature = createHmac("sha512", signatureValid ? "sk_test_integration_only" : "wrong-secret").update(raw).digest("hex");
    return http("POST", "/payments/paystack/webhook", raw, undefined, { "x-paystack-signature": signature });
  }

  function successEvent(reference: string, amount: string, customerEmail: string, overrides: Record<string, unknown> = {}) {
    return { event: "charge.success", data: { id: 12345, reference, status: "success", amount: Number(amount), currency: "USD", customer: { email: customerEmail }, paid_at: new Date().toISOString(), channel: "card", gateway_response: "Successful", ...overrides } };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PaystackClient).useValue(paystack).compile();
    app = module.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    expiry = app.get(ReservationExpiryService);
    config = app.get(ConfigService);
    const zone = await prisma.deliveryZone.create({ data: { name: `${prefix} automatic delivery`, countryCode: "KE", region: "Nairobi", city: "Nairobi" } });
    await prisma.deliveryRate.create({ data: { deliveryZoneId: zone.id, name: "Payment test delivery", amount: new Prisma.Decimal(0), currencyCode: "USD" } });
    await prisma.deliveryRate.create({ data: { deliveryZoneId: zone.id, name: "Payment test delivery KES", amount: new Prisma.Decimal(0), currencyCode: "KES" } });
  });

  afterAll(async () => {
    if (prisma) {
      const profiles = await prisma.customerProfile.findMany({ where: { user: { emailNormalized: { startsWith: prefix } } }, select: { id: true } });
      const profileIds = profiles.map(({ id }) => id);
      const orders = await prisma.order.findMany({ where: { customerProfileId: { in: profileIds } }, select: { id: true } });
      const orderIds = orders.map(({ id }) => id);
      await prisma.deliveryRate.deleteMany({ where: { deliveryZone: { name: { startsWith: prefix } } } });
      await prisma.deliveryZone.deleteMany({ where: { name: { startsWith: prefix } } });
      const payments = await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
      await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: payments.map(({ id }) => id) } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.inventoryMovement.deleteMany({ where: { inventoryItem: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderDeliveryAddress.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.supplierOrderStatusHistory.deleteMany({ where: { supplierOrder: { orderId: { in: orderIds } } } });
      await prisma.supplierOrder.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.checkoutAttempt.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.cartItem.deleteMany({ where: { cart: { customerProfileId: { in: profileIds } } } });
      await prisma.cart.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.customerAddress.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.customerProfile.deleteMany({ where: { id: { in: profileIds } } });
      await prisma.inventoryItem.deleteMany({ where: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } });
      await prisma.inventoryLocation.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
      await prisma.supplierListing.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
      await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.auditEvent.deleteMany({ where: { actorUser: { emailNormalized: { startsWith: prefix } } } });
      await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: prefix } } });
      await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
    }
    if (app) await app.close();
  });

  it("initializes an owned payable order once with server-derived money and safe output", async () => {
    const fixture = await createOrder("initialize", "12.34", 2);
    const foreign = await account("initialize-foreign");
    expect((await http("POST", `/customer/orders/${fixture.orderId}/payments/initialize`, undefined, foreign.cookie, { "idempotency-key": "foreign" })).status).toBe(404);
    const first = await initialize(fixture, "same-key");
    const second = await initialize(fixture, "same-key");
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    const changedMethod = await initialize(fixture, "same-key", "MPESA");
    expect(changedMethod.status).toBe(409);
    expect(changedMethod.body.code).toBe("PAYMENT_METHOD_MISMATCH");
    expect(first.body).toEqual(expect.objectContaining({ provider: "PAYSTACK", status: "PENDING", authorizationUrl: expect.stringContaining("https://checkout.test/"), accessCode: expect.any(String) }));
    expect(first.body.secretKey).toBeUndefined();
    expect((await initialize(fixture, "bad-method", "BANK" as "CARD")).status).toBe(400);
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    await expect(prisma.payment.update({ where: { id: first.body.paymentId }, data: { requestedChannel: "bank" } })).rejects.toThrow(/Payment_requestedChannel_supported/);
    const call = initialized.find((entry) => entry.orderId === fixture.orderId)!;
    expect(call).toEqual(expect.objectContaining({ amountMinor: "2468", currency: "USD", email: email("initialize-customer") }));
    expect(call.reference).toMatch(/^EC_[a-f0-9]{32}$/);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toEqual(expect.objectContaining({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }));
    expect((await http("GET", `/customer/orders/${fixture.orderId}/payment-status`, undefined, fixture.customer.cookie)).body.payment).toEqual(expect.objectContaining({ id: first.body.paymentId, reference: first.body.reference, status: "PENDING" }));
    expect(await expiry.expireOrder(fixture.orderId)).toEqual({ expired: 0, orderExpired: false });
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.itemId } })).reserved).toBe(2);
  });

  it("keeps ambiguous initialization retryable and rejects terminal orders", async () => {
    const ambiguous = await createOrder("initialize-timeout", "4.00", 1);
    paystack.initialize.mockRejectedValueOnce(new PaystackProviderError("timeout", true, "TIMEOUT"));
    const timedOut = await initialize(ambiguous, "timeout-key");
    expect(timedOut.body.status).toBe("UNKNOWN");
    const callsAfterTimeout = paystack.initialize.mock.calls.length;
    expect((await initialize(ambiguous, "timeout-key")).body.paymentId).toBe(timedOut.body.paymentId);
    expect(paystack.initialize.mock.calls.length).toBe(callsAfterTimeout);

    const failed = await createOrder("initialize-failed", "4.00", 1);
    paystack.initialize.mockRejectedValueOnce(new PaystackProviderError("rejected", false, "HTTP_400"));
    expect((await initialize(failed, "failed-key")).body.status).toBe("FAILED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: failed.orderId } })).status).toBe("PENDING_PAYMENT");

    const cancelled = await createOrder("initialize-cancelled", "4.00", 1);
    await http("POST", `/customer/orders/${cancelled.orderId}/cancel`, { reason: "No longer wanted" }, cancelled.customer.cookie);
    const rejected = await initialize(cancelled, "after-cancel");
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe("ORDER_NOT_PAYABLE");
  });

  it("gates M-Pesa to enabled KES orders and sends only mobile_money", async () => {
    const fixture = await createOrder("mpesa", "100.00", 1, "KES");
    expect((await initialize(fixture, "mpesa-disabled", "MPESA")).body.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    config.set("PAYSTACK_MPESA_ENABLED", true);
    try {
      const initializedPayment = await initialize(fixture, "mpesa-enabled", "MPESA");
      expect(initializedPayment.body).toEqual(expect.objectContaining({ status: "PENDING", requestedChannel: "mobile_money" }));
      const call = paystack.initialize.mock.calls.find(([input]) => input.orderId === fixture.orderId)?.[0] as { channel?: string } | undefined;
      expect(call?.channel).toBe("mobile_money");
    } finally {
      config.set("PAYSTACK_MPESA_ENABLED", false);
    }
  });

  it("authenticates webhooks, rejects bad binding, and settles exactly once", async () => {
    const fixture = await createOrder("settlement", "10.00", 2);
    const initializedPayment = await initialize(fixture);
    const event = successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail);
    expect((await webhook(event, false)).status).toBe(401);
    expect((await webhook({ nope: true })).status).toBe(400);
    expect(await prisma.paymentEvent.count({ where: { paymentId: initializedPayment.body.paymentId } })).toBe(0);
    const unknown = await webhook({ event: "customeridentification.success", data: { reference: initializedPayment.body.reference, status: "success", amount: Number(fixture.totalMinor), currency: "USD" } });
    expect(unknown.body.result).toBe("NON_SUCCESS");
    const mismatch = await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail, { amount: Number(fixture.totalMinor) + 1 }));
    expect(mismatch.body.result).toBe("FAILED_BINDING");
    const currencyMismatch = await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail, { currency: "KES" }));
    expect(currencyMismatch.body.result).toBe("FAILED_BINDING");
    const customerMismatch = await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail, { customer: { email: "other@example.test" } }));
    expect(customerMismatch.body.result).toBe("FAILED_BINDING");
    const channelMismatch = await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail, { channel: "mobile_money" }));
    expect(channelMismatch.body.result).toBe("FAILED_BINDING");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: initializedPayment.body.paymentId } })).status).toBe("PENDING");
    const secondPayment = await initialize(fixture, "second-attempt");
    expect(secondPayment.status).toBe(409);
    const eventIdentity = createHash("sha256").update(JSON.stringify(event)).digest("hex");
    await prisma.paymentEvent.create({ data: { paymentId: initializedPayment.body.paymentId, provider: "PAYSTACK", eventType: "charge.success", eventIdentity, providerReference: initializedPayment.body.reference, processingResult: "RECEIVED", payload: event } });
    const settled = await webhook(event);
    const duplicate = await webhook(event);
    expect(settled.body.result).toBe("SETTLED");
    expect(duplicate.body.result).toBe("DUPLICATE");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { supplierOrders: true, reservations: true, statusHistory: true } });
    expect(order).toEqual(expect.objectContaining({ status: "PAYMENT_CONFIRMED", paymentStatus: "PAID" }));
    expect(order.supplierOrders.every((row) => row.status === "CONFIRMED")).toBe(true);
    expect(order.reservations.every((row) => row.status === "CONSUMED")).toBe(true);
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.itemId } })).toEqual(expect.objectContaining({ onHand: 2, reserved: 0 }));
    expect(await prisma.inventoryMovement.count({ where: { inventoryItemId: fixture.itemId, referenceType: "PAYMENT", referenceId: initializedPayment.body.paymentId } })).toBe(1);
    expect(order.statusHistory.filter((row) => row.newStatus === "PAYMENT_CONFIRMED")).toHaveLength(1);
    expect(secondPayment.body.message).toContain("unresolved payment");
    expect(await prisma.payment.count({ where: { orderId: fixture.orderId, status: "SUCCEEDED" } })).toBe(1);
    expect((await http("POST", `/customer/orders/${fixture.orderId}/payments/${initializedPayment.body.paymentId}/verify`, undefined, fixture.customer.cookie)).status).toBe(201);
    expect(await expiry.expireOrder(fixture.orderId)).toEqual({ expired: 0, orderExpired: false });
    expect(await prisma.inventoryMovement.count({ where: { inventoryItemId: fixture.itemId, referenceType: "PAYMENT" } })).toBe(1);
  });

  it("keeps webhook-confirmed success when an older verification returns pending", async () => {
    const fixture = await createOrder("stale-reconcile", "11.00", 1);
    const initialized = await initialize(fixture, "stale-key");
    let reachedVerify!: () => void;
    let releaseVerify!: () => void;
    const entered = new Promise<void>(resolve => { reachedVerify = resolve; });
    const waiting = new Promise<PaystackEvidence>(resolve => {
      releaseVerify = () => resolve({ reference: initialized.body.reference, providerStatus: "pending", amountMinor: fixture.totalMinor, currency: "USD", customerEmail: fixture.customerEmail, channel: "card" });
    });
    paystack.verify.mockImplementationOnce(async () => { reachedVerify(); return waiting; });
    const reconciliation = app.get(PaymentReconciliationService).reconcile(initialized.body.paymentId);
    await entered;
    expect((await webhook(successEvent(initialized.body.reference, fixture.totalMinor, fixture.customerEmail))).body.result).toBe("SETTLED");
    releaseVerify();
    expect((await reconciliation).status).toBe("SUCCEEDED");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: initialized.body.paymentId } })).status).toBe("SUCCEEDED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).status).toBe("PAYMENT_CONFIRMED");
    expect(await prisma.inventoryMovement.count({ where: { inventoryItemId: fixture.itemId, referenceType: "PAYMENT" } })).toBe(1);
  });

  it("expires reservations once under concurrent workers and routes late success to review", async () => {
    const fixture = await createOrder("expiry", "8.00", 1);
    const initializedPayment = await initialize(fixture);
    await prisma.inventoryReservation.updateMany({ where: { orderId: fixture.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await Promise.allSettled([expiry.expireOrder(fixture.orderId), expiry.expireOrder(fixture.orderId)]);
    const expired = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { reservations: true, supplierOrders: true } });
    expect(expired.status).toBe("EXPIRED");
    expect(expired.reservations.every((row) => row.status === "EXPIRED")).toBe(true);
    expect(expired.supplierOrders.every((row) => row.status === "EXPIRED")).toBe(true);
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.itemId } })).toEqual(expect.objectContaining({ onHand: 3, reserved: 0 }));
    expect((await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail))).body.result).toBe("PAYMENT_REVIEW");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toEqual(expect.objectContaining({ status: "PAYMENT_REVIEW", paymentStatus: "PAID_REVIEW" }));
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: initializedPayment.body.paymentId } })).status).toBe("SUCCEEDED");
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.itemId } })).toEqual(expect.objectContaining({ onHand: 3, reserved: 0 }));
  });

  it("settles a successful overseas-only Paystack order and commits its orderable capacity once", async () => {
    const fixture = await createOrder("overseas-settlement", "9.00", 1, "USD", "OVERSEAS");
    const pending = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId }, include: { reservations: true, overseasReservations: true } });
    expect(pending.reservations).toHaveLength(0);
    expect(pending.overseasReservations).toHaveLength(1);
    const initializedPayment = await initialize(fixture);
    expect(initializedPayment.status).toBe(201);
    expect((await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail))).body.result).toBe("SETTLED");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toEqual(expect.objectContaining({ status: "PAYMENT_CONFIRMED", paymentStatus: "PAID" }));
    expect((await prisma.overseasReservation.findFirstOrThrow({ where: { orderId: fixture.orderId } })).status).toBe("CONSUMED");
    const listing = await prisma.supplierListing.findUniqueOrThrow({ where: { id: pending.overseasReservations[0].supplierListingId } });
    expect(listing.overseasReserved).toBe(0);
    expect(listing.overseasCommitted).toBe(1);
    expect((await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail))).body.result).toBe("DUPLICATE");
    expect((await prisma.supplierListing.findUniqueOrThrow({ where: { id: listing.id } })).overseasCommitted).toBe(1);
  });

  it("preserves captured-payment truth after cancellation without consuming released stock", async () => {
    const fixture = await createOrder("cancel-late", "6.00", 1);
    const initializedPayment = await initialize(fixture);
    // A pending authorization must never be discarded just because the customer wants to leave.
    expect((await http("POST", `/customer/orders/${fixture.orderId}/cancel`, { reason: "Cannot abandon unresolved authorization" }, fixture.customer.cookie)).status).toBe(409);
    expect((await prisma.inventoryReservation.count({ where: { orderId: fixture.orderId, status: "ACTIVE" } })).toBeGreaterThan(0);
    verification.set(initializedPayment.body.reference, { reference: initializedPayment.body.reference, providerStatus: "failed", amountMinor: fixture.totalMinor, currency: "USD", customerEmail: fixture.customerEmail, channel: "card" });
    const verified = await http("POST", `/customer/orders/${fixture.orderId}/payments/${initializedPayment.body.paymentId}/verify`, undefined, fixture.customer.cookie);
    expect(verified.body.status).toBe("FAILED");
    expect((await http("POST", `/customer/orders/${fixture.orderId}/cancel`, { reason: "Failed authorization; abandon checkout" }, fixture.customer.cookie)).status).toBe(201);
    expect(await expiry.expireOrder(fixture.orderId)).toEqual({ expired: 0, orderExpired: false });
    expect((await webhook(successEvent(initializedPayment.body.reference, fixture.totalMinor, fixture.customerEmail))).body.result).toBe("PAYMENT_REVIEW");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toEqual(expect.objectContaining({ status: "PAYMENT_REVIEW", paymentStatus: "PAID_REVIEW" }));
    expect(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: fixture.itemId } })).toEqual(expect.objectContaining({ onHand: 3, reserved: 0 }));
  });

  it("reconciles with the persisted reference through platform permission and canonical settlement", async () => {
    const fixture = await createOrder("reconcile", "5.00", 1);
    const initializedPayment = await initialize(fixture);
    verification.set(initializedPayment.body.reference, { reference: initializedPayment.body.reference, providerStatus: "success", amountMinor: fixture.totalMinor, currency: "USD", customerEmail: fixture.customerEmail, channel: "card", paidAt: new Date() });
    const nonPlatform = await account("reconcile-non-platform");
    expect((await http("POST", `/platform/payments/${initializedPayment.body.paymentId}/reconcile`, undefined, nonPlatform.cookie)).status).toBe(403);
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "platform.super_admin" } });
    await prisma.platformRoleAssignment.create({ data: { userId: fixture.owner.id, roleId: role.id } });
    expect((await http("POST", `/platform/payments/${initializedPayment.body.paymentId}/reconcile`, undefined, fixture.owner.cookie)).status).toBe(201);
    expect((await http("POST", `/platform/payments/${initializedPayment.body.paymentId}/reconcile`, undefined, fixture.owner.cookie)).status).toBe(201);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toEqual(expect.objectContaining({ status: "PAYMENT_CONFIRMED", paymentStatus: "PAID" }));
    expect(await prisma.inventoryMovement.count({ where: { inventoryItemId: fixture.itemId, referenceType: "PAYMENT" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { actorUserId: fixture.owner.id, action: "PAYMENT_RECONCILED", entityId: initializedPayment.body.paymentId } })).toBe(1);
    expect(paystack.verify).toHaveBeenCalledWith(initializedPayment.body.reference);
  });

  it("keeps pending and ambiguous verification unresolved without false failure", async () => {
    const pendingFixture = await createOrder("verify-pending", "3.00", 1);
    const pendingPayment = await initialize(pendingFixture);
    verification.set(pendingPayment.body.reference, { reference: pendingPayment.body.reference, providerStatus: "pending", amountMinor: pendingFixture.totalMinor, currency: "USD", customerEmail: pendingFixture.customerEmail, channel: "card" });
    expect((await http("POST", `/customer/orders/${pendingFixture.orderId}/payments/${pendingPayment.body.paymentId}/verify`, undefined, pendingFixture.customer.cookie)).body.status).toBe("PENDING");

    const unknownFixture = await createOrder("verify-unknown", "3.00", 1);
    const unknownPayment = await initialize(unknownFixture);
    verification.set(unknownPayment.body.reference, new PaystackProviderError("network ambiguity", true, "NETWORK_ERROR"));
    expect((await http("POST", `/customer/orders/${unknownFixture.orderId}/payments/${unknownPayment.body.paymentId}/verify`, undefined, unknownFixture.customer.cookie)).body.status).toBe("UNKNOWN");
    expect((await http("POST", `/customer/orders/${unknownFixture.orderId}/payments/${unknownPayment.body.paymentId}/verify`, undefined, unknownFixture.customer.cookie)).body.status).toBe("UNKNOWN");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: unknownFixture.orderId } })).status).toBe("PENDING_PAYMENT");
  });
});
