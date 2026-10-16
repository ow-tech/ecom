import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateSupplierDto, UpdateSupplierDto } from "./dto/supplier.dto";
import { SuppliersService } from "./suppliers.service";

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/supplier")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Body() dto: CreateSupplierDto) { return this.suppliers.create(user.id, organizationId, dto); }
  @Get() get(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) { return this.suppliers.get(user.id, organizationId); }
  @Get("overview") overview(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) { return this.suppliers.overview(user.id, organizationId); }
  @Patch() update(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Body() dto: UpdateSupplierDto) { return this.suppliers.update(user.id, organizationId, dto); }
  @Post("submit") submit(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) { return this.suppliers.submit(user.id, organizationId); }
}
