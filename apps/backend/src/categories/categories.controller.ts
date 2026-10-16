import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { RbacService } from "../rbac/rbac.service";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@UseGuards(SessionAuthGuard)
@Controller("platform/categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService, private readonly rbac: RbacService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser) { await this.rbac.requirePlatform(user.id, "platform.categories.read"); return this.categories.list(); }
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) { await this.rbac.requirePlatform(user.id, "platform.categories.manage"); return this.categories.create(dto); }
  @Get(":categoryId") async get(@CurrentUser() user: AuthenticatedUser, @Param("categoryId") categoryId: string) { await this.rbac.requirePlatform(user.id, "platform.categories.read"); return this.categories.get(categoryId); }
  @Patch(":categoryId") async update(@CurrentUser() user: AuthenticatedUser, @Param("categoryId") categoryId: string, @Body() dto: UpdateCategoryDto) { await this.rbac.requirePlatform(user.id, "platform.categories.manage"); return this.categories.update(categoryId, dto); }
}
