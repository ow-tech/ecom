import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { RbacService } from "../rbac/rbac.service";
import { CreateProductDto, CreateProductMediaDto, CreateVariantDto, ProductListDto, UpdateProductDto, UpdateProductMediaDto, UpdateVariantDto } from "./dto/product.dto";
import { ProductsService } from "./products.service";

@UseGuards(SessionAuthGuard)
@Controller("platform/products")
export class ProductsController {
  constructor(private readonly products: ProductsService, private readonly rbac: RbacService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ProductListDto) { await this.rbac.requirePlatform(user.id, "platform.products.read"); return this.products.list(query); }
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.create(dto); }
  @Get(":productId") async get(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string) { await this.rbac.requirePlatform(user.id, "platform.products.read"); return this.products.get(productId); }
  @Patch(":productId") async update(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string, @Body() dto: UpdateProductDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.update(user.id, productId, dto); }
  @Get(":productId/variants") async variants(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string) { await this.rbac.requirePlatform(user.id, "platform.products.read"); return this.products.variants(productId); }
  @Post(":productId/variants") async createVariant(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string, @Body() dto: CreateVariantDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.createVariant(productId, dto); }
  @Patch(":productId/variants/:variantId") async updateVariant(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string, @Param("variantId") variantId: string, @Body() dto: UpdateVariantDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.updateVariant(productId, variantId, dto); }
  @Get(":productId/media") async media(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string) { await this.rbac.requirePlatform(user.id, "platform.products.read"); return this.products.media(productId); }
  @Post(":productId/media") async createMedia(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string, @Body() dto: CreateProductMediaDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.createMedia(productId, dto); }
  @Patch(":productId/media/:mediaId") async updateMedia(@CurrentUser() user: AuthenticatedUser, @Param("productId") productId: string, @Param("mediaId") mediaId: string, @Body() dto: UpdateProductMediaDto) { await this.rbac.requirePlatform(user.id, "platform.products.manage"); return this.products.updateMedia(productId, mediaId, dto); }
}
