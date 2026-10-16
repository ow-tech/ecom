import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { BatchDto, PaymentListDto } from "./dto/payment.dto";
import { PlatformPaymentsService } from "./platform-payments.service";

@UseGuards(SessionAuthGuard)
@Controller("platform/payments")
export class PlatformPaymentsController {
  constructor(private readonly payments: PlatformPaymentsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaymentListDto) { return this.payments.list(user.id, query); }
  @Get(":paymentId") get(@CurrentUser() user: AuthenticatedUser, @Param("paymentId") paymentId: string) { return this.payments.get(user.id, paymentId); }
  @Post("reconcile") reconcileBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: BatchDto) { return this.payments.reconcileBatch(user.id, dto.limit); }
  @Post("reservations/expire") expire(@CurrentUser() user: AuthenticatedUser, @Body() dto: BatchDto) { return this.payments.expire(user.id, dto.limit); }
  @Post(":paymentId/reconcile") reconcile(@CurrentUser() user: AuthenticatedUser, @Param("paymentId") paymentId: string) { return this.payments.reconcile(user.id, paymentId); }
}
