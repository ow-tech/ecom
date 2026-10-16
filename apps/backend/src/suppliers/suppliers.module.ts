import { OverseasSupplierCapabilityService } from "./overseas-supplier-capability.service";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformSuppliersController } from "./platform-suppliers.controller";
import { SupplierLifecycleService } from "./supplier-lifecycle.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { SupplierReportsController } from "./supplier-reports.controller";
import { SupplierReportsService } from "./supplier-reports.service";
import { AuditModule } from "../audit/audit.module";

@Module({ imports: [AuthModule, AuditModule], controllers: [SuppliersController, PlatformSuppliersController, SupplierReportsController], providers: [SuppliersService, SupplierLifecycleService, SupplierReportsService, OverseasSupplierCapabilityService] })
export class SuppliersModule {}
