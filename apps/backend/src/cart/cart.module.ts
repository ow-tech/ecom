import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommercialAvailabilityService } from "../commerce/commercial-availability.service";
import { CustomerModule } from "../customer/customer.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({ imports: [AuthModule, CustomerModule], controllers: [CartController], providers: [CartService, CommercialAvailabilityService], exports: [CartService, CommercialAvailabilityService] })
export class CartModule {}
