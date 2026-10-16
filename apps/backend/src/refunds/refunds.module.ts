import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerModule } from "../customer/customer.module";
import { PaymentsModule } from "../payments/payments.module";
import { RbacModule } from "../rbac/rbac.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../audit/audit.module";
import { CustomerRefundsController, PlatformRefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({ imports: [AuthModule, CustomerModule, PaymentsModule, RbacModule, OperationsModule, AuditModule], controllers: [CustomerRefundsController, PlatformRefundsController], providers: [RefundsService], exports: [RefundsService] })
export class RefundsModule {}
