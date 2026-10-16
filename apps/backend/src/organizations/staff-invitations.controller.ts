import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { StaffInvitationScope } from "@prisma/client";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { StaffInvitationsService } from "./staff-invitations.service";
import { STAFF_ROLE_KEYS } from "./organization-members.service";

class InviteSupplierDto {
  @IsEmail() email!: string;
  @IsString() @IsIn(STAFF_ROLE_KEYS) roleKey!: string;
}
class InvitePlatformDto {
  @IsEmail() email!: string;
  @IsString() @IsIn(["platform.head_admin","platform.operations_admin","platform.support_admin","platform.audit_viewer"]) roleKey!: string;
}
class AcceptInvitationDto {
  @IsString() @MinLength(40) @MaxLength(128) token!: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(256) password?: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
}
@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/staff-invitations")
export class SupplierStaffInvitationsController {
  constructor(private readonly staff: StaffInvitationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string) {
    return this.staff.list(user.id, StaffInvitationScope.SUPPLIER, organizationId);
  }
  @Post() invite(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") organizationId: string, @Body() dto: InviteSupplierDto) {
    return this.staff.invite(user.id, StaffInvitationScope.SUPPLIER, organizationId, dto.email, dto.roleKey);
  }
  @Post(":id/resend") resend(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.staff.resend(user.id, id); }
  @Delete(":id") revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.staff.revoke(user.id, id); }
}
@UseGuards(SessionAuthGuard)
@Controller("platform/staff-invitations")
export class PlatformStaffInvitationsController {
  constructor(private readonly staff: StaffInvitationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.staff.list(user.id, StaffInvitationScope.PLATFORM); }
  @Post() invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InvitePlatformDto) {
    return this.staff.invite(user.id, StaffInvitationScope.PLATFORM, undefined, dto.email, dto.roleKey);
  }
  @Delete(":id") revoke(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.staff.revoke(user.id, id); }
}
@Controller("staff-invitations")
export class PublicStaffInvitationController {
  constructor(private readonly staff: StaffInvitationsService) {}
  @Post("accept") accept(@Body() dto: AcceptInvitationDto) { return this.staff.accept(dto.token, dto.password, dto.displayName); }
}
