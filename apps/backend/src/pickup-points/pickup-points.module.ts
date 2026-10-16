import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../rbac/rbac.module";
import { PlatformPickupPointsController, PublicPickupPointsController } from "./pickup-points.controller";
import { PickupPointsService } from "./pickup-points.service";
@Module({ imports: [AuthModule, RbacModule], controllers: [PublicPickupPointsController, PlatformPickupPointsController], providers: [PickupPointsService], exports: [PickupPointsService] }) export class PickupPointsModule {}
