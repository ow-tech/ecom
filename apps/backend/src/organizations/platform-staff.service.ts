import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoleScope, UserStatus, AccountAudience } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { AuditService } from "../audit/audit.service";

const subordinateRoles = ["platform.operations_admin","platform.support_admin","platform.audit_viewer"];
const administrativeRoles = [...subordinateRoles,"platform.head_admin"];

@Injectable()
export class PlatformStaffService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly audit: AuditService) {}
  async list(actorId: string) {
    await this.rbac.requirePlatform(actorId,"platform.staff.read");
    const rows = await this.prisma.user.findMany({ where: { accountAudience: AccountAudience.WORKFORCE,
      platformRoles: { some: { role: { scope: RoleScope.PLATFORM } } } },
      select: { id:true,email:true,displayName:true,status:true,platformRoles: { select: {
        role: { select: { key:true,name:true } },
      } } }, orderBy:{createdAt:"desc"},take:100 });
    return rows.map(row=>({ id:row.id,email:row.email,displayName:row.displayName,status:row.status,
      roles:row.platformRoles.map(a=>a.role.key) }));
  }
  private async assertAuthority(tx: Prisma.TransactionClient, actorId: string, roleKey: string) {
    const actor = await tx.user.findUnique({where:{id:actorId},select:{accountAudience:true,status:true}});
    if (actor?.accountAudience !== AccountAudience.WORKFORCE || actor.status !== UserStatus.ACTIVE)
      throw new ForbiddenException("Active workforce account required");
    const role = await tx.role.findUnique({where:{key:roleKey},select:{id:true,scope:true}});
    if (!role || role.scope !== RoleScope.PLATFORM || !administrativeRoles.includes(roleKey))
      throw new ForbiddenException("Role is not delegable");
    const requiredPermission = roleKey === "platform.head_admin" ? "platform.head_admin.manage" : "platform.staff.manage";
    const privileged = await tx.platformRoleAssignment.findFirst({where:{userId:actorId,role:{
      scope:RoleScope.PLATFORM,permissions:{some:{permission:{key:requiredPermission}}},
    }}});
    if(!privileged) throw new ForbiddenException("Insufficient platform staff authority");
    if(roleKey === "platform.head_admin") {
      const root = await tx.platformRoleAssignment.findFirst({where:{userId:actorId,role:{key:"platform.super_admin"}}});
      if(!root) throw new ForbiddenException("Only a super admin may manage head admins");
    }
    return role;
  }
  async change(actorId:string, targetId:string, roleKey:string, assign:boolean) {
    return this.prisma.$transaction(async tx=>{
      // Row locking prevents revocation or replacement racing the same target.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${targetId}::uuid FOR UPDATE`);
      if(actorId===targetId) throw new ForbiddenException("Cannot change own platform roles");
      const role = await this.assertAuthority(tx,actorId,roleKey);
      const target=await tx.user.findUnique({where:{id:targetId},select:{accountAudience:true,status:true}});
      if(!target || target.accountAudience!==AccountAudience.WORKFORCE || target.status!==UserStatus.ACTIVE)
        throw new NotFoundException("Active workforce member not found");
      const protectedRoot = await tx.platformRoleAssignment.findFirst({where:{userId:targetId,role:{key:"platform.super_admin"}}});
      if(protectedRoot) throw new ForbiddenException("Protected super admin cannot be managed through staff APIs");
      if(assign){
        await tx.platformRoleAssignment.upsert({where:{userId_roleId:{userId:targetId,roleId:role.id}},
          create:{userId:targetId,roleId:role.id},update:{}});
      }else{
        await tx.platformRoleAssignment.deleteMany({where:{userId:targetId,roleId:role.id}});
      }
      await this.audit.emitInTransaction(tx,{actorUserId:actorId,action:assign?"PLATFORM_STAFF_ROLE_GRANTED":"PLATFORM_STAFF_ROLE_REVOKED",
        entityType:"PLATFORM_STAFF",entityId:targetId,
        metadata:{roleKey}});
      return {userId:targetId,roleKey,assigned:assign};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
