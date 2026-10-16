import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../rbac/rbac.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../audit/audit.module";
import { SupplierFinanceController, PlatformFinanceController } from "./finance.controller";
import { FinancePostingService } from "./finance-posting.service";
import { FinanceService } from "./finance.service";

@Module({ imports: [AuthModule, RbacModule, OperationsModule, AuditModule], controllers: [SupplierFinanceController, PlatformFinanceController], providers: [FinanceService, FinancePostingService], exports: [FinancePostingService] })
export class FinanceModule {}
