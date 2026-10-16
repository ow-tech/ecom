import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Supplier, SupplierStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CreateSupplierDto, PlatformSupplierListDto, UpdateSupplierDto } from "./dto/supplier.dto";
import { SupplierLifecycleService } from "./supplier-lifecycle.service";

const normalizeSlug = (value: string): string => {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 140 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ConflictException("Supplier slug is invalid");
  return slug;
};

type SupplierProfileData = {
  displayName?: string;
  legalName?: string | null;
  description?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly lifecycle: SupplierLifecycleService) {}

  private async findForOrganization(organizationId: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  private profileData(dto: CreateSupplierDto | UpdateSupplierDto): SupplierProfileData {
    return {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
      ...(dto.legalName !== undefined ? { legalName: dto.legalName.trim() || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.businessEmail !== undefined ? { businessEmail: dto.businessEmail.trim().toLowerCase() || null } : {}),
      ...(dto.businessPhone !== undefined ? { businessPhone: dto.businessPhone.trim() || null } : {}),
      ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl.trim() || null } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl.trim() || null } : {}),
      ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl.trim() || null } : {}),
      ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode.trim().toUpperCase() || null } : {}),
      ...(dto.currencyCode !== undefined ? { currencyCode: dto.currencyCode.trim().toUpperCase() || null } : {}),
    };
  }

  private async generatedSlug(tx: Prisma.TransactionClient, displayName: string): Promise<string> {
    const base = normalizeSlug(displayName);
    for (let suffix = 1; suffix < 10_000; suffix += 1) {
      const candidate = suffix === 1 ? base : `${base.slice(0, 140 - (`-${suffix}`).length)}-${suffix}`;
      if (!await tx.supplier.findUnique({ where: { slug: candidate }, select: { id: true } })) return candidate;
    }
    throw new ConflictException("Supplier slug is unavailable");
  }

  async create(userId: string, organizationId: string, dto: CreateSupplierDto) {
    // INV-SUPPLIER-03: requested tenant IDs are not authorization.
    await this.rbac.organizationContext(userId, organizationId, "supplier.create");
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await tx.supplier.findUnique({ where: { organizationId }, select: { id: true } })) throw new ConflictException("Organization already has a supplier");
        const slug = dto.slug ? normalizeSlug(dto.slug) : await this.generatedSlug(tx, dto.displayName);
        const supplier = await tx.supplier.create({ data: { organizationId, slug, status: SupplierStatus.DRAFT, ...this.profileData(dto), displayName: dto.displayName.trim() } });
        await tx.supplierStatusHistory.create({ data: { supplierId: supplier.id, previousStatus: null, newStatus: SupplierStatus.DRAFT, actorUserId: userId } });
        return this.organizationResponse(supplier);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("Supplier slug is already in use");
      throw error;
    }
  }

  async get(userId: string, organizationId: string) {
    await this.rbac.organizationContext(userId, organizationId, "supplier.read");
    return this.organizationResponse(await this.findForOrganization(organizationId));
  }
  async overview(userId: string, organizationId: string) {
    const context = await this.rbac.organizationContext(userId, organizationId, "supplier.read");
    const supplier = await this.findForOrganization(organizationId); const can = (permission: string) => context.permissions.includes(permission);
    const [activeListings, stockAttention, preparing, ready] = await Promise.all([
      can("catalogue.listings.read") ? this.prisma.supplierListing.count({ where: { supplierId: supplier.id, status: "ACTIVE" } }) : null,
      can("inventory.read") ? this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS "count" FROM "InventoryItem" item JOIN "SupplierListing" listing ON listing."id" = item."supplierListingId" WHERE listing."supplierId" = ${supplier.id}::uuid AND item."onHand" <= item."reserved"`).then(rows => rows[0]?.count ?? 0) : null,
      can("orders.read") ? this.prisma.supplierOrder.count({ where: { supplierId: supplier.id, status: { in: ["CONFIRMED", "PREPARING"] } } }) : null,
      can("orders.read") ? this.prisma.supplierOrder.count({ where: { supplierId: supplier.id, status: { in: ["READY_FOR_PICKUP", "READY_FOR_DISPATCH"] } } }) : null,
    ]);
    return { activeListings, stockAttention, preparing, ready };
  }

  async update(userId: string, organizationId: string, dto: UpdateSupplierDto) {
    await this.rbac.organizationContext(userId, organizationId, "supplier.update");
    const supplier = await this.findForOrganization(organizationId);
    return this.organizationResponse(await this.prisma.supplier.update({ where: { id: supplier.id }, data: this.profileData(dto) }));
  }

  async submit(userId: string, organizationId: string) {
    await this.rbac.organizationContext(userId, organizationId, "supplier.submit");
    const supplier = await this.findForOrganization(organizationId);
    return this.organizationResponse(await this.lifecycle.transition(supplier.id, SupplierStatus.PENDING_REVIEW, userId, undefined, (current) => this.lifecycle.assertOnboardingComplete(current)));
  }

  async platformList(query: PlatformSupplierListDto) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ displayName: { contains: query.search, mode: "insensitive" } }, { legalName: { contains: query.search, mode: "insensitive" } }, { slug: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, suppliers] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { organization: { select: { id: true, name: true, slug: true } } },
      }),
    ]);
    return { data: suppliers.map((supplier) => this.platformResponse(supplier)), page: query.page, limit: query.limit, total };
  }

  async platformGet(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, include: { organization: { select: { id: true, name: true, slug: true } } } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return this.platformResponse(supplier);
  }

  async approve(actorUserId: string, supplierId: string) { return this.platformResponse(await this.lifecycle.transition(supplierId, SupplierStatus.ACTIVE, actorUserId)); }
  async reject(actorUserId: string, supplierId: string, reason?: string) { return this.platformResponse(await this.lifecycle.transition(supplierId, SupplierStatus.REJECTED, actorUserId, reason)); }
  async suspend(actorUserId: string, supplierId: string, reason?: string) { return this.platformResponse(await this.lifecycle.transition(supplierId, SupplierStatus.SUSPENDED, actorUserId, reason)); }
  async reactivate(actorUserId: string, supplierId: string) { return this.platformResponse(await this.lifecycle.transition(supplierId, SupplierStatus.ACTIVE, actorUserId)); }

  private organizationResponse(supplier: Supplier) {
    return {
      id: supplier.id, organizationId: supplier.organizationId, displayName: supplier.displayName, legalName: supplier.legalName, slug: supplier.slug, status: supplier.status,
      description: supplier.description, businessEmail: supplier.businessEmail, businessPhone: supplier.businessPhone, websiteUrl: supplier.websiteUrl, logoUrl: supplier.logoUrl, bannerUrl: supplier.bannerUrl,
      countryCode: supplier.countryCode, currencyCode: supplier.currencyCode, createdAt: supplier.createdAt, updatedAt: supplier.updatedAt,
      approvedAt: supplier.approvedAt, rejectedAt: supplier.rejectedAt, rejectionReason: supplier.rejectionReason, suspendedAt: supplier.suspendedAt, suspensionReason: supplier.suspensionReason,
    };
  }

  private platformResponse(supplier: Supplier & { organization?: { id: string; name: string; slug: string } }) { return supplier; }
}
