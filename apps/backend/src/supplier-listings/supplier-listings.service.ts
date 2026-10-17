import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ListingOrigin, Prisma, ProductStatus, ProductVariantStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CreateSupplierListingDto, PlatformListingListDto, SupplierListingListDto, SupplierProductSelectionDto, UpdateSupplierListingDto } from "./dto/supplier-listing.dto";

@Injectable()
export class SupplierListingsService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  // INV-LISTING-02: supplier ownership comes only from verified organization context.
  private async supplierForOrganization(userId: string, organizationId: string, permission: string) {
    await this.rbac.organizationContext(userId, organizationId, permission);
    const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }
  private overseasFields(supplier: { overseasEnabled: boolean }, origin: ListingOrigin, min?: number | null, max?: number | null, capacity?: number) {
    if (origin === ListingOrigin.LOCAL) {
      if (min != null || max != null || (capacity ?? 0) !== 0) throw new BadRequestException("Local listings cannot have overseas estimates or orderable capacity");
      return { origin, deliveryMinDays: null, deliveryMaxDays: null, overseasOrderable: 0 };
    }
    if (!supplier.overseasEnabled) throw new ConflictException("Super admin has not enabled overseas shipping for this supplier");
    if (!Number.isInteger(min) || !Number.isInteger(max) || min! < 1 || max! > 365 || min! > max!)
      throw new BadRequestException("Overseas listings require a valid delivery range from 1 to 365 days");
    if (!Number.isInteger(capacity) || capacity! < 0 || capacity! > 1000000) throw new BadRequestException("Overseas orderable quantity must be 0–1000000");
    return { origin, deliveryMinDays: min!, deliveryMaxDays: max!, overseasOrderable: capacity! };
  }
  private price(value: string): Prisma.Decimal {
    let price: Prisma.Decimal;
    try { price = new Prisma.Decimal(value); } catch { throw new BadRequestException("Price is invalid"); }
    if (!price.isFinite() || !price.greaterThan(0) || price.decimalPlaces() > 2 || price.precision() > 18) throw new BadRequestException("Price must be a positive amount with at most two decimal places");
    return price;
  }
  private async productAndVariant(productId: string, productVariantId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found");
    if (product.status === ProductStatus.INACTIVE) throw new ConflictException("Inactive product cannot receive listings");
    if (!productVariantId) return { product, variant: null };
    const variant = await this.prisma.productVariant.findFirst({ where: { id: productVariantId, productId } });
    if (!variant) throw new ConflictException("Product variant must belong to product");
    return { product, variant };
  }
  private response<T extends { price: Prisma.Decimal }>(listing: T) { return { ...listing, price: listing.price.toFixed(2) }; }
  async platformList(query: PlatformListingListDto) {
    const where: Prisma.SupplierListingWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { product: { name: { contains: query.search, mode: "insensitive" } } },
        { product: { slug: { contains: query.search, mode: "insensitive" } } },
        { productVariant: { name: { contains: query.search, mode: "insensitive" } } },
        { supplier: { displayName: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
    const [total, listings] = await this.prisma.$transaction([
      this.prisma.supplierListing.count({ where }),
      this.prisma.supplierListing.findMany({
        where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          product: { select: { id: true, name: true, slug: true } },
          productVariant: { select: { id: true, name: true } },
          supplier: { select: { id: true, displayName: true } },
          inventoryItems: { select: { onHand: true, reserved: true } },
        },
      }),
    ]);
    return {
      data: listings.map(({ inventoryItems, supplier, product, productVariant, ...listing }) => ({
        id: listing.id, product, productVariant, supplier: { id: supplier.id, displayName: supplier.displayName },
        price: listing.price.toFixed(2), currencyCode: listing.currencyCode, status: listing.status,
        origin: listing.origin, deliveryMinDays: listing.deliveryMinDays, deliveryMaxDays: listing.deliveryMaxDays,
        availability: listing.origin === ListingOrigin.OVERSEAS
          ? (listing.overseasOrderable > listing.overseasReserved + listing.overseasCommitted ? "AVAILABLE_TO_ORDER" : "OUT_OF_STOCK")
          : (inventoryItems.some(item => item.onHand > item.reserved) ? "IN_STOCK" : "OUT_OF_STOCK"),
        createdAt: listing.createdAt, updatedAt: listing.updatedAt,
      })),
      page: query.page, limit: query.limit, total,
    };
  }
  async list(userId: string, organizationId: string, query: SupplierListingListDto) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.read");
    const [total, listings] = await this.prisma.$transaction([this.prisma.supplierListing.count({ where: { supplierId: supplier.id } }), this.prisma.supplierListing.findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: "asc" }, skip: (query.page - 1) * query.limit, take: query.limit, include: { product: true, productVariant: true } })]);
    return { data: listings.map((listing) => this.response(listing)), page: query.page, limit: query.limit, total };
  }
  async productSelection(userId: string, organizationId: string, query: SupplierProductSelectionDto) {
    await this.supplierForOrganization(userId, organizationId, "catalogue.listings.create");
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      category: { status: "ACTIVE" },
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { brand: { contains: query.search, mode: "insensitive" } }, { slug: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy: { createdAt: "asc" }, skip: (query.page - 1) * query.limit, take: query.limit, include: { category: { select: { name: true } }, variants: { where: { status: ProductVariantStatus.ACTIVE }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, sku: true, attributes: true } }, media: { where: { mediaType: "IMAGE", url: { not: null } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { url: true, altText: true } } } }),
    ]);
    return { data: products.map(product => ({ id: product.id, name: product.name, slug: product.slug, brand: product.brand, category: product.category.name, image: product.media[0]?.url ? { url: product.media[0].url, altText: product.media[0].altText ?? product.name } : null, variants: product.variants })), page: query.page, limit: query.limit, total };
  }
  async get(userId: string, organizationId: string, listingId: string) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.read");
    const listing = await this.prisma.supplierListing.findFirst({ where: { id: listingId, supplierId: supplier.id }, include: { product: true, productVariant: true } });
    if (!listing) throw new NotFoundException("Supplier listing not found");
    return this.response(listing);
  }
  async create(userId: string, organizationId: string, dto: CreateSupplierListingDto) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.create");
    const { product } = await this.productAndVariant(dto.productId, dto.productVariantId);
    try {
      const listing = await this.prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, productVariantId: dto.productVariantId, supplierSku: dto.supplierSku?.trim() || null, titleOverride: dto.titleOverride?.trim() || null, descriptionOverride: dto.descriptionOverride?.trim() || null, price: this.price(dto.price), currencyCode: dto.currencyCode, warrantyDays: dto.warrantyDays, status: SupplierListingStatus.DRAFT, ...this.overseasFields(supplier, dto.origin ?? ListingOrigin.LOCAL, dto.deliveryMinDays, dto.deliveryMaxDays, dto.overseasOrderable ?? 0) }, include: { product: true, productVariant: true } });
      return this.response(listing);
    } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Supplier already has an offer for this product and variant"); throw error; }
  }
  async update(userId: string, organizationId: string, listingId: string, dto: UpdateSupplierListingDto) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.update");
    const existing = await this.prisma.supplierListing.findFirst({ where: { id: listingId, supplierId: supplier.id } });
    if (!existing) throw new NotFoundException("Supplier listing not found");
    const requestedOrigin = dto.origin ?? existing.origin;
    if (requestedOrigin === ListingOrigin.LOCAL &&
      (existing.overseasReserved > 0 || existing.overseasCommitted > 0))
      throw new ConflictException("Overseas commitments exist; keep this listing overseas or create a separate local offer");
    if (requestedOrigin === ListingOrigin.OVERSEAS &&
      (dto.overseasOrderable ?? existing.overseasOrderable) < existing.overseasReserved + existing.overseasCommitted)
      throw new ConflictException("Orderable quantity cannot be less than already reserved or paid units");
    const listing = await this.prisma.supplierListing.update({ where: { id: existing.id }, data: { ...(dto.supplierSku !== undefined ? { supplierSku: dto.supplierSku.trim() || null } : {}), ...(dto.titleOverride !== undefined ? { titleOverride: dto.titleOverride.trim() || null } : {}), ...(dto.descriptionOverride !== undefined ? { descriptionOverride: dto.descriptionOverride.trim() || null } : {}), ...(dto.price !== undefined ? { price: this.price(dto.price) } : {}), ...(dto.currencyCode !== undefined ? { currencyCode: dto.currencyCode } : {}), ...(dto.warrantyDays !== undefined ? { warrantyDays: dto.warrantyDays } : {}),
      ...(dto.origin !== undefined || dto.deliveryMinDays !== undefined || dto.deliveryMaxDays !== undefined || dto.overseasOrderable !== undefined
        ? this.overseasFields(supplier, dto.origin ?? existing.origin,
            requestedOrigin === ListingOrigin.LOCAL ? null : dto.deliveryMinDays !== undefined ? dto.deliveryMinDays : existing.deliveryMinDays,
            requestedOrigin === ListingOrigin.LOCAL ? null : dto.deliveryMaxDays !== undefined ? dto.deliveryMaxDays : existing.deliveryMaxDays,
            requestedOrigin === ListingOrigin.LOCAL ? 0 : dto.overseasOrderable !== undefined ? dto.overseasOrderable : existing.overseasOrderable) : {}) }, include: { product: true, productVariant: true } });
    return this.response(listing);
  }
  private async eligibleForActivation(id: string) {
    const listing = await this.prisma.supplierListing.findUnique({ where: { id }, include: { supplier: true, product: true, productVariant: true } });
    if (!listing) throw new NotFoundException("Supplier listing not found");
    if (listing.supplier.status !== SupplierStatus.ACTIVE) throw new ConflictException("Only active suppliers can activate listings");
    if (listing.origin === ListingOrigin.OVERSEAS && !listing.supplier.overseasEnabled) throw new ConflictException("Overseas shipping not authorized");
    if (listing.origin === ListingOrigin.OVERSEAS && listing.overseasOrderable <= listing.overseasReserved + listing.overseasCommitted) throw new ConflictException("Overseas orderable capacity is exhausted");
    if (listing.product.status !== ProductStatus.ACTIVE) throw new ConflictException("Only active products can back active listings");
    if (listing.productVariant && listing.productVariant.status !== ProductVariantStatus.ACTIVE) throw new ConflictException("Only active variants can back active listings");
    if (!listing.price.greaterThan(0) || !/^[A-Z]{3}$/.test(listing.currencyCode)) throw new ConflictException("Listing price or currency is invalid");
    return listing;
  }
  async activate(userId: string, organizationId: string, listingId: string) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.activate");
    const own = await this.prisma.supplierListing.findFirst({ where: { id: listingId, supplierId: supplier.id }, select: { id: true } }); if (!own) throw new NotFoundException("Supplier listing not found");
    const eligible = await this.eligibleForActivation(listingId);
    if (eligible.status !== SupplierListingStatus.DRAFT && eligible.status !== SupplierListingStatus.INACTIVE) throw new ConflictException("Listing cannot be activated from its current status");
    return this.response(await this.prisma.supplierListing.update({ where: { id: listingId }, data: { status: SupplierListingStatus.ACTIVE }, include: { product: true, productVariant: true } }));
  }
  async deactivate(userId: string, organizationId: string, listingId: string) {
    const supplier = await this.supplierForOrganization(userId, organizationId, "catalogue.listings.activate");
    const listing = await this.prisma.supplierListing.findFirst({ where: { id: listingId, supplierId: supplier.id } });
    if (!listing) throw new NotFoundException("Supplier listing not found");
    if (listing.status !== SupplierListingStatus.ACTIVE) throw new ConflictException("Only active listings can be deactivated");
    return this.response(await this.prisma.supplierListing.update({ where: { id: listing.id }, data: { status: SupplierListingStatus.INACTIVE }, include: { product: true, productVariant: true } }));
  }
}
