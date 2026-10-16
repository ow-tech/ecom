import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MembershipStatus, ProductStatus, ProductVariantStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

type Response = { status: number; body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };
type Account = { id: string; cookie: string };
const prefix = `catalogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("catalogue foundation integration", () => {
  let app: INestApplication; let prisma: PrismaService; let baseUrl: string;
  const email = (label: string) => `${prefix}-${label}@example.test`;
  const slug = (label: string) => `${prefix}-${label}`;
  async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> { return new Promise((resolve, reject) => { const payload = body === undefined ? undefined : JSON.stringify(body); const request = httpRequest(`${baseUrl}${path}`, { method, headers: { ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...(cookie ? { cookie } : {}) } }, (response) => { const chunks: Buffer[] = []; response.on("data", (chunk: Buffer) => chunks.push(chunk)); response.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : {}, headers: response.headers }); }); }); request.on("error", reject); if (payload) request.write(payload); request.end(); }); }
  async function account(label: string): Promise<Account> { const response = await http("POST", "/auth/register", { email: email(label), password, displayName: label }); expect(response.status).toBe(201); return { id: response.body.id as string, cookie: (response.headers["set-cookie"] as string[])[0].split(";", 1)[0] }; }
  async function organization(owner: Account, label: string) { const response = await http("POST", "/organizations", { name: label, slug: slug(label) }, owner.cookie); expect(response.status).toBe(201); return response.body.id as string; }
  async function platform(userId: string) { const role = await prisma.role.findUniqueOrThrow({ where: { key: "platform.super_admin" } }); await prisma.platformRoleAssignment.create({ data: { userId, roleId: role.id } }); }
  async function membership(userId: string, organizationId: string, roleKey: string) { const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } }); const row = await prisma.organizationMembership.create({ data: { userId, organizationId, status: MembershipStatus.ACTIVE } }); await prisma.membershipRole.create({ data: { membershipId: row.id, roleId: role.id } }); }
  async function supplier(owner: Account, organizationId: string) { const created = await http("POST", `/organizations/${organizationId}/supplier`, { displayName: "Supplier" }, owner.cookie); expect(created.status).toBe(201); await prisma.supplier.update({ where: { id: created.body.id as string }, data: { status: SupplierStatus.ACTIVE } }); return created.body.id as string; }
  async function category(admin: Account, label = "electronics") { const response = await http("POST", "/platform/categories", { name: label, slug: slug(label) }, admin.cookie); expect(response.status).toBe(201); return response.body.id as string; }
  async function product(admin: Account, categoryId: string, label = "phone", status: ProductStatus = ProductStatus.ACTIVE) { const response = await http("POST", "/platform/products", { categoryId, name: label, slug: slug(label), status }, admin.cookie); expect(response.status).toBe(201); return response.body.id as string; }
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.listen(0, "127.0.0.1"); baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`; prisma = app.get(PrismaService); });
  afterAll(async () => { if (prisma) {
    await prisma.inventoryItem.deleteMany({ where: { supplierListing: { supplier: { organization: { slug: { startsWith: prefix } } } } } });
    await prisma.inventoryLocation.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
    await prisma.supplierListing.deleteMany({ where: { supplier: { organization: { slug: { startsWith: prefix } } } } });
    await prisma.productMedia.deleteMany({ where: { product: { slug: { startsWith: prefix } } } });
    await prisma.productVariant.deleteMany({ where: { product: { slug: { startsWith: prefix } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.organization.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.auditEvent.deleteMany({ where: { actorUser: { emailNormalized: { startsWith: prefix } } } });
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: prefix } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
  } if (app) await app.close(); });

  it("keeps categories and products platform-owned with hierarchy, stable unique slugs, variants, and media metadata", async () => {
    const admin = await account("platform"); const owner = await account("owner"); await platform(admin.id);
    const parent = await category(admin, "parent"); const child = await http("POST", "/platform/categories", { name: "Child", slug: slug("child"), parentId: parent }, admin.cookie); expect(child.status).toBe(201);
    expect((await http("PATCH", `/platform/categories/${parent}`, { parentId: parent }, admin.cookie)).status).toBe(409);
    expect((await http("POST", "/platform/categories", { name: "Duplicate", slug: slug("parent") }, admin.cookie)).status).toBe(409);
    expect((await http("POST", "/platform/categories", { name: "No", slug: slug("no") }, owner.cookie)).status).toBe(403);
    const item = await product(admin, parent); const storedProduct = await http("GET", `/platform/products/${item}`, undefined, admin.cookie); expect(storedProduct.body).not.toHaveProperty("price"); expect(storedProduct.body).not.toHaveProperty("supplierId"); expect((await http("POST", "/platform/products", { categoryId: parent, name: "Duplicate", slug: slug("phone") }, admin.cookie)).status).toBe(409);
    const variant = await http("POST", `/platform/products/${item}/variants`, { name: "256GB / Black", sku: `${prefix}-sku`, attributes: { storage: "256GB", color: "Black" } }, admin.cookie); expect(variant.status).toBe(201);
    expect((await http("POST", `/platform/products/${item}/variants`, { name: "Again", sku: `${prefix}-sku`, attributes: { size: "x" } }, admin.cookie)).status).toBe(409);
    const media = await http("POST", `/platform/products/${item}/media`, { storageKey: "catalogue/product.jpg", productVariantId: variant.body.id }, admin.cookie); expect(media.status).toBe(201);
    expect(media.body).toEqual(expect.objectContaining({ storageKey: "catalogue/product.jpg", mediaType: "IMAGE" }));
  });

  it("enforces supplier listing tenant scope, immutable ownership, database uniqueness and activation eligibility", async () => {
    const admin = await account("admin"); const ownerA = await account("owner-a"); const ownerB = await account("owner-b"); const staff = await account("staff"); const member = await account("member"); await platform(admin.id);
    const orgA = await organization(ownerA, "org-a"); const orgB = await organization(ownerB, "org-b"); await supplier(ownerA, orgA); await supplier(ownerB, orgB); await membership(staff.id, orgA, "organization.admin"); await membership(member.id, orgA, "organization.member");
    const categoryId = await category(admin, "listing-category"); const activeProduct = await product(admin, categoryId, "active-product"); const otherProduct = await product(admin, categoryId, "other-product"); const draftProduct = await product(admin, categoryId, "draft-product", ProductStatus.DRAFT);
    const activeVariant = await http("POST", `/platform/products/${activeProduct}/variants`, { name: "Active", attributes: { color: "black" } }, admin.cookie); const foreignVariant = await http("POST", `/platform/products/${otherProduct}/variants`, { name: "Foreign", attributes: { color: "white" } }, admin.cookie);
    const selection = await http("GET", `/organizations/${orgA}/listings/products/selection?search=active-product&page=1&limit=20`, undefined, ownerA.cookie); expect(selection.status).toBe(200); expect(selection.body).toEqual(expect.objectContaining({ page: 1, total: 1 })); expect(selection.body.data).toEqual([expect.objectContaining({ id: activeProduct, variants: [expect.objectContaining({ id: activeVariant.body.id })] })]); expect(JSON.stringify(selection.body)).not.toContain("supplierId");
    expect((await http("GET", `/organizations/${orgA}/listings/products/selection`, undefined, member.cookie)).status).toBe(403);
    const created = await http("POST", `/organizations/${orgA}/listings`, { productId: activeProduct, productVariantId: activeVariant.body.id, price: "145000.00", currencyCode: "kes", supplierSku: "supplier-1" }, ownerA.cookie); expect(created.status).toBe(201); expect(created.body.status).toBe("DRAFT"); expect(created.body.price).toBe("145000.00"); expect(created.body.currencyCode).toBe("KES");
    expect((await http("POST", `/organizations/${orgA}/listings`, { productId: activeProduct, productVariantId: activeVariant.body.id, price: "1", currencyCode: "USD" }, staff.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${orgA}/listings`, { productId: activeProduct, price: "0", currencyCode: "USD" }, ownerA.cookie)).status).toBe(400);
    expect((await http("POST", `/organizations/${orgA}/listings`, { productId: activeProduct, productVariantId: foreignVariant.body.id, price: "1", currencyCode: "USD" }, ownerA.cookie)).status).toBe(409);
    expect((await http("POST", `/organizations/${orgA}/listings`, { productId: activeProduct, price: "1", currencyCode: "USD" }, member.cookie)).status).toBe(403);
    expect((await http("PATCH", `/organizations/${orgA}/listings/${created.body.id}`, { supplierId: crypto.randomUUID(), status: "ACTIVE", productId: otherProduct }, ownerA.cookie)).status).toBe(400);
    expect((await http("GET", `/organizations/${orgB}/listings/${created.body.id}`, undefined, ownerB.cookie)).status).toBe(404);
    expect((await http("PATCH", `/organizations/${orgB}/listings/${created.body.id}`, { price: "2" }, ownerB.cookie)).status).toBe(404);
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(201);
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/deactivate`, undefined, staff.cookie)).status).toBe(201);
    await prisma.productVariant.update({ where: { id: activeVariant.body.id as string }, data: { status: ProductVariantStatus.INACTIVE } });
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(409);
    await prisma.productVariant.update({ where: { id: activeVariant.body.id as string }, data: { status: ProductVariantStatus.ACTIVE } });
    await prisma.supplier.update({ where: { organizationId: orgA }, data: { status: SupplierStatus.SUSPENDED } });
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(409);
    await prisma.supplier.update({ where: { organizationId: orgA }, data: { status: SupplierStatus.ACTIVE } });
    await prisma.product.update({ where: { id: activeProduct }, data: { status: ProductStatus.INACTIVE } });
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(409);
    await prisma.product.update({ where: { id: activeProduct }, data: { status: ProductStatus.ACTIVE } });
    expect((await http("POST", `/organizations/${orgA}/listings/${created.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(201);
    const draftListing = await http("POST", `/organizations/${orgA}/listings`, { productId: draftProduct, price: "10", currencyCode: "USD" }, ownerA.cookie); expect((await http("POST", `/organizations/${orgA}/listings/${draftListing.body.id}/activate`, undefined, ownerA.cookie)).status).toBe(409);
  });

  it("provides platform-authorized, paginated cross-supplier listing oversight without private supplier data", async () => {
    const admin = await account("oversight-admin"); const ownerA = await account("oversight-a"); const ownerB = await account("oversight-b"); const limited = await account("oversight-limited"); await platform(admin.id);
    const orgA = await organization(ownerA, "oversight-org-a"); const orgB = await organization(ownerB, "oversight-org-b"); const supplierA = await supplier(ownerA, orgA); await supplier(ownerB, orgB);
    const categoryId = await category(admin, "oversight-category"); const productA = await product(admin, categoryId, "oversight-phone"); const productB = await product(admin, categoryId, "oversight-laptop");
    const listingA = await http("POST", `/organizations/${orgA}/listings`, { productId: productA, price: "11.00", currencyCode: "USD", supplierSku: "private-a" }, ownerA.cookie); const listingB = await http("POST", `/organizations/${orgB}/listings`, { productId: productB, price: "22.00", currencyCode: "USD", supplierSku: "private-b" }, ownerB.cookie);
    expect(listingA.status).toBe(201); expect(listingB.status).toBe(201);
    const location = await prisma.inventoryLocation.create({ data: { supplierId: supplierA, name: "Oversight warehouse", code: slug("oversight-warehouse") } }); await prisma.inventoryItem.create({ data: { supplierListingId: listingA.body.id as string, inventoryLocationId: location.id, onHand: 1, reserved: 0 } });
    const page = await http("GET", "/platform/listings?search=oversight&page=1&limit=1", undefined, admin.cookie); expect(page.status).toBe(200); expect(page.body).toEqual(expect.objectContaining({ page: 1, limit: 1, total: 2 })); expect(JSON.stringify(page.body)).not.toContain("private-"); expect(JSON.stringify(page.body)).not.toContain("legalName");
    const all = await http("GET", "/platform/listings?search=oversight&status=DRAFT&page=1&limit=25", undefined, admin.cookie); expect(all.status).toBe(200); expect((all.body.data as Array<Record<string, unknown>>)).toHaveLength(2); expect((all.body.data as Array<Record<string, unknown>>).map(row => row.id)).toEqual(expect.arrayContaining([listingA.body.id, listingB.body.id])); expect((all.body.data as Array<Record<string, unknown>>).find(row => row.id === listingA.body.id)).toEqual(expect.objectContaining({ availability: "IN_STOCK", supplier: expect.objectContaining({ displayName: "Supplier" }) }));
    const supplierFiltered = await http("GET", `/platform/listings?supplierId=${supplierA}`, undefined, admin.cookie); expect(supplierFiltered.status).toBe(200); expect(supplierFiltered.body.total).toBe(1); expect((supplierFiltered.body.data as Array<Record<string, unknown>>)[0].id).toBe(listingA.body.id);
    expect((await http("GET", "/platform/listings", undefined, ownerA.cookie)).status).toBe(403); expect((await http("GET", "/platform/listings", undefined, limited.cookie)).status).toBe(403);
  });

  it("projects active, in-stock products and customer-safe offers for anonymous discovery", async () => {
    const admin = await account("public-admin"); const owner = await account("public-owner"); await platform(admin.id);
    const organizationId = await organization(owner, "public-org"); const supplierId = await supplier(owner, organizationId);
    const categoryId = await category(admin, "public-category"); const productId = await product(admin, categoryId, "public-product");
    const productRow = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const variant = await http("POST", `/platform/products/${productId}/variants`, { name: "Blue", attributes: { color: "blue" } }, admin.cookie); expect(variant.status).toBe(201);
    const listing = await http("POST", `/organizations/${organizationId}/listings`, { productId, productVariantId: variant.body.id, price: "125.50", currencyCode: "KES", supplierSku: "private-sku" }, owner.cookie); expect(listing.status).toBe(201); expect((await http("POST", `/organizations/${organizationId}/listings/${listing.body.id}/activate`, undefined, owner.cookie)).status).toBe(201);
    const location = await prisma.inventoryLocation.create({ data: { supplierId, name: "Public warehouse", code: slug("public-warehouse") } });
    await prisma.inventoryItem.create({ data: { supplierListingId: listing.body.id as string, inventoryLocationId: location.id, onHand: 3, reserved: 1 } });
    await prisma.productMedia.create({ data: { productId, storageKey: "catalogue/public.jpg", url: "https://media.example.test/public.jpg", altText: "Public product" } });

    const categoryResponse = await http("GET", `/catalogue/categories/${slug("public-category")}`); expect(categoryResponse.status).toBe(200); expect(categoryResponse.body).toEqual(expect.objectContaining({ id: categoryId, name: "public-category" }));
    const list = await http("GET", `/catalogue/products?category=${slug("public-category")}&page=1&limit=1`); expect(list.status).toBe(200); expect(list.body).toEqual(expect.objectContaining({ page: 1, limit: 1, total: 1 })); const listed = (list.body.data as Array<Record<string, unknown>>)[0]; expect(listed).toEqual(expect.objectContaining({ id: productId, slug: productRow.slug, offerCount: 1 })); expect(JSON.stringify(listed)).not.toContain("availableQuantity"); expect(JSON.stringify(listed)).not.toContain("private-sku");
    const detail = await http("GET", `/catalogue/products/${productRow.slug}`); expect(detail.status).toBe(200); expect(detail.body).toEqual(expect.objectContaining({ id: productId, media: [expect.objectContaining({ url: "https://media.example.test/public.jpg" })], variants: [expect.objectContaining({ id: variant.body.id })] })); expect((detail.body.offers as Array<Record<string, unknown>>)[0]).toEqual(expect.objectContaining({ price: "125.50", currencyCode: "KES", availability: "IN_STOCK", variantId: variant.body.id })); expect(JSON.stringify(detail.body)).not.toContain("onHand"); expect(JSON.stringify(detail.body)).not.toContain("supplierId");
  });

  it("filters eligible product offers before deterministic product pagination for anonymous customers", async () => {
    const admin = await account("filter-admin"); const ownerA = await account("filter-owner-a"); const ownerB = await account("filter-owner-b"); await platform(admin.id);
    const orgA = await organization(ownerA, "filter-org-a"); const orgB = await organization(ownerB, "filter-org-b"); const supplierA = await supplier(ownerA, orgA); const supplierB = await supplier(ownerB, orgB);
    await prisma.supplier.update({ where: { id: supplierA }, data: { displayName: "Filter Supplier A" } }); await prisma.supplier.update({ where: { id: supplierB }, data: { displayName: "Filter Supplier B" } });
    const phones = await category(admin, "filter-phones"); const audio = await category(admin, "filter-audio");
    const alpha = await product(admin, phones, "Alpha phone"); const bravo = await product(admin, phones, "Bravo phone"); const charlie = await product(admin, audio, "Charlie audio"); const inactive = await product(admin, phones, "Inactive phone"); const unavailable = await product(admin, phones, "Unavailable phone");
    const locationA = await prisma.inventoryLocation.create({ data: { supplierId: supplierA, name: "Filter A", code: slug("filter-a") } }); const locationB = await prisma.inventoryLocation.create({ data: { supplierId: supplierB, name: "Filter B", code: slug("filter-b") } });
    const offer = async (supplierId: string, productId: string, price: string, currencyCode: string, locationId: string, onHand: number, status: SupplierListingStatus = SupplierListingStatus.ACTIVE) => {
      const listing = await prisma.supplierListing.create({ data: { supplierId, productId, price, currencyCode, status } }); await prisma.inventoryItem.create({ data: { supplierListingId: listing.id, inventoryLocationId: locationId, onHand, reserved: 0 } }); return listing;
    };
    const alphaA = await offer(supplierA, alpha, "10.00", "USD", locationA.id, 4); await offer(supplierB, alpha, "10.01", "USD", locationB.id, 4); await offer(supplierA, bravo, "20.00", "USD", locationA.id, 4); await offer(supplierB, charlie, "15.00", "EUR", locationB.id, 4); await offer(supplierA, inactive, "5.00", "USD", locationA.id, 4, SupplierListingStatus.INACTIVE); await offer(supplierA, unavailable, "1.00", "USD", locationA.id, 0);
    const get = (query: string) => http("GET", `/catalogue/products?${query}`);
    const phonePage = await get(`category=${slug("filter-phones")}&sort=name-asc&page=1&limit=24`); expect(phonePage.status).toBe(200); expect(phonePage.body).toEqual(expect.objectContaining({ total: 2, page: 1, limit: 24 })); expect((phonePage.body.data as Array<Record<string, unknown>>).map(row => row.name)).toEqual(["Alpha phone", "Bravo phone"]);
    const alphaProduct = (phonePage.body.data as Array<Record<string, unknown>>)[0]; expect(alphaProduct).toEqual(expect.objectContaining({ id: alpha, offerCount: 2 })); expect(JSON.stringify(alphaProduct)).not.toContain("supplierId"); expect(JSON.stringify(alphaProduct)).not.toContain("onHand");
    const supplierOnly = await get(`supplier=${(await prisma.supplier.findUniqueOrThrow({ where: { id: supplierA } })).slug}&currency=USD&minPrice=10.00&maxPrice=20.00&sort=price-asc&page=1&limit=24`); expect(supplierOnly.body.total).toBe(2); expect((supplierOnly.body.data as Array<Record<string, unknown>>).map(row => row.id)).toEqual([alpha, bravo]); expect((supplierOnly.body.data as Array<Record<string, unknown>>)[0].offers).toEqual([expect.objectContaining({ id: alphaA.id, price: "10.00", currencyCode: "USD" })]);
    const decimalBoundary = await get(`supplier=${(await prisma.supplier.findUniqueOrThrow({ where: { id: supplierA } })).slug}&currency=USD&minPrice=10.01&page=1&limit=24`); expect(decimalBoundary.body.total).toBe(1); expect((decimalBoundary.body.data as Array<Record<string, unknown>>)[0].id).toBe(bravo);
    const descending = await get(`category=${slug("filter-phones")}&currency=USD&sort=price-desc&page=1&limit=1`); expect(descending.body).toEqual(expect.objectContaining({ total: 2, page: 1, limit: 1 })); expect((descending.body.data as Array<Record<string, unknown>>)[0].id).toBe(bravo);
    const secondPage = await get(`category=${slug("filter-phones")}&currency=USD&sort=name-asc&page=2&limit=1`); expect(secondPage.body).toEqual(expect.objectContaining({ total: 2, page: 2, limit: 1 })); expect((secondPage.body.data as Array<Record<string, unknown>>)[0].id).toBe(bravo);
    const eur = await get(`category=${slug("filter-audio")}&currency=EUR&sort=newest&page=1&limit=24`); expect(eur.body.total).toBe(1); expect((eur.body.data as Array<Record<string, unknown>>)[0].id).toBe(charlie);
  });
});
