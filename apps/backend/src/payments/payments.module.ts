import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerModule } from "../customer/customer.module";
import { InventoryModule } from "../inventory/inventory.module";
import { RbacModule } from "../rbac/rbac.module";
import { PaymentBindingService } from "./payment-binding.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import { CustomerPaymentsController, PaystackWebhookController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PlatformPaymentsController } from "./platform-payments.controller";
import { PlatformPaymentsService } from "./platform-payments.service";
import { PaystackClient } from "./paystack/paystack.client";
import { PaystackSignatureService } from "./paystack/paystack-signature.service";
import { ReservationExpiryService } from "./reservation-expiry.service";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuthModule, CustomerModule, InventoryModule, RbacModule, OperationsModule, AuditModule],
  controllers: [CustomerPaymentsController, PaystackWebhookController, PlatformPaymentsController],
  providers: [PaystackClient, PaystackSignatureService, PaymentBindingService, PaymentSettlementService, PaymentReconciliationService, ReservationExpiryService, PaymentsService, PlatformPaymentsService],
  exports: [PaystackClient, PaymentSettlementService, PaymentReconciliationService, ReservationExpiryService],
})
export class PaymentsModule {}
