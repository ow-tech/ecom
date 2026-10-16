import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MembershipStatus, Prisma, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { RbacService } from "../src/rbac/rbac.service";

type Response = { status: number; body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };
type StockFixture = { organizationId: string; supplierId: string; listingId: string; locationId: string };

const prefix = `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("inventory foundation integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rbac: RbacService;
  let baseUrl: string;

  const email = (label: string) => `${prefix}-${label}@example.test`;
  const slug = (label: string) => `${prefix}-${label}`;

  async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...(cookie ? { cookie } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) as Record<string, unknown> : {}, headers: response.headers });
        });
      });
      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  async function account(label: string): Promise<Account> {
    const response = await http("POST", "/auth/register", { email: email(label), password, displayName: label });
    expect(response.status).toBe(201);
    return { id: response.body.id as string, cookie: (response.headers["set-cookie"] as string[])[0].split(";", 1)[0] };
  }

  async function organization(owner: Account, label: string): Promise<string> {
    const response = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function membership(userId: string, organizationId: string, roleKey: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const row = await prisma.organizationMembership.create({ data: { userId, organizationId, status: MembershipStatus.ACTIVE } });
    await prisma.membershipRole.create({ data: { membershipId: row.id, roleId: role.id } });
  }

  async function fixture(owner: Account, label: string, code = "MAIN"): Promise<StockFixture> {
    const organizationId = await organization(owner, label);
    const supplier = await prisma.supplier.create({ data: { organizationId, displayName: `${label} supplier`, slug: slug(`${label}-supplier`), status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: `${label} category`, slug: slug(`${label}-category`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${label} product`, slug: slug(`${label}-product`) } });
    const listing = await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, price: new Prisma.Decimal("10.00"), currencyCode: "USD", status: SupplierListingStatus.ACTIVE } });
    const location = await http("POST", `/organizations/${organizationId}/inventory/locations`, { name: `${label} location`, code }, owner.cookie);
    expect(location.status).toBe(201);
    return { organizationId, supplierId: supplier.id, listingId: listing.id, locationId: location.body.id as string };
  }

  async function receive(owner: Account, stock: StockFixture, quantity: number): Promise<Response> {
    return http("POST", `/organizations/${stock.organizationId}/inventory/receive`, { supplierListingId: stock.listingId, inventoryLocationId: stock.locationId, quantity }, owner.cookie);
  }

  async function item(stock: StockFixture): Promise<{ id: string; onHand: number; reserved: number }> {
    return prisma.inventoryItem.findUniqueOrThrow({ where: { supplierListingId_inventoryLocationId: { supplierListingId: stock.listingId, inventoryLocationId: stock.locationId } } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    rbac = app.get(RbacService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.inventoryMovement.deleteMany({ where: { inventoryItem: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } } });
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

  it("keeps health available", async () => {
    expect(await http("GET", "/health")).toEqual(expect.objectContaining({ status: 200, body: { status: "ok" } }));
  });

  it("authorizes location management, scopes locations to suppliers, and retains inactive locations", async () => {
    const owner = await account("locations-owner");
    const admin = await account("locations-admin");
    const member = await account("locations-member");
    const foreignOwner = await account("locations-foreign");
    const stock = await fixture(owner, "locations-a", "MAIN");
    const foreign = await fixture(foreignOwner, "locations-b", "MAIN");
    await membership(admin.id, stock.organizationId, "organization.admin");
    await membership(member.id, stock.organizationId, "organization.member");

    const adminLocation = await http("POST", `/organizations/${stock.organizationId}/inventory/locations`, { name: "Admin location", code: "ADMIN" }, admin.cookie);
    expect(adminLocation.status).toBe(201);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/locations`, { name: "Duplicate", code: "MAIN" }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/locations`, { name: "Denied", code: "MEMBER" }, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${foreign.organizationId}/inventory/locations/${stock.locationId}`, undefined, foreignOwner.cookie)).status).toBe(404);
    expect((await http("PATCH", `/organizations/${foreign.organizationId}/inventory/locations/${stock.locationId}`, { status: "INACTIVE" }, foreignOwner.cookie)).status).toBe(404);

    const inactive = await http("PATCH", `/organizations/${stock.organizationId}/inventory/locations/${stock.locationId}`, { status: "INACTIVE" }, owner.cookie);
    expect(inactive).toEqual(expect.objectContaining({ status: 200, body: expect.objectContaining({ status: "INACTIVE" }) }));
    expect(await prisma.inventoryLocation.findUnique({ where: { id: stock.locationId } })).toEqual(expect.objectContaining({ status: "INACTIVE" }));
    expect((await http("GET", `/organizations/${stock.organizationId}/inventory/locations/${stock.locationId}`, undefined, owner.cookie)).status).toBe(200);
  });

  it("receives stock lazily and records physical movement with validated quantities", async () => {
    const owner = await account("receive-owner");
    const foreignOwner = await account("receive-foreign");
    const stock = await fixture(owner, "receive-a");
    const foreign = await fixture(foreignOwner, "receive-b");
    expect(await prisma.inventoryItem.findMany({ where: { supplierListingId: stock.listingId } })).toHaveLength(0);
    const first = await receive(owner, stock, 5);
    expect(first).toEqual(expect.objectContaining({ status: 201, body: expect.objectContaining({ onHand: 5, reserved: 0, available: 5 }) }));
    const second = await receive(owner, stock, 3);
    expect(second).toEqual(expect.objectContaining({ status: 201, body: expect.objectContaining({ onHand: 8, reserved: 0, available: 8 }) }));
    const stored = await item(stock);
    const movements = await prisma.inventoryMovement.findMany({ where: { inventoryItemId: stored.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((movement) => [movement.type, movement.quantity, movement.previousOnHand, movement.newOnHand])).toEqual([["STOCK_IN", 5, 0, 5], ["STOCK_IN", 3, 5, 8]]);
    expect((await receive(owner, stock, 0)).status).toBe(400);
    expect((await receive(owner, stock, -1)).status).toBe(400);
    expect((await http("POST", `/organizations/${foreign.organizationId}/inventory/receive`, { supplierListingId: stock.listingId, inventoryLocationId: foreign.locationId, quantity: 1 }, foreignOwner.cookie)).status).toBe(404);
  });

  it("removes and adjusts physical stock atomically without violating reservations", async () => {
    const owner = await account("physical-owner");
    const stock = await fixture(owner, "physical");
    await receive(owner, stock, 10);
    const stored = await item(stock);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 8 }, owner.cookie)).status).toBe(201);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: 3 }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: 0 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: -1 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/adjust`, { inventoryItemId: stored.id, quantity: 1 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/adjust`, { inventoryItemId: stored.id, quantity: 0, reason: "count" }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/adjust`, { inventoryItemId: stored.id, quantity: -3, reason: "damage" }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/adjust`, { inventoryItemId: stored.id, quantity: 2, reason: "count" }, owner.cookie)).status).toBe(201);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: 2 }, owner.cookie)).status).toBe(201);
    const physical = await item(stock);
    expect(physical).toEqual(expect.objectContaining({ onHand: 10, reserved: 8 }));
    const movements = await prisma.inventoryMovement.findMany({ where: { inventoryItemId: stored.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((movement) => movement.type)).toEqual(["STOCK_IN", "ADJUSTMENT_IN", "STOCK_OUT"]);
    expect(movements.map((movement) => movement.quantity)).toEqual([10, 2, 2]);
  });

  it("reserves, releases, and consumes through their canonical state transitions", async () => {
    const owner = await account("reservation-owner");
    const stock = await fixture(owner, "reservation");
    await receive(owner, stock, 5);
    const stored = await item(stock);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 0 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: -1 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 4 }, owner.cookie)).body).toEqual(expect.objectContaining({ onHand: 5, reserved: 4, available: 1 }));
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 2 }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 1 }, owner.cookie)).body).toEqual(expect.objectContaining({ onHand: 5, reserved: 5, available: 0 }));
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/release`, { quantity: 0 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/release`, { quantity: -1 }, owner.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/release`, { quantity: 6 }, owner.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/release`, { quantity: 2 }, owner.cookie)).body).toEqual(expect.objectContaining({ onHand: 5, reserved: 3, available: 2 }));
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/consume`, { quantity: 4 }, owner.cookie)).status).toBe(409);
    const consumed = await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/consume`, { quantity: 3, referenceType: "ORDER", referenceId: "proof" }, owner.cookie);
    expect(consumed).toEqual(expect.objectContaining({ status: 201, body: expect.objectContaining({ onHand: 2, reserved: 0, available: 2 }) }));
    const movements = await prisma.inventoryMovement.findMany({ where: { inventoryItemId: stored.id }, orderBy: { createdAt: "asc" } });
    expect(movements).toHaveLength(2);
    expect(movements[1]).toEqual(expect.objectContaining({ type: "STOCK_OUT", quantity: 3, previousOnHand: 5, newOnHand: 2 }));
  });

  it("keeps movement history chronological, immutable, and coupled to successful physical mutations", async () => {
    const owner = await account("history-owner");
    const stock = await fixture(owner, "history");
    await receive(owner, stock, 2);
    const stored = await item(stock);
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/adjust`, { inventoryItemId: stored.id, quantity: 1, reason: "count" }, owner.cookie)).status).toBe(201);
    const beforeFailure = await prisma.inventoryMovement.count({ where: { inventoryItemId: stored.id } });
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 2 }, owner.cookie)).status).toBe(201);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: 2 }, owner.cookie)).status).toBe(409);
    expect(await prisma.inventoryMovement.count({ where: { inventoryItemId: stored.id } })).toBe(beforeFailure);
    expect(await item(stock)).toEqual(expect.objectContaining({ onHand: 3, reserved: 2 }));
    const history = await http("GET", `/organizations/${stock.organizationId}/inventory/${stored.id}/movements`, undefined, owner.cookie);
    expect(history.status).toBe(200);
    const historyRows = history.body.data as Array<{ id: string; createdAt: string }>;
    expect(historyRows).toHaveLength(2);
    expect(historyRows.map((row) => row.createdAt)).toEqual([...historyRows.map((row) => row.createdAt)].sort());
    expect((await http("PATCH", `/organizations/${stock.organizationId}/inventory/${stored.id}/movements/${historyRows[0].id}`, { reason: "rewrite" }, owner.cookie)).status).toBe(404);
    expect((await http("DELETE", `/organizations/${stock.organizationId}/inventory/${stored.id}/movements/${historyRows[0].id}`, undefined, owner.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/movements`, { inventoryItemId: stored.id }, owner.cookie)).status).toBe(404);
  });

  it("enforces inventory RBAC and tenant isolation even when organization ids are substituted", async () => {
    const ownerA = await account("tenant-owner-a");
    const ownerB = await account("tenant-owner-b");
    const admin = await account("tenant-admin");
    const member = await account("tenant-member");
    const stockA = await fixture(ownerA, "tenant-a");
    const stockB = await fixture(ownerB, "tenant-b");
    await receive(ownerA, stockA, 4);
    await receive(ownerB, stockB, 4);
    await membership(admin.id, stockA.organizationId, "organization.admin");
    await membership(member.id, stockA.organizationId, "organization.member");
    await membership(ownerA.id, stockB.organizationId, "organization.member");
    const itemA = await item(stockA);
    const itemB = await item(stockB);

    await expect(rbac.organizationContext(ownerA.id, stockA.organizationId, "inventory.adjust")).resolves.toEqual(expect.objectContaining({ permissions: expect.arrayContaining(["inventory.locations.manage", "inventory.adjust", "inventory.reserve"]) }));
    await expect(rbac.organizationContext(admin.id, stockA.organizationId, "inventory.adjust")).resolves.toBeDefined();
    await expect(rbac.organizationContext(member.id, stockA.organizationId, "inventory.read")).resolves.toBeDefined();
    await expect(rbac.organizationContext(member.id, stockA.organizationId, "inventory.adjust")).rejects.toThrow();
    await expect(rbac.organizationContext(member.id, stockA.organizationId, "inventory.reserve")).rejects.toThrow();
    expect((await http("GET", `/organizations/${stockB.organizationId}/inventory`, undefined, ownerA.cookie)).status).toBe(200);
    expect((await http("GET", `/organizations/${stockB.organizationId}/inventory/${itemA.id}`, undefined, ownerA.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/${itemA.id}/remove`, { quantity: 1 }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/adjust`, { inventoryItemId: itemA.id, quantity: 1, reason: "foreign" }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/${itemA.id}/reserve`, { quantity: 1 }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/${itemA.id}/release`, { quantity: 1 }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/${itemA.id}/consume`, { quantity: 1 }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${stockB.organizationId}/inventory/${itemB.id}/remove`, { quantity: 1 }, ownerA.cookie)).status).toBe(403);
    await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: stockA.organizationId, userId: member.id } }, data: { status: MembershipStatus.SUSPENDED } });
    expect((await http("GET", `/organizations/${stockA.organizationId}/inventory`, undefined, member.cookie)).status).toBe(403);
  });

  it("prevents concurrent last-unit reservation oversell through real concurrent HTTP PostgreSQL updates", async () => {
    const owner = await account("concurrency-owner");
    const stock = await fixture(owner, "concurrency");
    await receive(owner, stock, 1);
    const stored = await item(stock);
    const results = await Promise.allSettled([
      http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 1 }, owner.cookie),
      http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 1 }, owner.cookie),
    ]);
    const responses = results.map((result) => result.status === "fulfilled" ? result.value : undefined);
    expect(responses.filter((response) => response?.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response?.status === 409)).toHaveLength(1);
    const final = await item(stock);
    expect(final).toEqual(expect.objectContaining({ onHand: 1, reserved: 1 }));
    expect(final.onHand - final.reserved).toBe(0);
  });

  it("keeps all constraints valid when reserve and remove race", async () => {
    const owner = await account("constraint-race-owner");
    const stock = await fixture(owner, "constraint-race");
    await receive(owner, stock, 2);
    const stored = await item(stock);
    expect((await http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 1 }, owner.cookie)).status).toBe(201);
    await Promise.allSettled([
      http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/reserve`, { quantity: 1 }, owner.cookie),
      http("POST", `/organizations/${stock.organizationId}/inventory/${stored.id}/remove`, { quantity: 1 }, owner.cookie),
    ]);
    const final = await item(stock);
    expect(final.onHand).toBeGreaterThanOrEqual(0);
    expect(final.reserved).toBeGreaterThanOrEqual(0);
    expect(final.reserved).toBeLessThanOrEqual(final.onHand);
  });
});
