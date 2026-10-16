import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { PaymentsService } from "./payments.service";
import { PaystackSignatureService } from "./paystack/paystack-signature.service";
import { PaystackWebhook } from "./paystack/paystack.types";
import { CheckoutPaymentMethod, InitializePaymentDto } from "./dto/payment.dto";

@UseGuards(SessionAuthGuard)
@Controller("customer/orders/:orderId")
export class CustomerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post("payments/initialize") initialize(@CurrentUser() user: AuthenticatedUser, @Param("orderId") orderId: string, @Headers("idempotency-key") key: string | undefined, @Body() dto: InitializePaymentDto) { return this.payments.initialize(user.id, orderId, key, dto.method ?? CheckoutPaymentMethod.CARD); }
  @Get("payment-status") status(@CurrentUser() user: AuthenticatedUser, @Param("orderId") orderId: string) { return this.payments.status(user.id, orderId); }
  @Post("payments/:paymentId/verify") verify(@CurrentUser() user: AuthenticatedUser, @Param("orderId") orderId: string, @Param("paymentId") paymentId: string) { return this.payments.verify(user.id, orderId, paymentId); }
}

@Controller("payments/paystack")
export class PaystackWebhookController {
  constructor(private readonly signature: PaystackSignatureService, private readonly payments: PaymentsService) {}
  @Post("webhook")
  webhook(@Req() request: RawBodyRequest<Request>, @Headers("x-paystack-signature") signature: string | undefined, @Body() body: PaystackWebhook) {
    if (!request.rawBody || !this.signature.verify(request.rawBody, signature)) throw new UnauthorizedException("Invalid Paystack signature");
    return this.payments.processWebhook(request.rawBody, body);
  }
}
