import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CheckoutService } from "./checkout.service";
import { PrepareCheckoutDto } from "./dto/checkout.dto";

@UseGuards(SessionAuthGuard)
@Controller("customer/checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}
  @Post("preview") preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PrepareCheckoutDto) { return this.checkout.preview(user.id, dto); }
  @Post("prepare") prepare(@CurrentUser() user: AuthenticatedUser, @Headers("idempotency-key") key: string | undefined, @Body() dto: PrepareCheckoutDto) { return this.checkout.prepare(user.id, key, dto); }
}
