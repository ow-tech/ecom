import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";

import { validateEnvironment } from "./config/environment.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { RbacModule } from "./rbac/rbac.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { SupplierListingsModule } from "./supplier-listings/supplier-listings.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CustomerModule } from "./customer/customer.module";
import { CartModule } from "./cart/cart.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./payments/payments.module";
import { PickupPointsModule } from "./pickup-points/pickup-points.module";
import { DeliveryModule } from "./delivery/delivery.module";
import { FulfilmentModule } from "./fulfilment/fulfilment.module";
import { RefundsModule } from "./refunds/refunds.module";
import { FinanceModule } from "./finance/finance.module";
import { PostOrderModule } from "./post-order/post-order.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OperationsModule } from "./operations/operations.module";
import { SupportModule } from "./support/support.module";
import { AuditModule } from "./audit/audit.module";
import { PublicCatalogueModule } from "./catalogue/public-catalogue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolve from this module so both workspace-root and backend-local launches prefer backend/.env.
      envFilePath: [resolve(__dirname, "..", ".env"), resolve(__dirname, "../../..", ".env")],
      validate: validateEnvironment,
    }),
    PrismaModule, RbacModule, AuthModule, OrganizationsModule, SuppliersModule, CategoriesModule, ProductsModule, PublicCatalogueModule, SupplierListingsModule, InventoryModule, CustomerModule, CartModule, PickupPointsModule, DeliveryModule, CheckoutModule, OrdersModule, PaymentsModule, FinanceModule, RefundsModule, PostOrderModule, FulfilmentModule, NotificationsModule, OperationsModule, SupportModule, AuditModule, HealthModule,
  ],
})
export class AppModule {}
