import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerModule } from "../customer/customer.module";
import { InventoryModule } from "../inventory/inventory.module";
import { RbacModule } from "../rbac/rbac.module";
import { CustomerOrdersController, PlatformOrdersController, SupplierOrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OperationsModule } from "../operations/operations.module";

@Module({ imports: [AuthModule, CustomerModule, InventoryModule, RbacModule, OperationsModule], controllers: [CustomerOrdersController, SupplierOrdersController, PlatformOrdersController], providers: [OrdersService] })
export class OrdersModule {}
