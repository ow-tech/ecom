import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateSupplierListingDto, PlatformListingListDto, SupplierListingListDto, SupplierProductSelectionDto, UpdateSupplierListingDto } from "./dto/supplier-listing.dto";
import { RbacService } from "../rbac/rbac.service";
import { SupplierListingsService } from "./supplier-listings.service";

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/listings")
export class SupplierListingsController {
  constructor(private readonly listings: SupplierListingsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Query() query: SupplierListingListDto) { return this.listings.list(user.id, organizationId, query); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Body() dto: CreateSupplierListingDto) { return this.listings.create(user.id, organizationId, dto); }
  @Get("products/selection") selection(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Query() query: SupplierProductSelectionDto) { return this.listings.productSelection(user.id, organizationId, query); }
  @Get(":listingId") get(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Param("listingId") listingId: string) { return this.listings.get(user.id, organizationId, listingId); }
  @Patch(":listingId") update(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Param("listingId") listingId: string, @Body() dto: UpdateSupplierListingDto) { return this.listings.update(user.id, organizationId, listingId, dto); }
  @Post(":listingId/activate") activate(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Param("listingId") listingId: string) { return this.listings.activate(user.id, organizationId, listingId); }
  @Post(":listingId/deactivate") deactivate(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Param("listingId") listingId: string) { return this.listings.deactivate(user.id, organizationId, listingId); }
}

@UseGuards(SessionAuthGuard)
@Controller("platform/listings")
export class PlatformListingsController {
  constructor(private readonly listings: SupplierListingsService, private readonly rbac: RbacService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PlatformListingListDto) { await this.rbac.requirePlatform(user.id, "platform.products.read"); return this.listings.platformList(query); }
}
