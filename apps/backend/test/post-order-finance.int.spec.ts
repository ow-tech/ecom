import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MembershipStatus, PaymentStatus, Prisma, ProductStatus, RoleScope, SupplierLedgerEntryType, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import { PaystackClient } from "../src/payments/paystack/paystack.client";
import { PaystackProviderError } from "../src/payments/paystack/paystack.types";
import { PrismaService } from "../src/prisma/prisma.service";
import { FinancePostingService } from "../src/finance/finance-posting.service";

// Integration responses span several endpoint contracts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = { status: number; body: Record<string, any>; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };
type Fixture = { customer: Account; owner: Account; platform: Account; orderId: string; orderItemId: string; supplierOrderId: string; supplierId: string; organizationId: string; paymentId: string };
const prefix = `post-order-finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("post-order refund, return, warranty, commission, ledger, and settlement integration", () => {
  let app: INestApplication; let prisma: PrismaService; let baseUrl: string;
  const refundCreates = jest.fn(); const refundQueries = jest.fn();
  const paystack = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createRefund: jest.fn(async (input: any) => { refundCreates(input); return { providerRefundId: `ps-${input.internalReference}`, providerStatus: "processed", amountMinor: input.amountMinor, currency: input.currency, transactionReference: input.transactionReference, merchantNote: input.internalReference, refundedAt: new Date(), raw: {} }; }),
    fetchRefund: jest.fn(async (id: string) => { refundQueries(id); return { providerRefundId: id, providerStatus: "processed", amountMinor: "1000", currency: "USD", refundedAt: new Date(), raw: {} }; }),
    findRefund: jest.fn(async (reference: string, note: string) => { refundQueries({ reference, note }); return null; }),
  };
  const email = (x: string) => `${prefix}-${x}@example.test`; const slug = (x: string) => `${prefix}-${x}`;
  async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> { return new Promise((resolve, reject) => { const payload = body === undefined ? undefined : JSON.stringify(body); const req = httpRequest(`${baseUrl}${path}`, { method, headers: { ...(payload ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(payload)) } : {}), ...(cookie ? { cookie } : {}) } }, (res) => { const chunks: Buffer[] = []; res.on("data", (chunk: Buffer) => chunks.push(chunk)); res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {}, headers: res.headers }); }); }); req.on("error", reject); if (payload) req.write(payload); req.end(); }); }
  async function account(label: string): Promise<Account> { const result = await http("POST", "/auth/register", { email: email(label), password, displayName: label }); expect(result.status).toBe(201); return { id: result.body.id, cookie: (result.headers["set-cookie"] as string[])[0].split(";", 1)[0] }; }
  async function platformAccount(label: string) { const user = await account(label); const role = await prisma.role.findUniqueOrThrow({ where: { key: "platform.super_admin" } }); await prisma.platformRoleAssignment.create({ data: { userId: user.id, roleId: role.id } }); return user; }
  async function platformWith(label: string, permissions: string[]) {
    const user = await account(label);
    const role = await prisma.role.create({ data: { key: slug(`role-${label}`), name: label, scope: RoleScope.PLATFORM, isSystem: false, permissions: { create: permissions.map((key) => ({ permission: { connect: { key } } })) } } });
    await prisma.platformRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    return user;
  }
  async function supplierMember(f: Fixture, label: string, status: MembershipStatus = MembershipStatus.ACTIVE) {
    const user = await account(label); const role = await prisma.role.findUniqueOrThrow({ where: { key: "organization.member" } });
    const membership = await prisma.organizationMembership.create({ data: { organizationId: f.organizationId, userId: user.id, status } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
    return { user, membership };
  }
  async function fixture(label: string, quantity = 3): Promise<Fixture> {
    const customer = await account(`${label}-customer`); const owner = await account(`${label}-owner`); const platform = await platformAccount(`${label}-platform`);
    const org = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    const supplier = await prisma.supplier.create({ data: { organizationId: org.body.id, displayName: `${label} supplier`, slug: slug(`${label}-supplier`), status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: `${label} category`, slug: slug(`${label}-category`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${label} product`, slug: slug(`${label}-product`), status: ProductStatus.ACTIVE } });
    const listing = await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, price: new Prisma.Decimal("10.00"), currencyCode: "USD", warrantyDays: 30, status: SupplierListingStatus.ACTIVE } });
    const location = await prisma.inventoryLocation.create({ data: { supplierId: supplier.id, name: `${label} stock`, code: label.slice(-70).toUpperCase() } });
    const inventory = await prisma.inventoryItem.create({ data: { supplierListingId: listing.id, inventoryLocationId: location.id, onHand: quantity } });
    const profile = await prisma.customerProfile.create({ data: { userId: customer.id } });
    const cart = await prisma.cart.create({ data: { customerProfileId: profile.id } });
    const attempt = await prisma.checkoutAttempt.create({ data: { customerProfileId: profile.id, cartId: cart.id, idempotencyKey: `checkout-${label}` } });
    const runSuffix = prefix.slice(-6); const order = await prisma.order.create({ data: { orderNumber: `T-${label}-${runSuffix}`, customerProfileId: profile.id, checkoutAttemptId: attempt.id, status: "DELIVERED", paymentStatus: "PAID", currencyCode: "USD", subtotal: new Prisma.Decimal(10 * quantity), deliveryFee: new Prisma.Decimal(0), pickupFee: new Prisma.Decimal(0), total: new Prisma.Decimal(10 * quantity), fulfillmentMethod: "DELIVERY" } });
    const supplierOrder = await prisma.supplierOrder.create({ data: { orderId: order.id, supplierId: supplier.id, supplierOrderNumber: `S-${label}-${runSuffix}`, status: "COMPLETED", subtotal: new Prisma.Decimal(10 * quantity) } });
    const item = await prisma.orderItem.create({ data: { orderId: order.id, supplierOrderId: supplierOrder.id, supplierId: supplier.id, supplierListingId: listing.id, productId: product.id, productNameSnapshot: product.name, supplierNameSnapshot: supplier.displayName, quantity, unitPrice: new Prisma.Decimal("10.00"), lineTotal: new Prisma.Decimal(10 * quantity), currencyCode: "USD", warrantyDaysSnapshot: 30 } });
    const payment = await prisma.payment.create({ data: { orderId: order.id, providerReference: `pay-${label}-${runSuffix}`, idempotencyKey: `pay-${label}-${runSuffix}`, status: PaymentStatus.SUCCEEDED, currencyCode: "USD", amount: new Prisma.Decimal(10 * quantity), customerEmail: email(`${label}-customer`), succeededAt: new Date() } });
    await prisma.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: "OUT_FOR_DELIVERY", newStatus: "DELIVERED", publicMessage: "Delivered" } });
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { onHand: 0 } });
    return { customer, owner, platform, orderId: order.id, orderItemId: item.id, supplierOrderId: supplierOrder.id, supplierId: supplier.id, organizationId: org.body.id, paymentId: payment.id };
  }
  async function addSupplierItemToOrder(f: Fixture, label: string) {
    const owner = await account(`${label}-owner`);
    const org = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    const supplier = await prisma.supplier.create({ data: { organizationId: org.body.id, displayName: `${label} supplier`, slug: slug(`${label}-supplier`), status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: `${label} category`, slug: slug(`${label}-category`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${label} product`, slug: slug(`${label}-product`), status: ProductStatus.ACTIVE } });
    const listing = await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, price: new Prisma.Decimal("10.00"), currencyCode: "USD", warrantyDays: 30, status: SupplierListingStatus.ACTIVE } });
    const supplierOrder = await prisma.supplierOrder.create({ data: { orderId: f.orderId, supplierId: supplier.id, supplierOrderNumber: `S-${label}-${prefix.slice(-6)}`, status: "COMPLETED", subtotal: new Prisma.Decimal("10.00") } });
    const item = await prisma.orderItem.create({ data: { orderId: f.orderId, supplierOrderId: supplierOrder.id, supplierId: supplier.id, supplierListingId: listing.id, productId: product.id, productNameSnapshot: product.name, supplierNameSnapshot: supplier.displayName, quantity: 1, unitPrice: new Prisma.Decimal("10.00"), lineTotal: new Prisma.Decimal("10.00"), currencyCode: "USD", warrantyDaysSnapshot: 30 } });
    return { owner, organizationId: org.body.id, supplierId: supplier.id, orderItemId: item.id, productName: product.name };
  }
  async function refund(f: Fixture, quantity = 1) { const created = await http("POST", `/customer/orders/${f.orderId}/refund-requests`, { reasonCode: "DAMAGED", items: [{ orderItemId: f.orderItemId, quantity }] }, f.customer.cookie); expect(created.status).toBe(201); const approved = await http("POST", `/platform/refund-requests/${created.body.id}/approve`, undefined, f.platform.cookie); expect(approved.status).toBe(201); return { requestId: created.body.id, refundId: approved.body.refund.id }; }

  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PaystackClient).useValue(paystack).compile(); app = module.createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.listen(0, "127.0.0.1"); baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`; prisma = app.get(PrismaService); });
  afterAll(async () => { if (prisma) { const users = await prisma.user.findMany({ where: { emailNormalized: { startsWith: prefix } }, select: { id: true } }); const userIds = users.map((x) => x.id); const profiles = await prisma.customerProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } }); const ids = profiles.map((x) => x.id); const orders = await prisma.order.findMany({ where: { customerProfileId: { in: ids } }, select: { id: true } }); const orderIds = orders.map((x) => x.id); const refunds = await prisma.refund.findMany({ where: { refundRequest: { orderId: { in: orderIds } } }, select: { id: true } }); const settlements = await prisma.supplierSettlement.findMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } }, select: { id: true } }); const notifications = await prisma.notification.findMany({ where: { recipientUserId: { in: userIds } }, select: { id: true } }); await prisma.notificationDeliveryAttempt.deleteMany({ where: { notificationId: { in: notifications.map((x) => x.id) } } }); await prisma.notification.deleteMany({ where: { recipientUserId: { in: userIds } } }); await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } }); await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }); await prisma.supplierSettlementItem.deleteMany({ where: { settlementId: { in: settlements.map((x) => x.id) } } }); await prisma.supplierSettlement.deleteMany({ where: { id: { in: settlements.map((x) => x.id) } } }); await prisma.supplierLedgerEntry.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } }); await prisma.refundEvent.deleteMany({ where: { refundId: { in: refunds.map((x) => x.id) } } }); await prisma.refund.deleteMany({ where: { id: { in: refunds.map((x) => x.id) } } }); await prisma.refundRequestItem.deleteMany({ where: { refundRequest: { orderId: { in: orderIds } } } }); await prisma.refundRequest.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.returnStatusHistory.deleteMany({ where: { returnRequest: { orderId: { in: orderIds } } } }); await prisma.returnItem.deleteMany({ where: { returnRequest: { orderId: { in: orderIds } } } }); await prisma.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.warrantyStatusHistory.deleteMany({ where: { warrantyClaim: { orderItem: { orderId: { in: orderIds } } } } }); await prisma.warrantyClaim.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } }); await prisma.commissionRecord.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } }); await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.supplierOrderStatusHistory.deleteMany({ where: { supplierOrder: { orderId: { in: orderIds } } } }); await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.supplierOrder.deleteMany({ where: { orderId: { in: orderIds } } }); await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); await prisma.checkoutAttempt.deleteMany({ where: { customerProfileId: { in: ids } } }); await prisma.cart.deleteMany({ where: { customerProfileId: { in: ids } } }); await prisma.customerProfile.deleteMany({ where: { id: { in: ids } } }); await prisma.inventoryItem.deleteMany({ where: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } }); await prisma.inventoryLocation.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } }); await prisma.supplierListing.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } }); await prisma.supplierCommissionRate.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } }); await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } }); await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } }); } if (app) await app.close(); });

  it("derives and protects refund quantities, serializes final-unit races, and applies provider evidence once", async () => {
    const f = await fixture("refund"); const stranger = await account("refund-stranger");
    expect((await http("POST", `/customer/orders/${f.orderId}/refund-requests`, { reasonCode: "X", items: [{ orderItemId: f.orderItemId, quantity: 1 }] }, stranger.cookie)).status).toBe(404);
    const first = await refund(f, 1); const second = await refund(f, 1);
    await prisma.commissionRecord.create({ data: { orderItemId: f.orderItemId, supplierId: f.supplierId, supplierOrderId: f.supplierOrderId, grossAmount: new Prisma.Decimal("30.00"), commissionRate: new Prisma.Decimal("0.100000"), commissionAmount: new Prisma.Decimal("3.00"), supplierNetAmount: new Prisma.Decimal("27.00"), currencyCode: "USD", earnedAt: new Date() } });
    expect((await prisma.refundRequest.findUniqueOrThrow({ where: { id: first.requestId } })).requestedAmount!.toFixed(2)).toBe("10.00");
    const finalRace = await Promise.all([http("POST", `/customer/orders/${f.orderId}/refund-requests`, { reasonCode: "X", items: [{ orderItemId: f.orderItemId, quantity: 2 }] }, f.customer.cookie), http("POST", `/customer/orders/${f.orderId}/refund-requests`, { reasonCode: "X", items: [{ orderItemId: f.orderItemId, quantity: 2 }] }, f.customer.cookie)]);
    expect(finalRace.filter((x) => x.status === 201)).toHaveLength(0); expect(finalRace.every((x) => x.status === 409)).toBe(true);
    await expect(Promise.all([http("POST", `/platform/refunds/${first.refundId}/execute`, undefined, f.platform.cookie), http("POST", `/platform/refunds/${first.refundId}/execute`, undefined, f.platform.cookie)])).resolves.toHaveLength(2);
    const executed = await prisma.refund.findUniqueOrThrow({ where: { id: first.refundId } }); expect(refundCreates.mock.calls.filter((x) => x[0].internalReference === executed.providerReference)).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { actorUserId: f.platform.id, action: "REFUND_PROVIDER_RECONCILED", entityId: first.refundId } })).toBe(1);
    const debit = await prisma.supplierLedgerEntry.findFirstOrThrow({ where: { type: SupplierLedgerEntryType.REFUND_DEBIT, referenceId: { startsWith: `${first.refundId}:` } } }); expect(debit.amountSigned.toFixed(2)).toBe("-9.00");
    const ambiguous = await refund(f, 1); paystack.createRefund.mockRejectedValueOnce(new PaystackProviderError("timeout", true, "TIMEOUT")); expect((await http("POST", `/platform/refunds/${ambiguous.refundId}/execute`, undefined, f.platform.cookie)).body.status).toBe("UNKNOWN"); const calls = paystack.createRefund.mock.calls.length; expect((await http("POST", `/platform/refunds/${ambiguous.refundId}/reconcile`, undefined, f.platform.cookie)).body.status).toBe("UNKNOWN"); expect(paystack.createRefund.mock.calls.length).toBe(calls);
    await http("POST", `/platform/refunds/${second.refundId}/execute`, undefined, f.platform.cookie);
  });

  it("uses delivery history for return and warranty eligibility, keeps returned stock non-sellable, and preserves lifecycle history", async () => {
    const f = await fixture("returns"); const stockBefore = await prisma.inventoryItem.count({ where: { onHand: { gt: 0 } } });
    const made = await http("POST", `/customer/orders/${f.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: f.orderItemId, quantity: 1 }] }, f.customer.cookie); expect(made.status).toBe(201);
    const duplicate = await Promise.all([http("POST", `/customer/orders/${f.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: f.orderItemId, quantity: 3 }] }, f.customer.cookie), http("POST", `/customer/orders/${f.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: f.orderItemId, quantity: 3 }] }, f.customer.cookie)]); expect(duplicate.every((x) => x.status === 409)).toBe(true);
    for (const step of ["approve", "awaiting-item", "item-received", "inspect"]) expect((await http("POST", `/platform/returns/${made.body.id}/${step}`, {}, f.platform.cookie)).status).toBe(201);
    expect((await http("POST", `/platform/returns/${made.body.id}/complete`, { resolution: "NO_ACTION" }, f.platform.cookie)).status).toBe(201); expect(await prisma.returnStatusHistory.count({ where: { returnRequestId: made.body.id } })).toBe(6); expect(await prisma.auditEvent.count({ where: { actorUserId: f.platform.id, action: "RETURN_COMPLETED", entityId: made.body.id } })).toBe(1); expect(await prisma.inventoryItem.count({ where: { onHand: { gt: 0 } } })).toBe(stockBefore);
    const warranty = await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "defect" }, f.customer.cookie); expect(warranty.status).toBe(201); await prisma.supplierListing.updateMany({ where: { supplierId: f.supplierId }, data: { warrantyDays: 0 } }); expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: f.orderItemId } })).warrantyDaysSnapshot).toBe(30);
    for (const step of ["under-review", "approve", "in-service"]) expect((await http("POST", `/platform/warranties/${warranty.body.id}/${step}`, {}, f.platform.cookie)).status).toBe(201); expect((await http("POST", `/platform/warranties/${warranty.body.id}/resolve`, { resolution: "NO_FAULT_FOUND" }, f.platform.cookie)).status).toBe(201); expect(await prisma.warrantyStatusHistory.count({ where: { warrantyClaimId: warranty.body.id } })).toBe(5); expect(await prisma.auditEvent.count({ where: { actorUserId: f.platform.id, action: "WARRANTY_RESOLVED", entityId: warranty.body.id } })).toBe(1);
  });

  it("posts immutable commission and ledger entries once, derives balances, and settles claimed rows exactly once", async () => {
    const f = await fixture("finance", 1); const commission = await prisma.commissionRecord.create({ data: { orderItemId: f.orderItemId, supplierId: f.supplierId, supplierOrderId: f.supplierOrderId, grossAmount: new Prisma.Decimal("10.00"), commissionRate: new Prisma.Decimal("0.100000"), commissionAmount: new Prisma.Decimal("1.00"), supplierNetAmount: new Prisma.Decimal("9.00"), currencyCode: "USD", earnedAt: new Date() } }); await prisma.supplierLedgerEntry.create({ data: { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("9.00"), referenceType: "COMMISSION_RECORD", referenceId: commission.id } });
    expect((await http("GET", `/organizations/${f.organizationId}/finance/balance`, undefined, f.owner.cookie)).body.balances).toContainEqual({ currencyCode: "USD", balance: "9.00" });
    const races = await Promise.all([http("POST", `/platform/suppliers/${f.supplierId}/settlements`, { currencyCode: "USD" }, f.platform.cookie), http("POST", `/platform/suppliers/${f.supplierId}/settlements`, { currencyCode: "USD" }, f.platform.cookie)]); expect(races.filter((x) => x.status === 201)).toHaveLength(1); expect(races.filter((x) => x.status === 409)).toHaveLength(1); const settlement = races.find((x) => x.status === 201)!;
    expect((await http("POST", `/platform/settlements/${settlement.body.id}/approve`, undefined, f.platform.cookie)).status).toBe(201); expect((await http("POST", `/platform/settlements/${settlement.body.id}/mark-paid`, { externalReference: "manual-proof" }, f.platform.cookie)).status).toBe(201); expect(await prisma.supplierLedgerEntry.count({ where: { type: SupplierLedgerEntryType.SETTLEMENT_DEBIT, referenceId: settlement.body.id } })).toBe(1);
  });

  it("paginates a supplier ledger with stable tuple ordering, bounded limits, and tenant permission isolation", async () => {
    const a = await fixture("ledger-pages", 1); const b = await fixture("ledger-b", 1);
    const timestamp = new Date("2045-01-02T03:04:05.000Z");
    const aRows = Array.from({ length: 27 }, (_, index) => ({ supplierId: a.supplierId, currencyCode: index === 1 ? "KES" : "USD", type: index === 2 ? SupplierLedgerEntryType.REFUND_DEBIT : SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal(index === 2 ? "-3.00" : "10.00"), referenceType: "PAGINATION_TEST", referenceId: `${prefix}-ledger-a-${index}`, createdAt: timestamp }));
    await prisma.supplierLedgerEntry.createMany({ data: aRows });
    await prisma.supplierLedgerEntry.create({ data: { supplierId: b.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("99.00"), referenceType: "PAGINATION_TEST", referenceId: `${prefix}-ledger-b`, createdAt: timestamp } });
    const first = await http("GET", `/organizations/${a.organizationId}/finance/ledger?page=1&limit=25`, undefined, a.owner.cookie);
    const second = await http("GET", `/organizations/${a.organizationId}/finance/ledger?page=2&limit=25`, undefined, a.owner.cookie);
    expect(first.status).toBe(200); expect(second.status).toBe(200); expect(first.body).toMatchObject({ page: 1, limit: 25, total: 27 }); expect(second.body).toMatchObject({ page: 2, limit: 25, total: 27 });
    expect(first.body.data).toHaveLength(25); expect(second.body.data).toHaveLength(2);
    const rows = [...first.body.data, ...second.body.data] as Array<{ id: string; currencyCode: string; amountSigned: string }>; const ids = rows.map((row) => row.id); expect(new Set(ids).size).toBe(27);
    const owned = await prisma.supplierLedgerEntry.findMany({ where: { supplierId: a.supplierId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } }); expect(ids).toEqual(owned.map((row) => row.id));
    // Equal timestamps are resolved by UUID, so rows can land on either stable page.
    expect(rows.some((row) => row.currencyCode === "KES" && row.amountSigned === "10.00")).toBe(true); expect(rows.some((row) => row.amountSigned === "-3.00")).toBe(true);
    expect((await http("GET", `/organizations/${a.organizationId}/finance/balance`, undefined, a.owner.cookie)).body.balances).toEqual(expect.arrayContaining([{ currencyCode: "USD", balance: "247.00" }, { currencyCode: "KES", balance: "10.00" }]));
    expect((await http("GET", `/organizations/${a.organizationId}/finance/ledger?page=1&limit=101`, undefined, a.owner.cookie)).status).toBe(400);
    expect((await http("GET", `/organizations/${b.organizationId}/finance/ledger?page=1&limit=25`, undefined, a.owner.cookie)).status).toBe(403);
    const { user: reader, membership } = await supplierMember(a, "ledger-pages-reader"); await prisma.organizationMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.SUSPENDED } });
    expect((await http("GET", `/organizations/${a.organizationId}/finance/ledger`, undefined, reader.cookie)).status).toBe(403);
  });

  it("posts a commission once when concurrent canonical completion requests converge", async () => {
    const f = await fixture("commission-race", 3);
    await prisma.order.update({ where: { id: f.orderId }, data: { status: "OUT_FOR_DELIVERY" } });
    await prisma.supplierOrder.update({ where: { id: f.supplierOrderId }, data: { status: "OUT_FOR_DELIVERY" } });
    const results = await Promise.allSettled([
      http("POST", `/organizations/${f.organizationId}/supplier-orders/${f.supplierOrderId}/complete`, {}, f.owner.cookie),
      http("POST", `/organizations/${f.organizationId}/supplier-orders/${f.supplierOrderId}/complete`, {}, f.owner.cookie),
    ]);
    const responses = results.filter((result): result is PromiseFulfilledResult<Response> => result.status === "fulfilled").map((result) => result.value);
    expect(responses).toHaveLength(2);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(responses.filter((response) => response.body.idempotent === false)).toHaveLength(1);
    const record = await prisma.commissionRecord.findUniqueOrThrow({ where: { orderItemId: f.orderItemId } });
    expect(record.grossAmount.toFixed(2)).toBe("30.00"); expect(record.commissionRate.toFixed(6)).toBe("0.100000"); expect(record.commissionAmount.toFixed(2)).toBe("3.00"); expect(record.supplierNetAmount.toFixed(2)).toBe("27.00");
    expect(await prisma.commissionRecord.count({ where: { orderItemId: f.orderItemId } })).toBe(1);
    expect(await prisma.supplierLedgerEntry.count({ where: { type: SupplierLedgerEntryType.SUPPLIER_EARNING, referenceId: record.id } })).toBe(1);
    const balance = await prisma.supplierLedgerEntry.aggregate({ where: { supplierId: f.supplierId, currencyCode: "USD" }, _sum: { amountSigned: true } });
    expect(balance._sum.amountSigned!.toFixed(2)).toBe("27.00");
  });

  it("marks an approved settlement paid once under concurrent platform requests and preserves signed accounting", async () => {
    const f = await fixture("paid-race", 1);
    await prisma.supplierLedgerEntry.createMany({ data: [
      { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("90.00"), referenceType: "TEST", referenceId: `${prefix}-earning` },
      { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: new Prisma.Decimal("-20.00"), referenceType: "TEST", referenceId: `${prefix}-refund` },
      { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.MANUAL_ADJUSTMENT, amountSigned: new Prisma.Decimal("5.00"), referenceType: "TEST", referenceId: `${prefix}-adjustment` },
    ] });
    const created = await http("POST", `/platform/suppliers/${f.supplierId}/settlements`, { currencyCode: "USD" }, f.platform.cookie);
    expect(created.status).toBe(201); expect(created.body.grossEarnings).toBe("90.00"); expect(created.body.refundAdjustments).toBe("-20.00"); expect(created.body.otherAdjustments).toBe("5.00"); expect(created.body.netAmount).toBe("75.00");
    expect((await http("POST", `/platform/settlements/${created.body.id}/approve`, undefined, f.platform.cookie)).status).toBe(201);
    const results = await Promise.allSettled([
      http("POST", `/platform/settlements/${created.body.id}/mark-paid`, { externalReference: "race-a" }, f.platform.cookie),
      http("POST", `/platform/settlements/${created.body.id}/mark-paid`, { externalReference: "race-b" }, f.platform.cookie),
    ]);
    const responses = results.filter((result): result is PromiseFulfilledResult<Response> => result.status === "fulfilled").map((result) => result.value);
    expect(responses).toHaveLength(2); expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(responses.filter((response) => response.body.idempotent === false)).toHaveLength(1);
    expect(await prisma.supplierLedgerEntry.count({ where: { supplierId: f.supplierId, type: SupplierLedgerEntryType.SETTLEMENT_DEBIT, referenceId: created.body.id } })).toBe(1);
    const settlement = await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(settlement.status).toBe("PAID"); expect(settlement.markedPaidByUserId).toBe(f.platform.id); expect(settlement.markedPaidAt).toBeTruthy();
    const balance = await prisma.supplierLedgerEntry.aggregate({ where: { supplierId: f.supplierId, currencyCode: "USD" }, _sum: { amountSigned: true } });
    expect(balance._sum.amountSigned!.toFixed(2)).toBe("0.00");
  });

  it("enforces refund, finance, return, and warranty privacy at their HTTP boundaries", async () => {
    const a = await fixture("privacy-a"); const b = await fixture("privacy-b");
    const requested = await http("POST", `/customer/orders/${a.orderId}/refund-requests`, { reasonCode: "DAMAGED", items: [{ orderItemId: a.orderItemId, quantity: 1 }] }, a.customer.cookie);
    expect(requested.status).toBe(201);
    expect((await http("GET", `/customer/orders/${a.orderId}/refund-requests`, undefined, b.customer.cookie)).status).toBe(404);
    expect((await http("POST", `/platform/refund-requests/${requested.body.id}/approve`, undefined, a.owner.cookie)).status).toBe(403);
    const reader = await platformWith("refund-reader", ["platform.refunds.read"]);
    const reviewer = await platformWith("refund-reviewer", ["platform.refunds.review"]);
    expect((await http("GET", "/platform/refund-requests", undefined, reader.cookie)).status).toBe(200);
    expect((await http("POST", `/platform/refund-requests/${requested.body.id}/approve`, undefined, reader.cookie)).status).toBe(403);
    expect((await http("GET", "/platform/refund-requests", undefined, reviewer.cookie)).status).toBe(403);
    expect((await http("POST", `/platform/refund-requests/${requested.body.id}/approve`, undefined, reviewer.cookie)).status).toBe(201);
    const returnA = await http("POST", `/customer/orders/${a.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: a.orderItemId, quantity: 1 }] }, a.customer.cookie);
    const warrantyA = await http("POST", "/customer/warranties", { orderItemId: a.orderItemId, issueDescription: "defect" }, a.customer.cookie);
    expect(returnA.status).toBe(201); expect(warrantyA.status).toBe(201);
    expect((await http("GET", `/organizations/${b.organizationId}/returns/${returnA.body.id}`, undefined, b.owner.cookie)).status).toBe(404);
    expect((await http("GET", `/organizations/${b.organizationId}/warranties`, undefined, b.owner.cookie)).body.some((row: { id: string }) => row.id === warrantyA.body.id)).toBe(false);
    expect((await http("GET", `/organizations/${b.organizationId}/finance/balance`, undefined, a.owner.cookie)).status).toBe(403);
    expect((await http("GET", `/platform/finance/suppliers/${a.supplierId}/balance`, undefined, a.owner.cookie)).status).toBe(403);
    const financeReader = await platformWith("finance-reader", ["platform.finance.read"]);
    expect((await http("GET", `/platform/finance/suppliers/${a.supplierId}/balance`, undefined, financeReader.cookie)).status).toBe(200);
    expect((await http("POST", `/platform/suppliers/${a.supplierId}/settlements`, { currencyCode: "USD" }, financeReader.cookie)).status).toBe(403);
  });

  it("enforces member, suspended, and customer-minimal return and warranty projections", async () => {
    const a = await fixture("mproj-a"); const b = await fixture("mproj-b");
    const returned = await http("POST", `/customer/orders/${a.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: a.orderItemId, quantity: 1 }] }, a.customer.cookie);
    const claimA = await http("POST", "/customer/warranties", { orderItemId: a.orderItemId, issueDescription: "defect" }, a.customer.cookie);
    const claimB = await http("POST", "/customer/warranties", { orderItemId: b.orderItemId, issueDescription: "defect" }, b.customer.cookie);
    expect(returned.status).toBe(201); expect(claimA.status).toBe(201); expect(claimB.status).toBe(201);
    const { user: member, membership } = await supplierMember(a, "member-projection-member");
    expect((await http("GET", `/organizations/${a.organizationId}/returns`, undefined, member.cookie)).status).toBe(200);
    const supplierReturn = await http("GET", `/organizations/${a.organizationId}/returns/${returned.body.id}`, undefined, member.cookie);
    expect(supplierReturn.status).toBe(200); expect(supplierReturn.body.items).toHaveLength(1);
    expect(JSON.stringify(supplierReturn.body)).not.toMatch(/credential|password|payment|provider|address|commission|internalNote/i);
    expect((await http("POST", `/platform/returns/${returned.body.id}/approve`, {}, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${a.organizationId}/warranties`, undefined, member.cookie)).body.map((row: { id: string }) => row.id)).toContain(claimA.body.id);
    expect((await http("POST", `/platform/warranties/${claimA.body.id}/under-review`, {}, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${b.organizationId}/warranties`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", "/customer/warranties", undefined, a.customer.cookie)).body.map((row: { id: string }) => row.id)).not.toContain(claimB.body.id);
    expect((await http("POST", `/platform/warranties/${claimB.body.id}/under-review`, {}, a.customer.cookie)).status).toBe(403);
    const customerReturn = await http("GET", `/customer/returns/${returned.body.id}`, undefined, a.customer.cookie);
    expect(customerReturn.status).toBe(200); expect(JSON.stringify(customerReturn.body)).not.toMatch(/internalNote|commission|provider|credential|password/i);
    await prisma.organizationMembership.update({ where: { id: membership.id }, data: { status: MembershipStatus.SUSPENDED } });
    expect((await http("GET", `/organizations/${a.organizationId}/returns`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${a.organizationId}/returns/${returned.body.id}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${a.organizationId}/warranties`, undefined, member.cookie)).status).toBe(403);
    expect((await http("POST", `/platform/warranties/${claimA.body.id}/under-review`, {}, member.cookie)).status).toBe(403);
  });

  it("projects a shared multi-supplier return item-by-item without truncating customer or platform views", async () => {
    const a = await fixture("multi-return", 1); const b = await addSupplierItemToOrder(a, "multi-return-b");
    const created = await http("POST", `/customer/orders/${a.orderId}/returns`, { reasonCode: "DAMAGED", items: [{ orderItemId: a.orderItemId, quantity: 1 }, { orderItemId: b.orderItemId, quantity: 1 }] }, a.customer.cookie);
    expect(created.status).toBe(201); expect(created.body.items).toHaveLength(2);
    const customer = await http("GET", `/customer/returns/${created.body.id}`, undefined, a.customer.cookie);
    const platform = await http("GET", `/platform/returns/${created.body.id}`, undefined, a.platform.cookie);
    expect(customer.body.items).toHaveLength(2); expect(platform.body.items).toHaveLength(2);
    const supplierAList = await http("GET", `/organizations/${a.organizationId}/returns`, undefined, a.owner.cookie);
    const supplierADetail = await http("GET", `/organizations/${a.organizationId}/returns/${created.body.id}`, undefined, a.owner.cookie);
    const supplierBList = await http("GET", `/organizations/${b.organizationId}/returns`, undefined, b.owner.cookie);
    const supplierBDetail = await http("GET", `/organizations/${b.organizationId}/returns/${created.body.id}`, undefined, b.owner.cookie);
    for (const response of [supplierAList, supplierADetail, supplierBList, supplierBDetail]) expect(response.status).toBe(200);
    expect(supplierAList.body.find((row: { id: string }) => row.id === created.body.id).items.map((item: { orderItemId: string }) => item.orderItemId)).toEqual([a.orderItemId]);
    expect(supplierADetail.body.items.map((item: { orderItemId: string }) => item.orderItemId)).toEqual([a.orderItemId]);
    expect(supplierBList.body.find((row: { id: string }) => row.id === created.body.id).items.map((item: { orderItemId: string }) => item.orderItemId)).toEqual([b.orderItemId]);
    expect(supplierBDetail.body.items.map((item: { orderItemId: string }) => item.orderItemId)).toEqual([b.orderItemId]);
    expect(JSON.stringify(supplierADetail.body)).not.toContain(b.productName); expect(JSON.stringify(supplierBDetail.body)).not.toContain("multi-return product");
    expect((await http("POST", `/platform/returns/${created.body.id}/approve`, {}, a.owner.cookie)).status).toBe(403);
  });

  it("resolves a warranty refund once across retries and concurrent HTTP requests", async () => {
    const f = await fixture("warranty-refund", 1);
    const claim = await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "refund defect" }, f.customer.cookie); expect(claim.status).toBe(201);
    for (const step of ["under-review", "approve", "in-service"]) expect((await http("POST", `/platform/warranties/${claim.body.id}/${step}`, {}, f.platform.cookie)).status).toBe(201);
    const results = await Promise.all([http("POST", `/platform/warranties/${claim.body.id}/resolve`, { resolution: "REFUND", reason: "first" }, f.platform.cookie), http("POST", `/platform/warranties/${claim.body.id}/resolve`, { resolution: "REFUND", reason: "retry" }, f.platform.cookie)]);
    expect(results.every((response) => response.status === 201)).toBe(true); expect(results.filter((response) => response.body.idempotent === false)).toHaveLength(1);
    const warranty = await prisma.warrantyClaim.findUniqueOrThrow({ where: { id: claim.body.id } }); expect(warranty.resolutionRefundRequestId).toBeTruthy();
    expect(await prisma.refundRequest.count({ where: { id: warranty.resolutionRefundRequestId! } })).toBe(1);
    expect(await prisma.refundRequestItem.count({ where: { refundRequestId: warranty.resolutionRefundRequestId! } })).toBe(1);
    expect(await prisma.warrantyStatusHistory.count({ where: { warrantyClaimId: claim.body.id, newStatus: "RESOLVED" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { actorUserId: f.platform.id, action: "WARRANTY_RESOLVED", entityId: claim.body.id } })).toBe(1);
    await prisma.commissionRecord.create({ data: { orderItemId: f.orderItemId, supplierId: f.supplierId, supplierOrderId: f.supplierOrderId, grossAmount: new Prisma.Decimal("10.00"), commissionRate: new Prisma.Decimal("0.100000"), commissionAmount: new Prisma.Decimal("1.00"), supplierNetAmount: new Prisma.Decimal("9.00"), currencyCode: "USD", earnedAt: new Date() } });
    const approved = await http("POST", `/platform/refund-requests/${warranty.resolutionRefundRequestId}/approve`, undefined, f.platform.cookie); expect(approved.status).toBe(201);
    expect((await http("POST", `/platform/refunds/${approved.body.refund.id}/execute`, undefined, f.platform.cookie)).status).toBe(201);
    expect(await prisma.refund.count({ where: { refundRequestId: warranty.resolutionRefundRequestId! } })).toBe(1);
    expect(refundCreates.mock.calls.filter((call) => call[0].internalReference === approved.body.refund.providerReference)).toHaveLength(1);
    expect(await prisma.supplierLedgerEntry.count({ where: { supplierId: f.supplierId, type: SupplierLedgerEntryType.REFUND_DEBIT, referenceId: { startsWith: `${approved.body.refund.id}:` } } })).toBe(1);
  });

  it("proves warranty eligibility boundaries and the complete platform lifecycle", async () => {
    const f = await fixture("warb"); const now = new Date("2040-02-01T00:00:00.000Z"); const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now.getTime());
    try {
      await prisma.orderStatusHistory.updateMany({ where: { orderId: f.orderId, newStatus: "DELIVERED" }, data: { createdAt: new Date(now.getTime() - 30 * 86_400_000) } });
      expect((await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "final boundary" }, f.customer.cookie)).status).toBe(201);
      nowSpy.mockReturnValue(now.getTime() + 1);
      expect((await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "first invalid" }, f.customer.cookie)).status).toBe(409);
      await prisma.orderItem.update({ where: { id: f.orderItemId }, data: { warrantyDaysSnapshot: null } });
      expect((await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "null" }, f.customer.cookie)).status).toBe(409);
      await prisma.orderItem.update({ where: { id: f.orderItemId }, data: { warrantyDaysSnapshot: 0 } });
      expect((await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "zero" }, f.customer.cookie)).status).toBe(409);
      await prisma.orderItem.update({ where: { id: f.orderItemId }, data: { warrantyDaysSnapshot: 30 } });
      await prisma.order.update({ where: { id: f.orderId }, data: { createdAt: new Date("2000-01-01") } }); await prisma.payment.update({ where: { id: f.paymentId }, data: { succeededAt: new Date("2000-01-01") } });
      await prisma.orderStatusHistory.updateMany({ where: { orderId: f.orderId, newStatus: "DELIVERED" }, data: { createdAt: now } });
      await prisma.supplierListing.update({ where: { id: (await prisma.orderItem.findUniqueOrThrow({ where: { id: f.orderItemId } })).supplierListingId }, data: { warrantyDays: 0 } });
      const immutable = await http("POST", "/customer/warranties", { orderItemId: f.orderItemId, issueDescription: "snapshot wins" }, f.customer.cookie); expect(immutable.status).toBe(201);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/approve`, {}, f.platform.cookie)).status).toBe(409);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/under-review`, { reason: "review" }, f.platform.cookie)).status).toBe(201);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/resolve`, { resolution: "NO_FAULT_FOUND", reason: "recorded" }, f.platform.cookie)).status).toBe(409);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/approve`, { reason: "approve" }, f.platform.cookie)).status).toBe(201);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/in-service`, { reason: "service" }, f.platform.cookie)).status).toBe(201);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/resolve`, { resolution: "NO_FAULT_FOUND", reason: "resolve" }, f.platform.cookie)).status).toBe(201);
      expect((await http("POST", `/platform/warranties/${immutable.body.id}/under-review`, {}, f.platform.cookie)).status).toBe(409);
      expect(await prisma.warrantyStatusHistory.findMany({ where: { warrantyClaimId: immutable.body.id }, orderBy: { createdAt: "asc" } })).toEqual(expect.arrayContaining([expect.objectContaining({ previousStatus: null, newStatus: "SUBMITTED", actorUserId: f.customer.id }), expect.objectContaining({ previousStatus: "UNDER_REVIEW", newStatus: "APPROVED", actorUserId: f.platform.id }), expect.objectContaining({ previousStatus: "IN_SERVICE", newStatus: "RESOLVED", actorUserId: f.platform.id })]));
    } finally { nowSpy.mockRestore(); }
  });

  it("uses Decimal half-up commission economics and settlement eligibility without client amounts", async () => {
    const finance = app.get(FinancePostingService);
    const cases = [{ gross: "100.00", rate: "0.10", commission: "10.00", net: "90.00" }, { gross: "0.05", rate: "0.10", commission: "0.01", net: "0.04" }, { gross: "0.04", rate: "0.10", commission: "0.00", net: "0.04" }, { gross: "99.99", rate: "0.10", commission: "10.00", net: "89.99" }, { gross: "10.00", rate: "0", commission: "0.00", net: "10.00" }, { gross: "10.00", rate: "1", commission: "10.00", net: "0.00" }, { gross: "0.01", rate: "0.10", commission: "0.00", net: "0.01" }, { gross: "9999999999999999.99", rate: "0.10", commission: "1000000000000000.00", net: "8999999999999999.99" }];
    for (const [index, testCase] of cases.entries()) {
      const f = await fixture(`decimal-${index}`, 1); const earnedAt = new Date("2041-01-01T00:00:00.000Z");
      await prisma.orderItem.update({ where: { id: f.orderItemId }, data: { unitPrice: new Prisma.Decimal(testCase.gross), lineTotal: new Prisma.Decimal(testCase.gross) } });
      await prisma.supplierCommissionRate.create({ data: { supplierId: f.supplierId, rate: new Prisma.Decimal(testCase.rate), effectiveFrom: new Date("2040-01-01") } });
      await prisma.$transaction((tx) => finance.postCommissions(tx, f.supplierOrderId, earnedAt));
      const record = await prisma.commissionRecord.findUniqueOrThrow({ where: { orderItemId: f.orderItemId } }); expect(record.commissionAmount.toFixed(2)).toBe(testCase.commission); expect(record.supplierNetAmount.toFixed(2)).toBe(testCase.net);
    }
    const f = await fixture("sedges", 1); const platform = f.platform;
    await prisma.supplierLedgerEntry.createMany({ data: [{ supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("10.00"), referenceType: "TEST", referenceId: `${prefix}-usd` }, { supplierId: f.supplierId, currencyCode: "KES", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("20.00"), referenceType: "TEST", referenceId: `${prefix}-kes` }] });
    expect((await http("POST", `/platform/suppliers/${f.supplierId}/settlements`, { currencyCode: "USD", netAmount: "999999", supplierId: "00000000-0000-0000-0000-000000000001" }, platform.cookie)).status).toBe(400);
    const usd = await http("POST", `/platform/suppliers/${f.supplierId}/settlements`, { currencyCode: "USD" }, platform.cookie); expect(usd.status).toBe(201); expect(usd.body.netAmount).toBe("10.00");
    expect((await prisma.supplierSettlementItem.findMany({ where: { settlementId: usd.body.id }, include: { ledgerEntry: true } })).every((row) => row.ledgerEntry.currencyCode === "USD")).toBe(true);
    expect((await http("POST", `/platform/settlements/${usd.body.id}/mark-paid`, { externalReference: "too-early" }, platform.cookie)).status).toBe(409);
    expect((await http("POST", `/platform/settlements/${usd.body.id}/approve`, undefined, platform.cookie)).status).toBe(201);
    // Whitespace-only references cannot stand in for real external payout evidence.
    expect((await http("POST", `/platform/settlements/${usd.body.id}/mark-paid`, { externalReference: "    " }, platform.cookie)).status).toBe(400);
    expect((await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: usd.body.id } })).status).toBe("APPROVED");
    expect((await http("POST", `/platform/settlements/${usd.body.id}/mark-paid`, { externalReference: "  settled-usd  " }, platform.cookie)).status).toBe(201);
    expect((await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: usd.body.id } })).externalReference).toBe("settled-usd");
    expect((await http("POST", `/platform/settlements/${usd.body.id}/approve`, undefined, platform.cookie)).body.idempotent).toBe(true);
    await prisma.supplierLedgerEntry.createMany({ data: [{ supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.MANUAL_ADJUSTMENT, amountSigned: new Prisma.Decimal("25.00"), referenceType: "TEST", referenceId: `${prefix}-after` }, { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: new Prisma.Decimal("-10.00"), referenceType: "TEST", referenceId: `${prefix}-refund-after` }] });
    const balances = await (await http("GET", `/platform/finance/suppliers/${f.supplierId}/balance`, undefined, platform.cookie)).body.balances; expect(balances).toEqual(expect.arrayContaining([{ currencyCode: "USD", balance: "15.00" }, { currencyCode: "KES", balance: "20.00" }]));
    await expect(prisma.supplierSettlementItem.create({ data: { settlementId: usd.body.id, ledgerEntryId: (await prisma.supplierSettlementItem.findFirstOrThrow({ where: { settlementId: usd.body.id } })).ledgerEntryId, amount: new Prisma.Decimal("10.00") } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("preserves settlement currency, non-positive, and post-paid append-only accounting boundaries", async () => {
    const zero = await fixture("settlement-zero", 1);
    await prisma.supplierLedgerEntry.createMany({ data: [{ supplierId: zero.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("10.00"), referenceType: "TEST", referenceId: `${prefix}-zero-plus` }, { supplierId: zero.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: new Prisma.Decimal("-10.00"), referenceType: "TEST", referenceId: `${prefix}-zero-minus` }] });
    expect((await http("POST", `/platform/suppliers/${zero.supplierId}/settlements`, { currencyCode: "USD" }, zero.platform.cookie)).status).toBe(409);
    const negative = await fixture("stl-neg", 1);
    await prisma.supplierLedgerEntry.create({ data: { supplierId: negative.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: new Prisma.Decimal("-10.00"), referenceType: "TEST", referenceId: `${prefix}-negative` } });
    expect((await http("POST", `/platform/suppliers/${negative.supplierId}/settlements`, { currencyCode: "USD" }, negative.platform.cookie)).status).toBe(409);
    const currency = await fixture("stl-currency", 1);
    await prisma.supplierLedgerEntry.createMany({ data: [{ supplierId: currency.supplierId, currencyCode: "KES", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("100.00"), referenceType: "TEST", referenceId: `${prefix}-edge-kes` }, { supplierId: currency.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("50.00"), referenceType: "TEST", referenceId: `${prefix}-edge-usd` }] });
    const kes = await http("POST", `/platform/suppliers/${currency.supplierId}/settlements`, { currencyCode: "KES" }, currency.platform.cookie); expect(kes.status).toBe(201); expect(kes.body.netAmount).toBe("100.00");
    expect((await prisma.supplierSettlementItem.findMany({ where: { settlementId: kes.body.id }, include: { ledgerEntry: true } })).every((item) => item.ledgerEntry.currencyCode === "KES")).toBe(true);
    expect((await http("POST", `/platform/settlements/${kes.body.id}/mark-paid`, { externalReference: "draft" }, currency.platform.cookie)).status).toBe(409);
    expect((await http("POST", `/platform/settlements/${kes.body.id}/approve`, undefined, currency.platform.cookie)).status).toBe(201);
    expect((await http("POST", `/platform/settlements/${kes.body.id}/mark-paid`, { externalReference: "kes-paid" }, currency.platform.cookie)).status).toBe(201);
    await prisma.supplierLedgerEntry.create({ data: { supplierId: currency.supplierId, currencyCode: "KES", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("25.00"), referenceType: "TEST", referenceId: `${prefix}-later-earning` } });
    const currencyBalance = await http("GET", `/platform/finance/suppliers/${currency.supplierId}/balance`, undefined, currency.platform.cookie);
    expect(currencyBalance.body.balances).toEqual(expect.arrayContaining([{ currencyCode: "KES", balance: "25.00" }, { currencyCode: "USD", balance: "50.00" }]));
    expect((await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: kes.body.id } })).netAmount.toFixed(2)).toBe("100.00");
    const carry = await fixture("stl-carry", 1);
    await prisma.supplierLedgerEntry.create({ data: { supplierId: carry.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: new Prisma.Decimal("90.00"), referenceType: "TEST", referenceId: `${prefix}-carry-earning` } });
    const paid = await http("POST", `/platform/suppliers/${carry.supplierId}/settlements`, { currencyCode: "USD" }, carry.platform.cookie); expect(paid.status).toBe(201);
    await http("POST", `/platform/settlements/${paid.body.id}/approve`, undefined, carry.platform.cookie); await http("POST", `/platform/settlements/${paid.body.id}/mark-paid`, { externalReference: "carry-paid" }, carry.platform.cookie);
    await prisma.supplierLedgerEntry.create({ data: { supplierId: carry.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.REFUND_DEBIT, amountSigned: new Prisma.Decimal("-20.00"), referenceType: "TEST", referenceId: `${prefix}-carry-refund` } });
    expect((await http("GET", `/platform/finance/suppliers/${carry.supplierId}/balance`, undefined, carry.platform.cookie)).body.balances).toContainEqual({ currencyCode: "USD", balance: "-20.00" });
    expect((await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: paid.body.id } })).netAmount.toFixed(2)).toBe("90.00");
    expect((await http("POST", `/platform/finance/suppliers/${carry.supplierId}/adjustments`, { currencyCode: "USD", amount: "15", reason: "post-paid credit" }, carry.platform.cookie)).status).toBe(201);
    expect((await http("POST", `/platform/finance/suppliers/${carry.supplierId}/adjustments`, { currencyCode: "USD", amount: "-5", reason: "post-paid debit" }, carry.platform.cookie)).status).toBe(201);
    expect((await http("GET", `/platform/finance/suppliers/${carry.supplierId}/balance`, undefined, carry.platform.cookie)).body.balances).toContainEqual({ currencyCode: "USD", balance: "-10.00" });
    const before = await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: paid.body.id } });
    const repeatedPaid = await http("POST", `/platform/settlements/${paid.body.id}/mark-paid`, { externalReference: "cannot-rewrite" }, carry.platform.cookie); expect(repeatedPaid.status).toBe(201); expect(repeatedPaid.body.idempotent).toBe(true);
    const after = await prisma.supplierSettlement.findUniqueOrThrow({ where: { id: paid.body.id } }); expect(after.externalReference).toBe(before.externalReference); expect(after.netAmount.toFixed(2)).toBe("90.00");
  });

  it("has database-enforced financial uniqueness, range, nonzero, and foreign-key constraints", async () => {
    const f = await fixture("constraints", 1);
    const commission = { orderItemId: f.orderItemId, supplierId: f.supplierId, supplierOrderId: f.supplierOrderId, grossAmount: new Prisma.Decimal("10.00"), commissionRate: new Prisma.Decimal("0.100000"), commissionAmount: new Prisma.Decimal("1.00"), supplierNetAmount: new Prisma.Decimal("9.00"), currencyCode: "USD", earnedAt: new Date() };
    await prisma.commissionRecord.create({ data: commission });
    await expect(prisma.commissionRecord.create({ data: commission })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.commissionRecord.create({ data: { ...commission, orderItemId: "00000000-0000-0000-0000-000000000001", commissionRate: new Prisma.Decimal("1.1") } })).rejects.toThrow("CommissionRecord_rate_range");
    await expect(prisma.supplierLedgerEntry.create({ data: { supplierId: f.supplierId, currencyCode: "USD", type: SupplierLedgerEntryType.MANUAL_ADJUSTMENT, amountSigned: new Prisma.Decimal(0), referenceType: "TEST", referenceId: `zero-${prefix}` } })).rejects.toThrow("SupplierLedgerEntry_amount_nonzero");
    await expect(prisma.supplierLedgerEntry.create({ data: { supplierId: "00000000-0000-0000-0000-000000000001", currencyCode: "USD", type: SupplierLedgerEntryType.MANUAL_ADJUSTMENT, amountSigned: new Prisma.Decimal(1), referenceType: "TEST", referenceId: `fk-${prefix}` } })).rejects.toMatchObject({ code: "P2003" });
  });
});
