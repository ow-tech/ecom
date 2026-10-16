import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { InventoryController, InventoryLocationsController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { AuditModule } from "../audit/audit.module";
@Module({ imports: [AuthModule, RbacModule, AuditModule], controllers: [InventoryController, InventoryLocationsController], providers: [InventoryService], exports: [InventoryService] })
export class InventoryModule {}
