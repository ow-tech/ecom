import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerModule } from "../customer/customer.module";
import { RbacModule } from "../rbac/rbac.module";
import { RefundsModule } from "../refunds/refunds.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../audit/audit.module";
import { CustomerPostOrderController, PlatformPostOrderController, SupplierPostOrderController } from "./post-order.controller";
import { PostOrderService } from "./post-order.service";
@Module({ imports: [AuthModule, CustomerModule, RbacModule, RefundsModule, OperationsModule, AuditModule], controllers: [CustomerPostOrderController, SupplierPostOrderController, PlatformPostOrderController], providers: [PostOrderService] }) export class PostOrderModule {}
