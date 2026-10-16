import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProductStatus, ProductVariantStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto, CreateProductMediaDto, CreateVariantDto, ProductListDto, UpdateProductDto, UpdateProductMediaDto, UpdateVariantDto } from "./dto/product.dto";
import { AuditService } from "../audit/audit.service";

const normalizeSlug = (value: string): string => {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 220 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ConflictException("Product slug is invalid");
  return slug;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private attributes(value: Record<string, unknown>): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
  private async category(categoryId: string) { const category = await this.prisma.category.findUnique({ where: { id: categoryId } }); if (!category) throw new NotFoundException("Category not found"); return category; }
  async get(id: string) { const product = await this.prisma.product.findUnique({ where: { id }, include: { category: true } }); if (!product) throw new NotFoundException("Product not found"); return product; }
  async list(query: ProductListDto) {
    const where: Prisma.ProductWhereInput = { ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { brand: { contains: query.search, mode: "insensitive" } }, { slug: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const [total, data] = await this.prisma.$transaction([this.prisma.product.count({ where }), this.prisma.product.findMany({ where, orderBy: { createdAt: "asc" }, skip: (query.page - 1) * query.limit, take: query.limit, include: { category: true } })]);
    return { data, page: query.page, limit: query.limit, total };
  }
  async create(dto: CreateProductDto) {
    await this.category(dto.categoryId);
    try { return await this.prisma.product.create({ data: { categoryId: dto.categoryId, name: dto.name.trim(), slug: normalizeSlug(dto.slug), brand: dto.brand?.trim() || null, description: dto.description?.trim() || null, status: dto.status ?? ProductStatus.DRAFT }, include: { category: true } }); }
    catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Product slug is already in use"); throw error; }
  }
  async update(actorUserId: string, id: string, dto: UpdateProductDto) {
    await this.get(id); if (dto.categoryId) await this.category(dto.categoryId);
    return this.prisma.$transaction(async tx => { const product = await tx.product.update({ where: { id }, data: { ...(dto.categoryId ? { categoryId: dto.categoryId } : {}), ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.brand !== undefined ? { brand: dto.brand.trim() || null } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}) }, include: { category: true } }); await this.audit.emitInTransaction(tx, { actorUserId, action: "PRODUCT_UPDATED", entityType: "PRODUCT", entityId: id, dedupeKey: `product:${id}:updated:${product.updatedAt.getTime()}`, metadata: { changedFields: Object.keys(dto) } }); return product; });
  }
  async variants(productId: string) { await this.get(productId); return this.prisma.productVariant.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }); }
  async createVariant(productId: string, dto: CreateVariantDto) {
    await this.get(productId);
    try { return await this.prisma.productVariant.create({ data: { productId, name: dto.name.trim(), sku: dto.sku?.trim() || null, attributes: this.attributes(dto.attributes), status: dto.status ?? ProductVariantStatus.ACTIVE } }); }
    catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Product variant SKU is already in use"); throw error; }
  }
  async updateVariant(productId: string, variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, productId } }); if (!variant) throw new NotFoundException("Product variant not found");
    try { return await this.prisma.productVariant.update({ where: { id: variantId }, data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.sku !== undefined ? { sku: dto.sku.trim() || null } : {}), ...(dto.attributes !== undefined ? { attributes: this.attributes(dto.attributes) } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}) } }); }
    catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Product variant SKU is already in use"); throw error; }
  }
  async media(productId: string) { await this.get(productId); return this.prisma.productMedia.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }); }
  async createMedia(productId: string, dto: CreateProductMediaDto) {
    await this.get(productId);
    if (dto.productVariantId) { const variant = await this.prisma.productVariant.findFirst({ where: { id: dto.productVariantId, productId } }); if (!variant) throw new ConflictException("Media variant must belong to product"); }
    return this.prisma.productMedia.create({ data: { productId, productVariantId: dto.productVariantId, storageKey: dto.storageKey.trim(), url: dto.url?.trim() || null, altText: dto.altText?.trim() || null, sortOrder: dto.sortOrder ?? 0, mediaType: dto.mediaType ?? "IMAGE" } });
  }
  async updateMedia(productId: string, mediaId: string, dto: UpdateProductMediaDto) {
    const media = await this.prisma.productMedia.findFirst({ where: { id: mediaId, productId } }); if (!media) throw new NotFoundException("Product media not found");
    return this.prisma.productMedia.update({ where: { id: mediaId }, data: { ...(dto.storageKey !== undefined ? { storageKey: dto.storageKey.trim() } : {}), ...(dto.url !== undefined ? { url: dto.url.trim() || null } : {}), ...(dto.altText !== undefined ? { altText: dto.altText.trim() || null } : {}), ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}), ...(dto.mediaType !== undefined ? { mediaType: dto.mediaType } : {}) } });
  }
}
