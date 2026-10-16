import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser } from "../auth/auth.types";
import { SupplierReportsService } from "./supplier-reports.service";

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/reports")
export class SupplierReportsController {
  constructor(private readonly reports: SupplierReportsService) {}
  @Get() overview(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) {
    return this.reports.overview(user.id, organizationId);
  }
}
