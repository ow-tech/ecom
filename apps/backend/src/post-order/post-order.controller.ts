import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { CompleteReturnDto, CreateReturnDto, CreateWarrantyDto, ResolveWarrantyDto, TransitionDto } from "./dto/post-order.dto";
import { PostOrderService } from "./post-order.service";

@UseGuards(SessionAuthGuard) @Controller("customer")
export class CustomerPostOrderController { constructor(private readonly service: PostOrderService) {}
  @Post("orders/:orderId/returns") createReturn(@CurrentUser() u: AuthenticatedUser, @Param("orderId") id: string, @Body() dto: CreateReturnDto) { return this.service.createReturn(u.id, id, dto); }
  @Get("orders/:orderId/returns") returns(@CurrentUser() u: AuthenticatedUser, @Param("orderId") id: string) { return this.service.customerReturns(u.id, id); }
  @Get("returns/:id") returnDetail(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string) { return this.service.customerReturns(u.id, undefined, id); }
  @Post("warranties") createWarranty(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateWarrantyDto) { return this.service.createWarranty(u.id, dto); }
  @Get("warranties") warranties(@CurrentUser() u: AuthenticatedUser) { return this.service.customerWarranties(u.id); }
}
@UseGuards(SessionAuthGuard) @Controller("organizations/:organizationId")
export class SupplierPostOrderController { constructor(private readonly service: PostOrderService) {}
  @Get("returns") returns(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string) { return this.service.supplierReturns(u.id, o); }
  @Get("returns/:id") returnDetail(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string, @Param("id") id: string) { return this.service.supplierReturns(u.id, o, id); }
  @Get("warranties") warranties(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string) { return this.service.supplierWarranties(u.id, o); }
}
@UseGuards(SessionAuthGuard) @Controller("platform")
export class PlatformPostOrderController { constructor(private readonly service: PostOrderService) {}
  @Get("returns") returns(@CurrentUser() u: AuthenticatedUser) { return this.service.platformReturns(u.id); }
  @Get("returns/:id") returnDetail(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string) { return this.service.platformReturns(u.id, id); }
  @Post("returns/:id/approve") approveReturn(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.approveReturn(u.id, id, dto); }
  @Post("returns/:id/reject") rejectReturn(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.rejectReturn(u.id, id, dto); }
  @Post("returns/:id/awaiting-item") awaiting(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.awaitingItem(u.id, id, dto); }
  @Post("returns/:id/item-received") received(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.itemReceived(u.id, id, dto); }
  @Post("returns/:id/inspect") inspect(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.inspectReturn(u.id, id, dto); }
  @Post("returns/:id/complete") complete(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: CompleteReturnDto) { return this.service.completeReturn(u.id, id, dto); }
  @Get("warranties") warranties(@CurrentUser() u: AuthenticatedUser) { return this.service.platformWarranties(u.id); }
  @Post("warranties/:id/under-review") review(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.warrantyTransition(u.id, id, "UNDER_REVIEW", dto); }
  @Post("warranties/:id/approve") approveWarranty(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.warrantyTransition(u.id, id, "APPROVED", dto); }
  @Post("warranties/:id/reject") rejectWarranty(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.warrantyTransition(u.id, id, "REJECTED", dto); }
  @Post("warranties/:id/in-service") serviceWarranty(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: TransitionDto) { return this.service.warrantyTransition(u.id, id, "IN_SERVICE", dto); }
  @Post("warranties/:id/resolve") resolveWarranty(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveWarrantyDto) { return this.service.resolveWarranty(u.id, id, dto); }
}
