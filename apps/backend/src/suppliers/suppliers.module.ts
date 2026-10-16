import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformSuppliersController } from "./platform-suppliers.controller";
import { SupplierLifecycleService } from "./supplier-lifecycle.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { AuditModule } from "../audit/audit.module";

@Module({ imports: [AuthModule, AuditModule], controllers: [SuppliersController, PlatformSuppliersController], providers: [SuppliersService, SupplierLifecycleService] })
export class SuppliersModule {}
