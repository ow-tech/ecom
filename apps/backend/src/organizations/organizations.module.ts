import { Module } from "@nestjs/common";
import { OrganizationMembersController, OrganizationInvitationsController } from "./organization-members.controller";
import { OrganizationMembersService } from "./organization-members.service"; import { AuthModule } from "../auth/auth.module"; import { OrganizationsController } from "./organizations.controller"; import { OrganizationsService } from "./organizations.service";
@Module({ imports: [AuthModule], controllers: [OrganizationsController, OrganizationMembersController, OrganizationInvitationsController], providers: [OrganizationsService, OrganizationMembersService] }) export class OrganizationsModule {}
