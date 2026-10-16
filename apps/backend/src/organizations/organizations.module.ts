import { Module } from "@nestjs/common";
import { PlatformStaffController } from "./platform-staff.controller";
import { PlatformStaffService } from "./platform-staff.service";
import { StaffInvitationsService } from "./staff-invitations.service";
import { TransactionalEmailModule } from "../notifications/transactional-email.module";
import { AuditModule } from "../audit/audit.module";
import { SupplierStaffInvitationsController, PlatformStaffInvitationsController, PublicStaffInvitationController } from "./staff-invitations.controller";
import { OrganizationMembersController, OrganizationInvitationsController } from "./organization-members.controller";
import { OrganizationMembersService } from "./organization-members.service"; import { AuthModule } from "../auth/auth.module"; import { OrganizationsController } from "./organizations.controller"; import { OrganizationsService } from "./organizations.service";
@Module({ imports: [AuthModule, AuditModule, TransactionalEmailModule], controllers: [OrganizationsController, OrganizationMembersController, OrganizationInvitationsController, SupplierStaffInvitationsController, PlatformStaffInvitationsController, PublicStaffInvitationController, PlatformStaffController], providers: [OrganizationsService, OrganizationMembersService, StaffInvitationsService, PlatformStaffService] }) export class OrganizationsModule {}
