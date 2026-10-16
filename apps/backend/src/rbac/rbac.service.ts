import { ForbiddenException, Injectable } from "@nestjs/common";
import { AccountAudience, RoleScope } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
@Injectable() export class RbacService {
  constructor(private readonly prisma: PrismaService) {}
  async organizationContext(userId: string, organizationId: string, required = "organization.read") {
    const workforce = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountAudience: true } });
    if (workforce?.accountAudience !== AccountAudience.WORKFORCE) throw new ForbiddenException("Workforce account required");
    const membership = await this.prisma.organizationMembership.findFirst({ where: { userId, organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    const permissions = new Set(membership?.roles.flatMap((r) => r.role.scope === RoleScope.ORGANIZATION ? r.role.permissions.map((p) => p.permission.key) : []) ?? []);
    if (!membership || !permissions.has(required)) throw new ForbiddenException("Organization access denied");
    return { userId, organizationId, membershipId: membership.id, permissions: [...permissions] };
  }
  async requirePlatform(userId: string, permission: string): Promise<void> { const workforce = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountAudience: true } }); if (workforce?.accountAudience !== AccountAudience.WORKFORCE) throw new ForbiddenException("Workforce account required"); const assignment = await this.prisma.platformRoleAssignment.findFirst({ where: { userId, role: { scope: RoleScope.PLATFORM, permissions: { some: { permission: { key: permission } } } } } }); if (!assignment) throw new ForbiddenException("Platform access denied"); }
}
