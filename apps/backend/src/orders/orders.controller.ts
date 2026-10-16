import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { CancelOrderDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

@UseGuards(SessionAuthGuard)
@Controller("customer/orders")
export class CustomerOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.orders.list(user.id); }
  @Get(":orderId") get(@CurrentUser() user: AuthenticatedUser, @Param("orderId") id: string) { return this.orders.get(user.id, id); }
  @Post(":orderId/cancel") cancel(@CurrentUser() user: AuthenticatedUser, @Param("orderId") id: string, @Body() dto: CancelOrderDto) { return this.orders.cancel(user.id, id, dto); }
}

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/supplier-orders")
export class SupplierOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) { return this.orders.supplierOrders(user.id, organizationId); }
  @Get(":supplierOrderId") get(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Param("supplierOrderId") id: string) { return this.orders.supplierOrder(user.id, organizationId, id); }
}

@UseGuards(SessionAuthGuard)
@Controller("platform/orders")
export class PlatformOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.orders.platformOrders(user.id); }
  @Get(":orderId") get(@CurrentUser() user: AuthenticatedUser, @Param("orderId") id: string) { return this.orders.platformOrder(user.id, id); }
}
