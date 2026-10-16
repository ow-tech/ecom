import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MembershipStatus, Prisma, ProductStatus, RoleScope, SupplierListingStatus, SupplierOrderStatus, SupplierStatus } from "@prisma/client";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { RbacService } from "../src/rbac/rbac.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { CommercialAvailabilityService } from "../src/commerce/commercial-availability.service";

type Response = { status: number; body: unknown; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };

const prefix = `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("supplier domain integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rbac: RbacService;
  let baseUrl: string;

  const email = (label: string) => `${prefix}-${label}@example.test`;
  const slug = (label: string) => `${prefix}-${label}`;

  async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest(`${baseUrl}${path}`, { method, headers: { ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...(cookie ? { cookie } : {}) } }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : undefined, headers: response.headers });
        });
      });
      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  async function account(label: string): Promise<Account> {
    const response = await http("POST", ((!/(?:customer(?!.*agent)|foreign-ticket$)/i.test(label) && /owner|admin|member|staff|platform|supplier|inventory|locations|receive-|physical-|reservation-|history-|concurrency-|constraint-|tenant-|oversight|payviewer|finance-reader|refund-reader|refund-reviewer|multi-org|list-|roles-|url-owner|rbac-|suspend-owner|approve-|reject-|submit-|create-|support-agent|foreign-org|pickup-foreign|pickup-outsider|reader|report-|overview-/i.test(label)) ? "/auth/workforce/register" : "/auth/register"), { email: email(label), password, displayName: label });
    expect(response.status).toBe(201);
    const header = (response.headers["set-cookie"] as string[])[0];
    return { id: (response.body as { id: string }).id, cookie: header.split(";", 1)[0] };
  }

  async function organization(owner: Account, label: string): Promise<{ id: string; slug: string }> {
    const response = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie);
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id, slug: slug(label) };
  }

  async function supplier(owner: Account, organizationId: string, label: string, extra: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const response = await http("POST", `/organizations/${organizationId}/supplier`, { displayName: label, ...extra }, owner.cookie);
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id, slug: (response.body as { slug: string }).slug };
  }

  async function addOrganizationRole(userId: string, organizationId: string, roleKey: string, status = MembershipStatus.ACTIVE): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const membership = await prisma.organizationMembership.create({ data: { userId, organizationId, status } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  }

  async function makePlatformAdmin(userId: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: "platform.super_admin" } });
    await prisma.platformRoleAssignment.create({ data: { userId, roleId: role.id } });
  }

  async function addPermissionMembership(userId: string, organizationId: string, permissions: string[], status: MembershipStatus = MembershipStatus.ACTIVE): Promise<void> {
    const role = await prisma.role.create({ data: { key: `${prefix}-overview-${crypto.randomUUID()}`, name: "Overview test role", scope: RoleScope.ORGANIZATION, isSystem: false } });
    const rows = await prisma.permission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
    await prisma.rolePermission.createMany({ data: rows.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    const membership = await prisma.organizationMembership.create({ data: { userId, organizationId, status } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  }

  async function overviewFixtures(owner: Account) {
    const fixtureId = crypto.randomUUID().slice(0, 8); const orgA = await organization(owner, `overview-a-${fixtureId}`); const orgB = await organization(owner, `overview-b-${fixtureId}`);
    const supplierA = await prisma.supplier.create({ data: { organizationId: orgA.id, displayName: "Overview A", slug: slug(`overview-supplier-a-${fixtureId}`), status: SupplierStatus.ACTIVE } });
    const supplierB = await prisma.supplier.create({ data: { organizationId: orgB.id, displayName: "Overview B", slug: slug(`overview-supplier-b-${fixtureId}`), status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: `${prefix} overview ${fixtureId}`, slug: slug(`overview-category-${fixtureId}`) } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: `${prefix} overview product ${fixtureId}`, slug: slug(`overview-product-${fixtureId}`), status: ProductStatus.ACTIVE } });
    const variants = await Promise.all(Array.from({ length: 23 }, (_, index) => prisma.productVariant.create({ data: { productId: product.id, name: `Overview ${index}`, sku: `${prefix.slice(0, 80)}-${fixtureId}-${index}` } })));
    const listings = await Promise.all(variants.map((variant, index) => prisma.supplierListing.create({ data: { supplierId: supplierA.id, productId: product.id, productVariantId: variant.id, price: new Prisma.Decimal("10.00"), currencyCode: "USD", status: index === 2 ? SupplierListingStatus.INACTIVE : SupplierListingStatus.ACTIVE, supplierSku: `A-${fixtureId}-${index}` } })));
    const bListing = await prisma.supplierListing.create({ data: { supplierId: supplierB.id, productId: product.id, price: new Prisma.Decimal("10.00"), currencyCode: "USD", status: SupplierListingStatus.ACTIVE, supplierSku: "B-1" } });
    const locationA = await prisma.inventoryLocation.create({ data: { supplierId: supplierA.id, name: "Overview A stock", code: "OV-A" } }); const locationB = await prisma.inventoryLocation.create({ data: { supplierId: supplierB.id, name: "Overview B stock", code: "OV-B" } });
    await prisma.inventoryItem.createMany({ data: [{ supplierListingId: listings[0].id, inventoryLocationId: locationA.id, onHand: 5, reserved: 0 }, { supplierListingId: listings[1].id, inventoryLocationId: locationA.id, onHand: 2, reserved: 0 }, { supplierListingId: listings[3].id, inventoryLocationId: locationA.id, onHand: 1, reserved: 1 }, { supplierListingId: listings[4].id, inventoryLocationId: locationA.id, onHand: 0, reserved: 0 }, { supplierListingId: bListing.id, inventoryLocationId: locationB.id, onHand: 0, reserved: 0 }] });
    const customer = await account(`overview-customer-${fixtureId}`); const profile = await prisma.customerProfile.create({ data: { userId: customer.id } }); const cart = await prisma.cart.create({ data: { customerProfileId: profile.id } });
    async function supplierOrder(supplierId: string, status: SupplierOrderStatus, index: number) { const attempt = await prisma.checkoutAttempt.create({ data: { customerProfileId: profile.id, cartId: cart.id, idempotencyKey: `overview-${supplierId}-${index}` } }); const order = await prisma.order.create({ data: { orderNumber: `${prefix.slice(0, 24)}-${supplierId.slice(0, 4)}-${index}`, customerProfileId: profile.id, checkoutAttemptId: attempt.id, status: "PAYMENT_CONFIRMED", paymentStatus: "PAID", currencyCode: "USD", subtotal: new Prisma.Decimal("10.00"), total: new Prisma.Decimal("10.00"), fulfillmentMethod: "PICKUP" } }); return prisma.supplierOrder.create({ data: { orderId: order.id, supplierId, supplierOrderNumber: `${prefix.slice(0, 28)}-${supplierId.slice(0, 4)}-${index}`, status, subtotal: new Prisma.Decimal("10.00") } }); }
    await Promise.all([supplierOrder(supplierA.id, SupplierOrderStatus.PREPARING, 1), supplierOrder(supplierA.id, SupplierOrderStatus.PREPARING, 2), supplierOrder(supplierA.id, SupplierOrderStatus.READY_FOR_PICKUP, 3), supplierOrder(supplierA.id, SupplierOrderStatus.READY_FOR_DISPATCH, 4), supplierOrder(supplierA.id, SupplierOrderStatus.COMPLETED, 5), ...Array.from({ length: 21 }, (_, index) => supplierOrder(supplierA.id, SupplierOrderStatus.COMPLETED, index + 6)), supplierOrder(supplierB.id, SupplierOrderStatus.PREPARING, 99)]);
    return { orgA, orgB };
  }

  async function submitComplete(owner: Account, organizationId: string): Promise<void> {
    const update = await http("PATCH", `/organizations/${organizationId}/supplier`, { legalName: "Acme Legal", businessEmail: "ops@acme.example", businessPhone: "+971500000000", countryCode: "ae", currencyCode: "usd" }, owner.cookie);
    expect(update.status).toBe(200);
    expect((await http("POST", `/organizations/${organizationId}/supplier/submit`, undefined, owner.cookie)).status).toBe(201);
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
      const profiles = await prisma.customerProfile.findMany({ where: { user: { emailNormalized: { startsWith: prefix } } }, select: { id: true } });
      const profileIds = profiles.map((profile) => profile.id);
      const orders = await prisma.order.findMany({ where: { customerProfileId: { in: profileIds } }, select: { id: true } });
      const orderIds = orders.map((order) => order.id);
      await prisma.overseasReservation.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.supplierOrderStatusHistory.deleteMany({ where: { supplierOrder: { orderId: { in: orderIds } } } });
      await prisma.supplierOrder.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.checkoutAttempt.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.cart.deleteMany({ where: { customerProfileId: { in: profileIds } } });
      await prisma.customerProfile.deleteMany({ where: { id: { in: profileIds } } });
      await prisma.inventoryMovement.deleteMany({ where: { inventoryItem: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } } });
      await prisma.inventoryItem.deleteMany({ where: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } });
      await prisma.inventoryLocation.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
      await prisma.supplierListing.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
      await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.auditEvent.deleteMany({ where: { actorUser: { emailNormalized: { startsWith: prefix } } } });
      await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: prefix } } });
      await prisma.role.deleteMany({ where: { key: { startsWith: `${prefix}-overview-` } } });
      await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: prefix } } } });
      await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
    }
    if (app) await app.close();
  });

  it("creates one draft supplier with append-only initial history and deterministic unique slugs", async () => {
    const owner = await account("create-owner");
    const orgA = await organization(owner, "create-a");
    const created = await supplier(owner, orgA.id, "Acme Supplier");
    const stored = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id }, include: { statusHistory: true } });
    expect(stored.status).toBe(SupplierStatus.DRAFT);
    expect(stored.statusHistory).toHaveLength(1);
    expect(stored.statusHistory[0]).toEqual(expect.objectContaining({ previousStatus: null, newStatus: SupplierStatus.DRAFT, actorUserId: owner.id }));
    expect((await http("POST", `/organizations/${orgA.id}/supplier`, { displayName: "Second" }, owner.cookie)).status).toBe(409);

    const orgB = await organization(owner, "create-b");
    expect((await http("POST", `/organizations/${orgB.id}/supplier`, { displayName: "Elsewhere", slug: created.slug }, owner.cookie)).status).toBe(409);
  });

  it("requires supplier.create and prevents cross-organization reads, updates, submissions, and suspended membership access", async () => {
    const ownerA = await account("tenant-owner-a");
    const ownerB = await account("tenant-owner-b");
    const member = await account("tenant-member");
    const orgA = await organization(ownerA, "tenant-a");
    const orgB = await organization(ownerB, "tenant-b");
    await supplier(ownerB, orgB.id, "Supplier B");
    await addOrganizationRole(member.id, orgA.id, "organization.member");
    expect((await http("POST", `/organizations/${orgA.id}/supplier`, { displayName: "No create" }, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${orgB.id}/supplier`, undefined, ownerA.cookie)).status).toBe(403);
    expect((await http("PATCH", `/organizations/${orgB.id}/supplier`, { displayName: "intrusion" }, ownerA.cookie)).status).toBe(403);
    expect((await http("POST", `/organizations/${orgB.id}/supplier/submit`, undefined, ownerA.cookie)).status).toBe(403);
    await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: orgA.id, userId: member.id } }, data: { status: MembershipStatus.SUSPENDED } });
    expect((await http("GET", `/organizations/${orgA.id}/supplier`, undefined, member.cookie)).status).toBe(403);
  });

  it("allows profile fields but blocks mass assignment and keeps the slug stable", async () => {
    const owner = await account("profile-owner");
    const org = await organization(owner, "profile-org");
    const created = await supplier(owner, org.id, "Stable Supplier");
    const updated = await http("PATCH", `/organizations/${org.id}/supplier`, { displayName: "Renamed Supplier", description: "Profile text", businessPhone: "+971500000001" }, owner.cookie);
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(expect.objectContaining({ displayName: "Renamed Supplier", slug: created.slug, description: "Profile text" }));
    expect((await http("PATCH", `/organizations/${org.id}/supplier`, { status: "ACTIVE" }, owner.cookie)).status).toBe(400);
    expect((await http("PATCH", `/organizations/${org.id}/supplier`, { organizationId: crypto.randomUUID() }, owner.cookie)).status).toBe(400);
    expect((await http("PATCH", `/organizations/${org.id}/supplier`, { approvedAt: new Date().toISOString() }, owner.cookie)).status).toBe(400);
  });

  it("submits only complete drafts and records the canonical pending-review transition once", async () => {
    const owner = await account("submit-owner");
    const org = await organization(owner, "submit-org");
    const created = await supplier(owner, org.id, "Submit Supplier");
    expect((await http("POST", `/organizations/${org.id}/supplier/submit`, undefined, owner.cookie)).status).toBe(400);
    await submitComplete(owner, org.id);
    const stored = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(stored.status).toBe(SupplierStatus.PENDING_REVIEW);
    expect(stored.statusHistory.map((history) => history.newStatus)).toEqual([SupplierStatus.DRAFT, SupplierStatus.PENDING_REVIEW]);
    expect((await http("POST", `/organizations/${org.id}/supplier/submit`, undefined, owner.cookie)).status).toBe(409);
  });

  it("keeps organization and platform authorization separate while allowing platform list and detail", async () => {
    const owner = await account("platform-owner");
    const platform = await account("platform-admin");
    const org = await organization(owner, "platform-org");
    const created = await supplier(owner, org.id, "Platform Supplier");
    await submitComplete(owner, org.id);
    expect((await http("POST", `/platform/suppliers/${created.id}/approve`, undefined, owner.cookie)).status).toBe(403);
    expect((await http("POST", `/platform/suppliers/${created.id}/reject`, { reason: "no" }, owner.cookie)).status).toBe(403);
    expect((await http("POST", `/platform/suppliers/${created.id}/suspend`, { reason: "no" }, owner.cookie)).status).toBe(403);
    await makePlatformAdmin(platform.id);
    expect((await http("GET", "/platform/suppliers?page=1&limit=10&status=PENDING_REVIEW", undefined, platform.cookie)).status).toBe(200);
    expect((await http("GET", `/platform/suppliers/${created.id}`, undefined, platform.cookie)).status).toBe(200);
  });

  it("approves a pending supplier with the authenticated actor and rejects direct draft approval", async () => {
    const owner = await account("approve-owner");
    const platform = await account("approve-admin");
    const org = await organization(owner, "approve-org");
    const pending = await supplier(owner, org.id, "Pending Approval");
    const draftOrg = await organization(owner, "draft-org");
    const draft = await supplier(owner, draftOrg.id, "Draft Approval");
    await submitComplete(owner, org.id);
    await makePlatformAdmin(platform.id);
    expect((await http("POST", `/platform/suppliers/${draft.id}/approve`, undefined, platform.cookie)).status).toBe(409);
    expect((await http("POST", `/platform/suppliers/${pending.id}/approve`, undefined, platform.cookie)).status).toBe(201);
    const stored = await prisma.supplier.findUniqueOrThrow({ where: { id: pending.id }, include: { statusHistory: true } });
    expect(stored).toEqual(expect.objectContaining({ status: SupplierStatus.ACTIVE, approvedByUserId: platform.id, approvedAt: expect.any(Date) }));
    expect(stored.statusHistory.some((history) => history.newStatus === SupplierStatus.ACTIVE && history.actorUserId === platform.id)).toBe(true);
  });

  it("rejects pending supplier onboarding with evidence and keeps rejected suppliers terminal", async () => {
    const owner = await account("reject-owner");
    const platform = await account("reject-admin");
    const org = await organization(owner, "reject-org");
    const created = await supplier(owner, org.id, "Rejectable Supplier");
    await submitComplete(owner, org.id);
    await makePlatformAdmin(platform.id);
    expect((await http("POST", `/platform/suppliers/${created.id}/reject`, { reason: "Missing documentation" }, platform.cookie)).status).toBe(201);
    const rejected = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } });
    expect(rejected).toEqual(expect.objectContaining({ status: SupplierStatus.REJECTED, rejectedByUserId: platform.id, rejectionReason: "Missing documentation", rejectedAt: expect.any(Date) }));
    expect((await http("POST", `/platform/suppliers/${created.id}/approve`, undefined, platform.cookie)).status).toBe(409);
  });

  it("suspends and reactivates without changing tenant membership or sessions, preserving lifecycle evidence", async () => {
    const owner = await account("suspend-owner");
    const platform = await account("suspend-admin");
    const org = await organization(owner, "suspend-org");
    const created = await supplier(owner, org.id, "Suspendable Supplier");
    await submitComplete(owner, org.id);
    await makePlatformAdmin(platform.id);
    await http("POST", `/platform/suppliers/${created.id}/approve`, undefined, platform.cookie);
    const membership = await prisma.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org.id, userId: owner.id } } });
    expect((await http("POST", `/platform/suppliers/${created.id}/suspend`, { reason: "Compliance review" }, platform.cookie)).status).toBe(201);
    const suspended = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(suspended).toEqual(expect.objectContaining({ status: SupplierStatus.SUSPENDED, suspendedByUserId: platform.id, suspensionReason: "Compliance review", suspendedAt: expect.any(Date) }));
    expect((await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } })).status).toBe(MembershipStatus.ACTIVE);
    expect((await http("GET", "/auth/me", undefined, owner.cookie)).status).toBe(200);
    expect((await http("POST", `/platform/suppliers/${created.id}/reactivate`, undefined, platform.cookie)).status).toBe(201);
    const active = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id }, include: { statusHistory: { orderBy: { createdAt: "asc" } } } });
    expect(active.status).toBe(SupplierStatus.ACTIVE);
    expect(active).toEqual(expect.objectContaining({ suspendedByUserId: platform.id, suspensionReason: "Compliance review", suspendedAt: expect.any(Date) }));
    expect(active.statusHistory.map((history) => history.newStatus)).toEqual([SupplierStatus.DRAFT, SupplierStatus.PENDING_REVIEW, SupplierStatus.ACTIVE, SupplierStatus.SUSPENDED, SupplierStatus.ACTIVE]);
  });

  it("preserves existing RBAC boundaries while adding supplier permissions", async () => {
    const owner = await account("rbac-owner");
    const org = await organization(owner, "rbac-org");
    await expect(rbac.organizationContext(owner.id, org.id, "organization.members.manage")).resolves.toBeDefined();
    await expect(rbac.organizationContext(owner.id, org.id, "supplier.submit")).resolves.toBeDefined();
    await expect(rbac.requirePlatform(owner.id, "platform.suppliers.read")).rejects.toThrow("Platform access denied");
  });

  it("returns complete overview aggregates beyond ordinary list pagination only for the granted metric permissions", async () => {
    const owner = await account("overview-owner"); const { orgA } = await overviewFixtures(owner);
    const matrix: Array<[string, string[], Record<string, number | null>]> = [
      ["baseline", ["supplier.read"], { activeListings: null, stockAttention: null, preparing: null, ready: null }],
      ["listings", ["supplier.read", "catalogue.listings.read"], { activeListings: 22, stockAttention: null, preparing: null, ready: null }],
      ["inventory", ["supplier.read", "inventory.read"], { activeListings: null, stockAttention: 2, preparing: null, ready: null }],
      ["orders", ["supplier.read", "orders.read"], { activeListings: null, stockAttention: null, preparing: 2, ready: 2 }],
      ["all", ["supplier.read", "catalogue.listings.read", "inventory.read", "orders.read"], { activeListings: 22, stockAttention: 2, preparing: 2, ready: 2 }],
    ];
    for (const [label, permissions, expected] of matrix) { const actor = await account(`overview-${label}`); await addPermissionMembership(actor.id, orgA.id, permissions); const response = await http("GET", `/organizations/${orgA.id}/supplier/overview`, undefined, actor.cookie); expect(response.status).toBe(200); expect(response.body).toEqual(expected); }
    const noBaseline = await account("overview-no-baseline"); await addPermissionMembership(noBaseline.id, orgA.id, ["orders.read"]); expect((await http("GET", `/organizations/${orgA.id}/supplier/overview`, undefined, noBaseline.cookie)).status).toBe(403);
  });

  it("returns currency-isolated paid merchandise and hides financial reporting without finance.read", async () => {
    const owner = await account("report-owner");
    const { orgA, orgB } = await overviewFixtures(owner);
    const report = await http("GET", `/organizations/${orgA.id}/reports`, undefined, owner.cookie);
    expect(report.status).toBe(200);
    expect(report.body).toEqual(expect.objectContaining({
      period: expect.objectContaining({ label: "Last 30 days" }),
      overview: expect.objectContaining({ activeListings: 22, stockAttention: 2 }),
      paidMerchandise: [{ currencyCode: "USD", paidSupplierOrders: 26, subtotal: "260.00" }],
    }));
    expect((report.body as { orderStatuses: Array<{ status: string; count: number }> }).orderStatuses.reduce((n, row) => n + row.count, 0)).toBe(26);

    const reader = await account("report-readonly");
    await addPermissionMembership(reader.id, orgA.id, ["supplier.read", "orders.read"]);
    const scoped = await http("GET", `/organizations/${orgA.id}/reports`, undefined, reader.cookie);
    expect(scoped.status).toBe(200);
    expect(scoped.body).toEqual(expect.objectContaining({ paidMerchandise: null, orderStatuses: expect.any(Array) }));
    const financeViewer = await account("report-finance");
    await addPermissionMembership(financeViewer.id, orgA.id, ["supplier.read", "finance.read"]);
    const financial = await http("GET", `/organizations/${orgA.id}/reports`, undefined, financeViewer.cookie);
    expect(financial.status).toBe(200);
    expect(financial.body).toEqual(expect.objectContaining({ orderStatuses: null, paidMerchandise: [{ currencyCode: "USD", paidSupplierOrders: 26, subtotal: "260.00" }] }));
    const outsider = await account("report-outsider");
    expect((await http("GET", `/organizations/${orgA.id}/reports`, undefined, outsider.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${orgB.id}/reports`, undefined, reader.cookie)).status).toBe(403);
  });

  it("denies overview requests whose URL organization is not an active supplier membership", async () => {
    const owner = await account("overview-isolation-owner"); const { orgA, orgB } = await overviewFixtures(owner); const member = await account("overview-active"); const suspended = await account("overview-suspended"); const platform = await account("overview-platform");
    await addPermissionMembership(member.id, orgA.id, ["supplier.read"]); await addPermissionMembership(suspended.id, orgA.id, ["supplier.read"], MembershipStatus.SUSPENDED); await makePlatformAdmin(platform.id);
    expect((await http("GET", `/organizations/${orgA.id}/supplier/overview`, undefined, member.cookie)).status).toBe(200);
    expect((await http("GET", `/organizations/${orgB.id}/supplier/overview`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${orgA.id}/supplier/overview`, undefined, suspended.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${orgA.id}/supplier/overview`, undefined, platform.cookie)).status).toBe(403);
  });
  it("enforces root-only overseas approval, atomic orderable reservation, consumption, expiry and revocation", async () => {
    const owner = await account("overseas-owner");
    const root = await account("overseas-platform");
    const customer = await account("overseas-customer");
    const org = await organization(owner, "overseas-tenant");
    const supplierRow = await supplier(owner, org.id, "Overseas Demo");
    await prisma.supplier.update({ where: { id: supplierRow.id }, data: { status: SupplierStatus.ACTIVE } });
    const category = await prisma.category.create({ data: { name: "Overseas fixture", slug: slug("overseas-category") } });
    const product = await prisma.product.create({ data: { categoryId: category.id, name: "Overseas unit", slug: slug("overseas-product"), status: ProductStatus.ACTIVE } });
    const params = { productId: product.id, price: "12500.00", currencyCode: "KES", origin: "OVERSEAS", deliveryMinDays: 14, deliveryMaxDays: 21, overseasOrderable: 3 };
    expect((await http("PATCH", `/platform/suppliers/${supplierRow.id}/overseas-shipping`, { enabled: true }, owner.cookie)).status).toBe(403);
    const blocked = await http("POST", `/organizations/${org.id}/listings`, params, owner.cookie);
    expect(blocked.status).toBe(409);
    await makePlatformAdmin(root.id);
    expect((await http("PATCH", `/platform/suppliers/${supplierRow.id}/overseas-shipping`, { enabled: true }, root.cookie)).status).toBe(200);
    const created = await http("POST", `/organizations/${org.id}/listings`, params, owner.cookie);
    expect(created.status).toBe(201);
    const listingId = (created.body as { id: string }).id;
    expect((await http("POST", `/organizations/${org.id}/listings/${listingId}/activate`, {}, owner.cookie)).status).toBe(201);
    const availability = app.get(CommercialAvailabilityService);
    expect((await availability.resolve(listingId))?.availableQuantity).toBe(3);
    const stock = app.get(InventoryService);
    const profile = await prisma.customerProfile.create({ data: { userId: customer.id } });
    const cart = await prisma.cart.create({ data: { customerProfileId: profile.id } });
    const makeOrder = async (label: string) => {
      const attempt = await prisma.checkoutAttempt.create({ data: { customerProfileId: profile.id, cartId: cart.id, idempotencyKey: label } });
      return prisma.order.create({ data: {
        customerProfileId: profile.id, checkoutAttemptId: attempt.id, orderNumber: slug(label),
        currencyCode: "KES", subtotal: new Prisma.Decimal("12500"), total: new Prisma.Decimal("12500"),
        fulfillmentMethod: "PICKUP",
      } });
    };
    const first = await makeOrder("overseas-allocate-one");
    const firstAttempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: first.checkoutAttemptId } });
    await prisma.$transaction(tx => stock.allocateOwned(tx, listingId, 2, firstAttempt.id, first.id, new Date(Date.now() + 30000)));
    expect((await availability.resolve(listingId))?.availableQuantity).toBe(1);
    const second = await makeOrder("overseas-allocate-two");
    const secondAttempt = await prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: second.checkoutAttemptId } });
    await expect(prisma.$transaction(tx => stock.allocateOwned(tx, listingId, 2, secondAttempt.id, second.id, new Date(Date.now() + 30000)))).rejects.toThrow();
    expect((await availability.resolve(listingId))?.availableQuantity).toBe(1);
    await prisma.$transaction(tx => stock.consumeOwned(tx, first.id, crypto.randomUUID(), new Date()));
    const committed = await prisma.supplierListing.findUniqueOrThrow({ where: { id: listingId } });
    expect([committed.overseasReserved, committed.overseasCommitted]).toEqual([0, 2]);
    expect(await prisma.inventoryItem.count({ where: { supplierListingId: listingId } })).toBe(0);
    const third = await makeOrder("overseas-release");
    await prisma.$transaction(tx => stock.allocateOwned(tx, listingId, 1, third.checkoutAttemptId, third.id, new Date(Date.now() + 30000)));
    await prisma.$transaction(tx => stock.releaseOwned(tx, third.id, new Date()));
    expect((await availability.resolve(listingId))?.availableQuantity).toBe(1);
    expect((await http("PATCH", `/platform/suppliers/${supplierRow.id}/overseas-shipping`, { enabled: false }, root.cookie)).status).toBe(200);
    expect((await availability.resolve(listingId))?.eligible).toBe(false);
    expect((await prisma.supplierListing.findUniqueOrThrow({ where: { id: listingId } })).overseasCommitted).toBe(2);
  });

});
