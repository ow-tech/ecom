import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Prisma, ProductStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Test responses intentionally span many unrelated endpoint shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = { status: number; body: Record<string, any>; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };
type ListingFixture = { organizationId: string; supplierId: string; productId: string; listingId: string; itemIds: string[] };

const prefix = `commerce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("customer cart checkout and order core integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const email = (label: string) => `${prefix}-${label}@example.test`;
  const slug = (label: string) => `${prefix}-${label}`;

  async function http(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
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
    const response = await http("POST", "/auth/register", { email: email(label), password, displayName: label });
    expect(response.status).toBe(201);
    return { id: response.body.id, cookie: (response.headers["set-cookie"] as string[])[0].split(";", 1)[0] };
  }

  async function address(account: Account, label: string) {
    const response = await http("POST", "/customer/addresses", { label, recipientName: `${label} Recipient`, phone: "+254700000000", countryCode: "ke", region: "Nairobi", city: "Nairobi", isDefault: true }, account.cookie);
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function listing(owner: Account, label: string, price = "10.00", currencyCode = "USD", stocks = [5]): Promise<ListingFixture> {
    const organization = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    expect(organization.status).toBe(201);
    const supplier = await prisma.supplier.create({ data: { organizationId: organization.body.id, displayName: `${label} supplier`, slug: slug(`${label}-supplier`), status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: `${label} category`, slug: slug(`${label}-category`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${label} product`, slug: slug(`${label}-product`), status: ProductStatus.ACTIVE } });
    const offer = await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, price: new Prisma.Decimal(price), currencyCode, status: SupplierListingStatus.ACTIVE } });
    const itemIds: string[] = [];
    for (const [index, onHand] of stocks.entries()) {
      const location = await prisma.inventoryLocation.create({ data: { supplierId: supplier.id, name: `${label} location ${index}`, code: `${label}-${index}`.slice(-80).toUpperCase() } });
      const item = await prisma.inventoryItem.create({ data: { supplierListingId: offer.id, inventoryLocationId: location.id, onHand } });
      itemIds.push(item.id);
    }
    return { organizationId: organization.body.id, supplierId: supplier.id, productId: product.id, listingId: offer.id, itemIds };
  }

  async function add(account: Account, listingId: string, quantity: number) { return http("POST", "/customer/cart/items", { supplierListingId: listingId, quantity }, account.cookie); }
  async function checkout(account: Account, addressId: string, key: string) { return http("POST", "/customer/checkout/prepare", { fulfillmentMethod: "DELIVERY", addressId }, account.cookie, { "idempotency-key": key }); }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    const zone = await prisma.deliveryZone.create({ data: { name: `${prefix} automatic delivery`, countryCode: "KE", region: "Nairobi", city: "Nairobi" } });
    await prisma.deliveryRate.create({ data: { deliveryZoneId: zone.id, name: "Legacy zero-rate test delivery", amount: new Prisma.Decimal(0), currencyCode: "USD" } });
  });

  afterAll(async () => {
    if (prisma) {
      const profiles = await prisma.customerProfile.findMany({ where: { user: { emailNormalized: { startsWith: prefix } } }, select: { id: true } });
      const profileIds = profiles.map(({ id }) => id);
      const orders = await prisma.order.findMany({ where: { customerProfileId: { in: profileIds } }, select: { id: true } });
      const orderIds = orders.map(({ id }) => id);
      await prisma.deliveryRate.deleteMany({ where: { deliveryZone: { name: { startsWith: prefix } } } });
      await prisma.deliveryZone.deleteMany({ where: { name: { startsWith: prefix } } });
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

  it("owns lazy profiles and addresses, replaces defaults, and protects both database singletons", async () => {
    const customer = await account("customer-profile");
    const foreign = await account("customer-foreign");
    const [first, second] = await Promise.all([http("GET", "/customer/profile", undefined, customer.cookie), http("GET", "/customer/profile", undefined, customer.cookie)]);
    expect(first.status).toBe(200); expect(second.status).toBe(200); expect(first.body.id).toBe(second.body.id);
    expect(await prisma.customerProfile.count({ where: { userId: customer.id } })).toBe(1);
    expect((await http("PATCH", "/customer/profile", { firstName: "Ada", userId: foreign.id }, customer.cookie)).status).toBe(400);
    const firstAddress = await http("POST", "/customer/addresses", { label: "Home", recipientName: "Home Recipient", phone: "+254700000000", alternativePhone: "+254711111111", countryCode: "ke", region: "Nairobi", city: "Nairobi", estate: "Westlands", street: "Waiyaki Way", building: "Commerce House", houseNumber: "4B", landmark: "Near the mall", deliveryNotes: "Call reception" }, customer.cookie);
    expect(firstAddress.status).toBe(201); expect(firstAddress.body.isDefault).toBe(true);
    const a = firstAddress.body.id as string;
    const secondAddress = await http("POST", "/customer/addresses", { label: "Office", recipientName: "Office Recipient", phone: "+254700000001", countryCode: "KE", region: "Nairobi", city: "Nairobi" }, customer.cookie);
    expect(secondAddress.body.isDefault).toBe(false);
    const b = secondAddress.body.id as string;
    const updated = await http("PATCH", `/customer/addresses/${b}`, { estate: "Upper Hill", deliveryNotes: "Use loading bay" }, customer.cookie);
    expect(updated.body).toEqual(expect.objectContaining({ estate: "Upper Hill", deliveryNotes: "Use loading bay" }));
    expect((await http("POST", `/customer/addresses/${b}/default`, undefined, customer.cookie)).body.isDefault).toBe(true);
    expect(await prisma.customerAddress.count({ where: { customerProfileId: first.body.id, isDefault: true } })).toBe(1);
    expect((await http("GET", `/customer/addresses/${a}`, undefined, foreign.cookie)).status).toBe(404);
    expect((await http("PATCH", `/customer/addresses/${a}`, { city: "Elsewhere" }, foreign.cookie)).status).toBe(404);
    expect((await http("POST", `/customer/addresses/${a}/default`, undefined, foreign.cookie)).status).toBe(404);
    expect((await http("DELETE", `/customer/addresses/${a}`, undefined, foreign.cookie)).status).toBe(404);
    expect((await http("GET", `/customer/addresses/${b}`, undefined, customer.cookie)).status).toBe(200);
    expect((await http("DELETE", `/customer/addresses/${b}`, undefined, customer.cookie)).body).toEqual({ deleted: true, defaultAddressId: a });
    expect((await http("GET", `/customer/addresses/${a}`, undefined, customer.cookie)).body.isDefault).toBe(true);
    await expect(prisma.customerAddress.create({ data: { customerProfileId: first.body.id, recipientName: "Duplicate", phone: "1", countryCode: "KE", region: "Nairobi", city: "Nairobi", isDefault: true } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("keeps a singleton cart server-priced, advisory-only, currency-safe and ownership-scoped", async () => {
    const customer = await account("cart-customer");
    const foreign = await account("cart-foreign");
    const owner = await account("cart-owner");
    const usd = await listing(owner, "cart-usd", "12.50", "USD", [4]);
    const eur = await listing(owner, "cart-eur", "8.00", "EUR", [4]);
    const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: usd.itemIds[0] } });
    const carts = await Promise.all([http("GET", "/customer/cart", undefined, customer.cookie), http("GET", "/customer/cart", undefined, customer.cookie)]);
    expect(carts.every((response) => response.status === 200)).toBe(true);
    expect(await prisma.cart.count({ where: { customerProfile: { userId: customer.id }, status: "ACTIVE" } })).toBe(1);
    expect((await http("POST", "/customer/cart/items", { supplierListingId: usd.listingId, quantity: 1, unitPriceSnapshot: "0.01" }, customer.cookie)).status).toBe(400);
    expect((await add(customer, usd.listingId, 1)).status).toBe(201);
    const merged = await add(customer, usd.listingId, 2);
    expect(merged.body.items[0]).toEqual(expect.objectContaining({ quantity: 3, unitPriceSnapshot: "12.50", currentAvailability: 4 }));
    expect(merged.body.subtotal).toBe("37.50");
    expect((await add(customer, usd.listingId, 2)).body.code).toBe("INSUFFICIENT_STOCK");
    expect((await add(customer, eur.listingId, 1)).body.code).toBe("CART_CURRENCY_MISMATCH");
    expect((await add(customer, usd.listingId, 0)).status).toBe(400);
    await prisma.supplierListing.update({ where: { id: usd.listingId }, data: { status: SupplierListingStatus.INACTIVE } });
    expect((await http("PATCH", `/customer/cart/items/${merged.body.items[0].id}`, { quantity: 1 }, customer.cookie)).body.code).toBe("LISTING_UNAVAILABLE");
    await prisma.supplierListing.update({ where: { id: usd.listingId }, data: { status: SupplierListingStatus.ACTIVE } });
    const after = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: usd.itemIds[0] } });
    expect(after.reserved).toBe(before.reserved); expect(after.onHand).toBe(before.onHand);
    expect((await http("PATCH", `/customer/cart/items/${merged.body.items[0].id}`, { quantity: 1 }, foreign.cookie)).status).toBe(404);
  });

  it("re-rates the same selected address after its delivery fields are edited", async () => {
    const customer = await account("address-rerate-customer");
    const owner = await account("address-rerate-owner");
    const offer = await listing(owner, "address-rerate", "10.00", "USD", [2]);
    const firstZone = await prisma.deliveryZone.create({ data: { name: `${prefix} refresh one`, countryCode: "KE", region: "Refresh One", city: "Town One" } });
    const secondZone = await prisma.deliveryZone.create({ data: { name: `${prefix} refresh two`, countryCode: "KE", region: "Refresh Two", city: "Town Two" } });
    await prisma.deliveryRate.createMany({ data: [
      { deliveryZoneId: firstZone.id, name: "First address fee", amount: new Prisma.Decimal("4.00"), currencyCode: "USD" },
      { deliveryZoneId: secondZone.id, name: "Edited address fee", amount: new Prisma.Decimal("9.00"), currencyCode: "USD" },
    ] });
    await add(customer, offer.listingId, 1);
    const created = await http("POST", "/customer/addresses", { recipientName: "Quote Customer", phone: "+254700000000", countryCode: "KE", region: "Refresh One", city: "Town One" }, customer.cookie);
    const input = { fulfillmentMethod: "DELIVERY", addressId: created.body.id };
    expect((await http("POST", "/customer/checkout/preview", input, customer.cookie)).body).toEqual(expect.objectContaining({ deliveryFee: "4.00", total: "14.00" }));
    expect((await http("PATCH", `/customer/addresses/${created.body.id}`, { region: "Refresh Two", city: "Town Two" }, customer.cookie)).status).toBe(200);
    expect((await http("POST", "/customer/checkout/preview", input, customer.cookie)).body).toEqual(expect.objectContaining({ deliveryFee: "9.00", total: "19.00" }));
  });

  it("creates one multi-supplier order with deterministic multi-location ownership and same-key idempotency", async () => {
    const customer = await account("checkout-multi");
    const ownerA = await account("checkout-owner-a");
    const ownerB = await account("checkout-owner-b");
    const a = await listing(ownerA, "checkout-a", "10.00", "USD", [1, 2]);
    const b = await listing(ownerB, "checkout-b", "7.50", "USD", [2]);
    const addressId = await address(customer, "Checkout");
    expect((await add(customer, a.listingId, 3)).status).toBe(201);
    expect((await add(customer, b.listingId, 2)).status).toBe(201);
    const [one, two] = await Promise.all([checkout(customer, addressId, "multi-same-key"), checkout(customer, addressId, "multi-same-key")]);
    expect(one.status).toBe(201); expect(two.status).toBe(201); expect(one.body.orderId).toBe(two.body.orderId);
    expect(one.body).toEqual(expect.objectContaining({ subtotal: "45.00", total: "45.00", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", supplierOrderCount: 2 }));
    const order = await prisma.order.findUniqueOrThrow({ where: { id: one.body.orderId }, include: { items: true, supplierOrders: { include: { items: true } }, reservations: true, statusHistory: true, checkoutAttempt: true, deliveryAddress: true } });
    expect(order.items).toHaveLength(2); expect(order.supplierOrders).toHaveLength(2); expect(order.reservations).toHaveLength(3);
    expect(order.reservations.reduce((sum, row) => sum + row.quantity, 0)).toBe(5);
    expect(order.statusHistory.map((row) => row.newStatus)).toEqual(["PENDING_PAYMENT"]);
    expect(await prisma.order.count({ where: { checkoutAttempt: { customerProfileId: order.customerProfileId, idempotencyKey: "multi-same-key" } } })).toBe(1);
    expect(new Set(order.items.map((item) => item.supplierOrderId)).size).toBe(2);
    expect(order.deliveryAddress).toEqual(expect.objectContaining({ recipientName: "Checkout Recipient", city: "Nairobi" }));
    expect((await http("PATCH", `/customer/addresses/${addressId}`, { recipientName: "Changed Recipient", city: "Mombasa", deliveryNotes: "Changed after checkout" }, customer.cookie)).status).toBe(200);
    expect(await prisma.orderDeliveryAddress.findUniqueOrThrow({ where: { orderId: order.id } })).toEqual(expect.objectContaining({ recipientName: "Checkout Recipient", city: "Nairobi", deliveryNotes: null }));
    await prisma.product.update({ where: { id: a.productId }, data: { name: "Renamed after checkout" } });
    const detail = await http("GET", `/customer/orders/${order.id}`, undefined, customer.cookie);
    expect(detail.body.items.find((item: { productId: string }) => item.productId === a.productId).productNameSnapshot).not.toBe("Renamed after checkout");
    expect((await http("GET", `/customer/orders/${order.id}`, undefined, ownerA.cookie)).status).toBe(404);
    const supplierA = await http("GET", `/organizations/${a.organizationId}/supplier-orders`, undefined, ownerA.cookie);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(supplierA.status).toBe(200); expect(supplierA.body).toHaveLength(1); expect(supplierA.body[0].items.every((item: any) => item.supplierId === a.supplierId)).toBe(true);
    expect((await http("GET", `/organizations/${a.organizationId}/supplier-orders/${order.supplierOrders.find((so) => so.supplierId === b.supplierId)!.id}`, undefined, ownerA.cookie)).status).toBe(404);
  });

  it("rejects changed prices and rolls back every effect when a later line lacks stock", async () => {
    const customer = await account("checkout-failure");
    const owner = await account("checkout-failure-owner");
    const priced = await listing(owner, "checkout-price", "100.00", "USD", [1]);
    const addressId = await address(customer, "Failure");
    await add(customer, priced.listingId, 1);
    await prisma.supplierListing.update({ where: { id: priced.listingId }, data: { price: new Prisma.Decimal("120.00") } });
    const changed = await checkout(customer, addressId, "price-changed");
    expect(changed.status).toBe(409); expect(changed.body.code).toBe("PRICE_CHANGED");
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: priced.itemIds[0] } })).reserved).toBe(0);
    expect(await prisma.order.count({ where: { customerProfile: { userId: customer.id } } })).toBe(0);

    await prisma.supplierListing.update({ where: { id: priced.listingId }, data: { price: new Prisma.Decimal("100.00") } });
    const empty = await listing(owner, "checkout-empty", "5.00", "USD", [0]);
    await prisma.cartItem.create({ data: { cartId: (await prisma.cart.findFirstOrThrow({ where: { customerProfile: { userId: customer.id }, status: "ACTIVE" } })).id, supplierListingId: empty.listingId, quantity: 1, unitPriceSnapshot: new Prisma.Decimal("5.00"), currencyCode: "USD" } });
    const failed = await checkout(customer, addressId, "partial-failure");
    expect(failed.status).toBe(409); expect(failed.body.code).toBe("INSUFFICIENT_STOCK");
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: priced.itemIds[0] } })).reserved).toBe(0);
    expect(await prisma.inventoryReservation.count({ where: { checkoutAttempt: { customerProfile: { userId: customer.id } } } })).toBe(0);
    expect(await prisma.order.count({ where: { customerProfile: { userId: customer.id } } })).toBe(0);
  });

  it("allows exactly one customer to win a concurrent last-unit checkout", async () => {
    const owner = await account("race-owner");
    const a = await account("race-a"); const b = await account("race-b");
    const stock = await listing(owner, "race-stock", "3.00", "USD", [1]);
    const addressA = await address(a, "A"); const addressB = await address(b, "B");
    await add(a, stock.listingId, 1); await add(b, stock.listingId, 1);
    const responses = await Promise.all([checkout(a, addressA, "race-a-key"), checkout(b, addressB, "race-b-key")]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409 && response.body.code === "INSUFFICIENT_STOCK")).toHaveLength(1);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.itemIds[0] } });
    expect(item).toEqual(expect.objectContaining({ onHand: 1, reserved: 1 }));
    expect(await prisma.inventoryReservation.count({ where: { inventoryItemId: item.id, status: "ACTIVE" } })).toBe(1);
  });

  it("cancels an unpaid order once, releases owned stock once, and preserves history", async () => {
    const customer = await account("cancel-customer"); const owner = await account("cancel-owner");
    const stock = await listing(owner, "cancel-stock", "9.00", "USD", [2]);
    const addressId = await address(customer, "Cancel"); await add(customer, stock.listingId, 2);
    const created = await checkout(customer, addressId, "cancel-key"); expect(created.status).toBe(201);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.itemIds[0] } })).reserved).toBe(2);
    const first = await http("POST", `/customer/orders/${created.body.orderId}/cancel`, { reason: "Changed mind" }, customer.cookie);
    const second = await http("POST", `/customer/orders/${created.body.orderId}/cancel`, { reason: "Again" }, customer.cookie);
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(first.body.status).toBe("CANCELLED");
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.itemIds[0] } })).reserved).toBe(0);
    expect(await prisma.inventoryReservation.count({ where: { orderId: created.body.orderId, status: "RELEASED" } })).toBe(1);
    expect((await prisma.orderStatusHistory.findMany({ where: { orderId: created.body.orderId }, orderBy: { createdAt: "asc" } })).map((row) => row.newStatus)).toEqual(["PENDING_PAYMENT", "CANCELLED"]);
    expect(await prisma.orderItem.count({ where: { orderId: created.body.orderId } })).toBe(1);
    expect(await prisma.supplierOrder.count({ where: { orderId: created.body.orderId, status: "CANCELLED" } })).toBe(1);
  });
});
