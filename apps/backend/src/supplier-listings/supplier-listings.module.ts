import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformListingsController, SupplierListingsController } from "./supplier-listings.controller";
import { SupplierListingsService } from "./supplier-listings.service";
@Module({ imports: [AuthModule], controllers: [SupplierListingsController, PlatformListingsController], providers: [SupplierListingsService] })
export class SupplierListingsModule {}
