import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CartModule } from "../cart/cart.module";
import { CustomerModule } from "../customer/customer.module";
import { InventoryModule } from "../inventory/inventory.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { PickupPointsModule } from "../pickup-points/pickup-points.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { OperationsModule } from "../operations/operations.module";

@Module({ imports: [AuthModule, CustomerModule, CartModule, InventoryModule, DeliveryModule, PickupPointsModule, OperationsModule], controllers: [CheckoutController], providers: [CheckoutService] })
export class CheckoutModule {}
