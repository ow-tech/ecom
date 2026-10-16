import { Body, Controller, Delete, Get, Header, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreatePayoutDestinationDto } from "./dto/payout-destination.dto";
import { PayoutDestinationsService } from "./payout-destinations.service";

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/finance/payout-destinations")
export class SupplierPayoutController {
  constructor(private readonly service: PayoutDestinationsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser, @Param("organizationId") org: string) { return this.service.supplierList(actor.id, org); }
  @Post() create(@CurrentUser() actor: AuthenticatedUser, @Param("organizationId") org: string, @Body() dto: CreatePayoutDestinationDto) { return this.service.supplierCreate(actor.id, org, dto); }
  @Delete(":id") disable(@CurrentUser() actor: AuthenticatedUser, @Param("organizationId") org: string, @Param("id") id: string) { return this.service.supplierDisable(actor.id, org, id); }
}

@UseGuards(SessionAuthGuard)
@Controller("platform/finance/suppliers/:supplierId/payout-destinations")
export class PlatformPayoutController {
  constructor(private readonly service: PayoutDestinationsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser, @Param("supplierId") id: string) { return this.service.platformList(actor.id, id); }
  // Explicit user action and no-store response; reveal is separately audited.
  @Post(":destinationId/reveal") @Header("Cache-Control", "no-store")
  reveal(@CurrentUser() actor: AuthenticatedUser, @Param("supplierId") id: string, @Param("destinationId") destinationId: string) { return this.service.platformReveal(actor.id, id, destinationId); }
}
