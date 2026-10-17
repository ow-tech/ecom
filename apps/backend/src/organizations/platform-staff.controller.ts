import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsString } from "class-validator";
import { SessionAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { PlatformStaffService } from "./platform-staff.service";
class RoleActionDto {
  @IsString() @IsIn(["platform.head_admin","platform.operations_admin","platform.support_admin","platform.audit_viewer"]) roleKey!: string;
  @IsBoolean() assign!: boolean;
}
@UseGuards(SessionAuthGuard)
@Controller("platform/staff")
export class PlatformStaffController {
  constructor(private readonly service:PlatformStaffService){}
  @Get() list(@CurrentUser() actor:AuthenticatedUser){return this.service.list(actor.id);}
  @Patch(":userId/role")
  role(@CurrentUser() actor:AuthenticatedUser,@Param("userId") userId:string,@Body() body:RoleActionDto){
    return this.service.change(actor.id,userId,body.roleKey,body.assign);
  }
}
