import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { RbacService } from "../rbac/rbac.service";
import { LifecycleReasonDto, PlatformSupplierListDto } from "./dto/supplier.dto";
import { SuppliersService } from "./suppliers.service";

@UseGuards(SessionAuthGuard)
@Controller("platform/suppliers")
export class PlatformSuppliersController {
  constructor(private readonly suppliers: SuppliersService, private readonly rbac: RbacService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PlatformSupplierListDto) { await this.rbac.requirePlatform(user.id, "platform.suppliers.read"); return this.suppliers.platformList(query); }
  @Get(":supplierId") async get(@CurrentUser() user: AuthenticatedUser, @Param("supplierId") supplierId: string) { await this.rbac.requirePlatform(user.id, "platform.suppliers.read"); return this.suppliers.platformGet(supplierId); }
  @Post(":supplierId/approve") async approve(@CurrentUser() user: AuthenticatedUser, @Param("supplierId") supplierId: string) { await this.rbac.requirePlatform(user.id, "platform.suppliers.approve"); return this.suppliers.approve(user.id, supplierId); }
  @Post(":supplierId/reject") async reject(@CurrentUser() user: AuthenticatedUser, @Param("supplierId") supplierId: string, @Body() dto: LifecycleReasonDto) { await this.rbac.requirePlatform(user.id, "platform.suppliers.review"); return this.suppliers.reject(user.id, supplierId, dto.reason); }
  @Post(":supplierId/suspend") async suspend(@CurrentUser() user: AuthenticatedUser, @Param("supplierId") supplierId: string, @Body() dto: LifecycleReasonDto) { await this.rbac.requirePlatform(user.id, "platform.suppliers.suspend"); return this.suppliers.suspend(user.id, supplierId, dto.reason); }
  @Post(":supplierId/reactivate") async reactivate(@CurrentUser() user: AuthenticatedUser, @Param("supplierId") supplierId: string) { await this.rbac.requirePlatform(user.id, "platform.suppliers.suspend"); return this.suppliers.reactivate(user.id, supplierId); }
}
