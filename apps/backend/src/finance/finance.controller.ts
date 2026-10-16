import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { CreateCommissionRateDto, CreateSettlementDto, ManualAdjustmentDto, MarkSettlementPaidDto, SupplierLedgerListDto } from "./dto/finance.dto";
import { FinanceService } from "./finance.service";

@UseGuards(SessionAuthGuard) @Controller("organizations/:organizationId/finance")
export class SupplierFinanceController {
  constructor(private readonly service: FinanceService) {}
  @Get("balance") balance(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string) { return this.service.supplierBalance(u.id, o); }
  @Get("ledger") ledger(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string, @Query() query: SupplierLedgerListDto) { return this.service.supplierLedger(u.id, o, query); }
  @Get("commissions") commissions(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string) { return this.service.supplierCommissions(u.id, o); }
  @Get("settlements") settlements(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string) { return this.service.supplierSettlements(u.id, o); }
  @Get("settlements/:id") settlement(@CurrentUser() u: AuthenticatedUser, @Param("organizationId") o: string, @Param("id") id: string) { return this.service.supplierSettlements(u.id, o, id); }
}

@UseGuards(SessionAuthGuard) @Controller("platform")
export class PlatformFinanceController {
  constructor(private readonly service: FinanceService) {}
  @Get("finance/suppliers/:supplierId/balance") balance(@CurrentUser() u: AuthenticatedUser, @Param("supplierId") id: string) { return this.service.platformBalance(u.id, id); }
  @Get("finance/suppliers/:supplierId/ledger") ledger(@CurrentUser() u: AuthenticatedUser, @Param("supplierId") id: string) { return this.service.platformLedger(u.id, id); }
  @Get("commissions") commissions(@CurrentUser() u: AuthenticatedUser) { return this.service.platformCommissions(u.id); }
  @Post("finance/suppliers/:supplierId/commission-rates") rate(@CurrentUser() u: AuthenticatedUser, @Param("supplierId") id: string, @Body() dto: CreateCommissionRateDto) { return this.service.createRate(u.id, id, dto); }
  @Post("finance/suppliers/:supplierId/adjustments") adjustment(@CurrentUser() u: AuthenticatedUser, @Param("supplierId") id: string, @Body() dto: ManualAdjustmentDto) { return this.service.manualAdjustment(u.id, id, dto); }
  @Get("settlements") settlements(@CurrentUser() u: AuthenticatedUser) { return this.service.listSettlements(u.id); }
  @Get("settlements/:id") settlement(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string) { return this.service.listSettlements(u.id, id); }
  @Post("suppliers/:supplierId/settlements") create(@CurrentUser() u: AuthenticatedUser, @Param("supplierId") id: string, @Body() dto: CreateSettlementDto) { return this.service.createSettlement(u.id, id, dto); }
  @Post("settlements/:id/approve") approve(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string) { return this.service.approveSettlement(u.id, id); }
  @Post("settlements/:id/mark-paid") paid(@CurrentUser() u: AuthenticatedUser, @Param("id") id: string, @Body() dto: MarkSettlementPaidDto) { return this.service.markPaid(u.id, id, dto); }
}
