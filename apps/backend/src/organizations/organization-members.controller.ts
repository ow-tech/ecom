import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, GoneException } from "@nestjs/common";
import { IsEmail, IsIn, IsString } from "class-validator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { OrganizationMembersService, STAFF_ROLE_KEYS } from "./organization-members.service";

class InviteStaffDto { @IsEmail() email!: string; @IsString() @IsIn(STAFF_ROLE_KEYS) roleKey!: string; }
class ChangeStaffRoleDto { @IsString() @IsIn(STAFF_ROLE_KEYS) roleKey!: string; }

@UseGuards(SessionAuthGuard)
@Controller("organizations/:organizationId/members")
export class OrganizationMembersController {
  constructor(private readonly staff: OrganizationMembersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") id: string) { return this.staff.list(user.id, id); }
  // No new membership may be created without an email-verified invite.
  // The previous registered-user invitation endpoint is deliberately retired.
  @Post("invite") invite(@Body() _dto: InviteStaffDto) { throw new GoneException("Use staff-invitations for verified email invitations"); }
  @Patch(":membershipId/role") changeRole(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") org: string, @Param("membershipId") id: string, @Body() dto: ChangeStaffRoleDto) { return this.staff.changeRole(user.id, org, id, dto.roleKey); }
  @Delete(":membershipId") remove(@CurrentUser() user: AuthenticatedUser, @Param("organizationId") org: string, @Param("membershipId") id: string) { return this.staff.remove(user.id, org, id); }
}

@UseGuards(SessionAuthGuard)
@Controller("organization-invitations")
export class OrganizationInvitationsController {
  constructor(private readonly staff: OrganizationMembersService) {}
  @Get() mine(@CurrentUser() user: AuthenticatedUser) { return this.staff.invitations(user.id); }
  @Post(":membershipId/accept") accept(@CurrentUser() user: AuthenticatedUser, @Param("membershipId") id: string) { return this.staff.accept(user.id, id); }
}
