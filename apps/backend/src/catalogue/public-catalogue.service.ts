import { Injectable, NotFoundException } from "@nestjs/common";
import { CategoryStatus, Prisma, ProductStatus, ProductVariantStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PublicCatalogueListDto, PublicCatalogueProductListDto } from "./dto/public-catalogue.dto";

const publicListingInclude = {
  product: {
    include: {
      category: true,
      media: { where: { mediaType: "IMAGE" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1 },
    },
  },
  productVariant: true,
  supplier: { select: { overseasEnabled: true } },
  inventoryItems: {
    where: { inventoryLocation: { status: "ACTIVE" } },
    select: { onHand: true, reserved: true },
  },
} satisfies Prisma.SupplierListingInclude;

type PublicListing = Prisma.SupplierListingGetPayload<{ include: typeof publicListingInclude }>;

const publicProductInclude = {
  category: true,
  media: { where: { mediaType: "IMAGE", url: { not: null } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
  variants: { where: { status: ProductVariantStatus.ACTIVE }, orderBy: { createdAt: "asc" } },
  listings: {
    where: {
      status: SupplierListingStatus.ACTIVE,
      supplier: { status: SupplierStatus.ACTIVE },
      OR: [{ productVariantId: null }, { productVariant: { status: ProductVariantStatus.ACTIVE } }],
    },
    include: {
      productVariant: true,
      supplier: { select: { slug: true, displayName: true, overseasEnabled: true } },
      inventoryItems: { where: { inventoryLocation: { status: "ACTIVE" } }, select: { onHand: true, reserved: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type PublicProduct = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>;

@Injectable()
export class PublicCatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  private isAvailable(listing: PublicListing): boolean {
    return listing.origin === "OVERSEAS"
      ? listing.supplier.overseasEnabled && listing.overseasOrderable > listing.overseasReserved + listing.overseasCommitted
      : listing.inventoryItems.some(item => item.onHand > item.reserved);
  }

  private project(listing: PublicListing) {
    const image = listing.product.media[0];
    return {
      id: listing.id,
      title: listing.titleOverride ?? listing.product.name,
      description: listing.descriptionOverride ?? listing.product.description,
      brand: listing.product.brand,
      price: listing.price.toFixed(2),
      origin: listing.origin, deliveryMinDays: listing.deliveryMinDays, deliveryMaxDays: listing.deliveryMaxDays,
      currencyCode: listing.currencyCode,
      availableQuantity: listing.origin === "OVERSEAS" ? listing.overseasOrderable - listing.overseasReserved - listing.overseasCommitted : listing.inventoryItems.reduce((total, item) => total + item.onHand - item.reserved, 0),
      product: {
        id: listing.product.id,
        slug: listing.product.slug,
        name: listing.product.name,
        category: { id: listing.product.category.id, name: listing.product.category.name, slug: listing.product.category.slug },
      },
      variant: listing.productVariant ? { id: listing.productVariant.id, name: listing.productVariant.name, attributes: listing.productVariant.attributes } : null,
      image: image?.url ? { url: image.url, altText: image.altText ?? listing.titleOverride ?? listing.product.name } : null,
    };
  }

  private productAvailableListings(product: PublicProduct) {
    return product.listings.filter(listing => listing.origin === "OVERSEAS"
      ? listing.supplier.overseasEnabled && listing.overseasOrderable > listing.overseasReserved + listing.overseasCommitted
      : listing.inventoryItems.some(item => item.onHand > item.reserved));
  }

  private projectOffer(listing: PublicProduct["listings"][number]) {
    return {
      id: listing.id,
      price: listing.price.toFixed(2),
      currencyCode: listing.currencyCode,
      variantId: listing.productVariantId,
      variant: listing.productVariant ? { id: listing.productVariant.id, name: listing.productVariant.name, attributes: listing.productVariant.attributes } : null,
      availability: "IN_STOCK" as const,
      origin: listing.origin, deliveryMinDays: listing.deliveryMinDays, deliveryMaxDays: listing.deliveryMaxDays,
      supplier: { slug: listing.supplier.slug, name: listing.supplier.displayName },
    };
  }

  private projectProduct(product: PublicProduct, detail = false) {
    const offers = this.productAvailableListings(product).map(listing => this.projectOffer(listing));
    const media = product.media.map(item => ({ id: item.id, url: item.url!, altText: item.altText ?? product.name }));
    const common = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
      image: media[0] ?? null,
      offerCount: offers.length,
      offers,
    };
    if (!detail) return common;
    return {
      ...common,
      description: product.description,
      media,
      variants: product.variants.map(variant => ({ id: variant.id, name: variant.name, attributes: variant.attributes })),
    };
  }

  private where(query?: PublicCatalogueListDto): Prisma.SupplierListingWhereInput {
    return {
      status: SupplierListingStatus.ACTIVE,
      supplier: { status: SupplierStatus.ACTIVE },
      product: {
        status: ProductStatus.ACTIVE,
        category: { status: CategoryStatus.ACTIVE },
        ...(query?.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query?.search ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { brand: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } },
          ],
        } : {}),
      },
      OR: [{ productVariantId: null }, { productVariant: { status: ProductVariantStatus.ACTIVE } }],
    };
  }

  async categories() {
    return this.prisma.category.findMany({
      where: { status: CategoryStatus.ACTIVE },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, description: true, parentId: true },
    });
  }

  async category(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, status: CategoryStatus.ACTIVE },
      select: { id: true, name: true, slug: true, description: true, parentId: true },
    });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  async products(query: PublicCatalogueProductListDto) {
    const listingWhere: Prisma.SupplierListingWhereInput = {
      status: SupplierListingStatus.ACTIVE,
      supplier: { status: SupplierStatus.ACTIVE, ...(query.supplier ? { slug: query.supplier } : {}) },
      OR: [{ productVariantId: null }, { productVariant: { status: ProductVariantStatus.ACTIVE } }],
      ...(query.currency ? { currencyCode: query.currency } : {}),
      ...((query.minPrice || query.maxPrice) ? { price: { ...(query.minPrice ? { gte: new Prisma.Decimal(query.minPrice) } : {}), ...(query.maxPrice ? { lte: new Prisma.Decimal(query.maxPrice) } : {}) } } : {}),
    };
    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        category: { status: CategoryStatus.ACTIVE, ...(query.category ? { slug: query.category } : {}) },
        ...(query.search ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { brand: { contains: query.search, mode: "insensitive" } },
            { slug: { contains: query.search, mode: "insensitive" } },
          ],
        } : {}),
        listings: { some: listingWhere },
      },
      include: { ...publicProductInclude, listings: { ...publicProductInclude.listings, where: listingWhere } },
    });
    const available = products.filter(product => this.productAvailableListings(product).length > 0);
    const compareName = (a: PublicProduct, b: PublicProduct) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    const priceFor = (product: PublicProduct) => Math.min(...this.productAvailableListings(product).map(listing => Number(listing.price)));
    available.sort((a, b) => {
      if (query.sort === "name-asc" || query.sort === "relevance" && query.search) return compareName(a, b);
      if (query.sort === "price-asc") return priceFor(a) - priceFor(b) || compareName(a, b);
      if (query.sort === "price-desc") return priceFor(b) - priceFor(a) || compareName(a, b);
      return b.createdAt.getTime() - a.createdAt.getTime() || compareName(a, b);
    });
    const start = (query.page - 1) * query.limit;
    const suppliers = new Map<string, string>(); const currencies = new Set<string>();
    available.forEach(product => this.productAvailableListings(product).forEach(listing => { suppliers.set(listing.supplier.slug, listing.supplier.displayName); currencies.add(listing.currencyCode); }));
    return { data: available.slice(start, start + query.limit).map(product => this.projectProduct(product)), page: query.page, limit: query.limit, total: available.length, filters: { suppliers: [...suppliers].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)), currencies: [...currencies].sort() } };
  }

  async product(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE, category: { status: CategoryStatus.ACTIVE } },
      include: publicProductInclude,
    });
    if (!product || this.productAvailableListings(product).length === 0) throw new NotFoundException("Catalogue product not found");
    return this.projectProduct(product, true);
  }

  async list(query: PublicCatalogueListDto) {
    const listings = await this.prisma.supplierListing.findMany({
      where: this.where(query),
      orderBy: [{ createdAt: "asc" }],
      include: publicListingInclude,
    });
    const available = listings.filter(listing => this.isAvailable(listing));
    const start = (query.page - 1) * query.limit;
    return { data: available.slice(start, start + query.limit).map(listing => this.project(listing)), page: query.page, limit: query.limit, total: available.length };
  }

  async get(listingId: string) {
    const listing = await this.prisma.supplierListing.findFirst({ where: { id: listingId, ...this.where() }, include: publicListingInclude });
    if (!listing || !this.isAvailable(listing)) throw new NotFoundException("Catalogue item not found");
    return this.project(listing);
  }
}
