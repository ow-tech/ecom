import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CategoryStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

const normalizeSlug = (value: string): string => {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ConflictException("Category slug is invalid");
  return slug;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertParent(categoryId: string | undefined, parentId: string | undefined): Promise<void> {
    if (!parentId) return;
    if (categoryId === parentId) throw new ConflictException("A category cannot parent itself");
    let cursor = await this.prisma.category.findUnique({ where: { id: parentId }, select: { id: true, parentId: true } });
    if (!cursor) throw new NotFoundException("Parent category not found");
    while (cursor) {
      if (cursor.id === categoryId) throw new ConflictException("Category parent would create a cycle");
      cursor = cursor.parentId ? await this.prisma.category.findUnique({ where: { id: cursor.parentId }, select: { id: true, parentId: true } }) : null;
    }
  }

  async list() { return this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }); }
  async get(id: string) { const category = await this.prisma.category.findUnique({ where: { id } }); if (!category) throw new NotFoundException("Category not found"); return category; }
  async create(dto: CreateCategoryDto) {
    await this.assertParent(undefined, dto.parentId);
    try { return await this.prisma.category.create({ data: { name: dto.name.trim(), slug: normalizeSlug(dto.slug), description: dto.description?.trim() || null, parentId: dto.parentId, status: dto.status ?? CategoryStatus.ACTIVE, sortOrder: dto.sortOrder ?? 0 } }); }
    catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Category slug is already in use"); throw error; }
  }
  async update(id: string, dto: UpdateCategoryDto) {
    await this.get(id);
    if (dto.parentId !== undefined) await this.assertParent(id, dto.parentId);
    return this.prisma.category.update({ where: { id }, data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}), ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}), ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}) } });
  }
}
