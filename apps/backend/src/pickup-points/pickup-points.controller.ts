import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreatePickupPointDto, UpdatePickupPointDto } from "./dto/pickup-point.dto";
import { PickupPointsService } from "./pickup-points.service";

@Controller("pickup-points") export class PublicPickupPointsController { constructor(private readonly service: PickupPointsService) {} @Get() list(@Query("countryCode") country?: string, @Query("region") region?: string, @Query("city") city?: string) { return this.service.publicList(country, region, city); } }
@UseGuards(SessionAuthGuard) @Controller("platform/pickup-points")
export class PlatformPickupPointsController {
  constructor(private readonly service: PickupPointsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.service.list(user.id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePickupPointDto) { return this.service.create(user.id, dto); }
  @Get(":pickupPointId") get(@CurrentUser() user: AuthenticatedUser, @Param("pickupPointId") id: string) { return this.service.get(user.id, id); }
  @Patch(":pickupPointId") update(@CurrentUser() user: AuthenticatedUser, @Param("pickupPointId") id: string, @Body() dto: UpdatePickupPointDto) { return this.service.update(user.id, id, dto); }
}
