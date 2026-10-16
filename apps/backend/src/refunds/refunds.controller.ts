import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateRefundRequestDto, ReviewRefundRequestDto } from "./dto/refund.dto";
import { RefundsService } from "./refunds.service";

@UseGuards(SessionAuthGuard) @Controller("customer/orders/:orderId/refund-requests")
export class CustomerRefundsController {
  constructor(private readonly service: RefundsService) {}
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param("orderId") orderId: string, @Body() dto: CreateRefundRequestDto) { return this.service.create(user.id, orderId, dto); }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("orderId") orderId: string) { return this.service.customerList(user.id, orderId); }
}

@UseGuards(SessionAuthGuard) @Controller("platform")
export class PlatformRefundsController {
  constructor(private readonly service: RefundsService) {}
  @Get("refund-requests") list(@CurrentUser() user: AuthenticatedUser) { return this.service.platformList(user.id); }
  @Get("refund-requests/:id") detail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.platformDetail(user.id, id); }
  @Post("refund-requests/:id/approve") approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.approve(user.id, id); }
  @Post("refund-requests/:id/reject") reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReviewRefundRequestDto) { return this.service.reject(user.id, id, dto); }
  @Post("refunds/:id/execute") execute(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.execute(user.id, id); }
  @Post("refunds/:id/reconcile") reconcile(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.reconcile(user.id, id); }
}
