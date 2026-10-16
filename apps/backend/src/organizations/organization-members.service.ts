import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountAudience, MembershipStatus, Prisma, RoleScope, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";

export const STAFF_ROLE_KEYS = [
  "organization.admin", "organization.member", "organization.inventory_staff",
  "organization.fulfilment_staff", "organization.finance_viewer",
];

@Injectable()
export class OrganizationMembersService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  private async managed(tx: Prisma.TransactionClient, actorId: string, organizationId: string) {
    // INV-STAFF-01: every owner mutation serializes on the organization and
    // rechecks membership after locking, protecting concurrent revocation.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId}::uuid FOR UPDATE`);
    const manager = await tx.organizationMembership.findFirst({
      where: { userId: actorId, organizationId, status: MembershipStatus.ACTIVE,
        organization: { status: "ACTIVE" },
        roles: { some: { role: { scope: RoleScope.ORGANIZATION, permissions: { some: { permission: { key: "organization.members.manage" } } } } } },
      }, select: { id: true },
    });
    if (!manager) throw new ForbiddenException("Organization staff management denied");
  }
  private async role(tx: Prisma.TransactionClient, roleKey: string) {
    if (!STAFF_ROLE_KEYS.includes(roleKey)) throw new ForbiddenException("Role cannot be delegated");
    const role = await tx.role.findFirst({ where: { key: roleKey, scope: RoleScope.ORGANIZATION }, select: { id: true } });
    if (!role) throw new ConflictException("Staff role is unavailable; apply the current seed");
    return role;
  }
  async list(userId: string, organizationId: string) {
    await this.rbac.organizationContext(userId, organizationId, "organization.members.read");
    const [members, roles] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where: { organizationId, status: { not: MembershipStatus.REMOVED } },
        select: { id: true, status: true, createdAt: true,
          user: { select: { id: true, email: true, displayName: true } },
          roles: { select: { role: { select: { key: true, name: true } } } },
        }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.role.findMany({ where: { scope: RoleScope.ORGANIZATION, key: { in: STAFF_ROLE_KEYS } },
        select: { key: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { members: members.map(m => ({ id: m.id, status: m.status, createdAt: m.createdAt, user: m.user, roleKey: m.roles[0]?.role.key ?? null })),
      roles };
  }
  async invitations(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.INVITED, organization: { status: "ACTIVE" } },
      select: { id: true, organizationId: true, organization: { select: { name: true } },
        roles: { select: { role: { select: { key: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    }).then(rows => rows.map(row => ({ id: row.id, organizationId: row.organizationId, organizationName: row.organization.name, roleKey: row.roles[0]?.role.key ?? null })));
  }
  async invite(actorId: string, organizationId: string, email: string, roleKey: string) {
    await this.rbac.organizationContext(actorId, organizationId, "organization.members.manage");
    try {
      return await this.prisma.$transaction(async tx => {
        await this.managed(tx, actorId, organizationId);
        const role = await this.role(tx, roleKey);
        const recipient = await tx.user.findUnique({ where: { emailNormalized: email.trim().toLowerCase() }, select: { id: true, status: true, accountAudience: true } });
        if (!recipient || recipient.accountAudience !== AccountAudience.WORKFORCE || recipient.status !== UserStatus.ACTIVE) throw new NotFoundException("Staff member must register an active Ecom account first");
        if (recipient.id === actorId) throw new ForbiddenException("Cannot invite yourself");
        const previous = await tx.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: recipient.id } } });
        if (previous && previous.status !== MembershipStatus.REMOVED) throw new ConflictException("Staff membership or invitation already exists");
        const membership = previous
          ? await tx.organizationMembership.update({ where: { id: previous.id }, data: { status: MembershipStatus.INVITED } })
          : await tx.organizationMembership.create({ data: { organizationId, userId: recipient.id, status: MembershipStatus.INVITED } });
        await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
        await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
        return { id: membership.id, status: MembershipStatus.INVITED, roleKey };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("Staff membership or invitation already exists");
      throw error;
    }
  }
  async accept(userId: string, membershipId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountAudience: true } });
    if (user?.accountAudience !== AccountAudience.WORKFORCE) throw new ForbiddenException("Workforce account required");
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, userId, organization: { status: "ACTIVE" } },
      select: { id: true, organizationId: true, status: true },
    });
    if (!membership || (membership.status !== MembershipStatus.INVITED && membership.status !== MembershipStatus.ACTIVE))
      throw new NotFoundException("Invitation not found");
    if (membership.status === MembershipStatus.ACTIVE) return { status: "ACTIVE", organizationId: membership.organizationId };
    const changed = await this.prisma.organizationMembership.updateMany({ where: { id: membershipId, userId, status: MembershipStatus.INVITED }, data: { status: MembershipStatus.ACTIVE } });
    if (changed.count !== 1) throw new ConflictException("Invitation changed; refresh and try again");
    return { status: "ACTIVE", organizationId: membership.organizationId };
  }
  async changeRole(actorId: string, organizationId: string, membershipId: string, roleKey: string) {
    await this.rbac.organizationContext(actorId, organizationId, "organization.members.manage");
    return this.prisma.$transaction(async tx => {
      await this.managed(tx, actorId, organizationId);
      const role = await this.role(tx, roleKey);
      const member = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId, status: MembershipStatus.ACTIVE },
        include: { roles: { include: { role: true } } } });
      if (!member) throw new NotFoundException("Active staff member not found");
      if (member.userId === actorId || member.roles.some(r => r.role.key === "organization.owner")) throw new ForbiddenException("Cannot change owner or own role");
      await tx.membershipRole.deleteMany({ where: { membershipId } });
      await tx.membershipRole.create({ data: { membershipId, roleId: role.id } });
      return { id: member.id, status: member.status, roleKey };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async remove(actorId: string, organizationId: string, membershipId: string) {
    await this.rbac.organizationContext(actorId, organizationId, "organization.members.manage");
    return this.prisma.$transaction(async tx => {
      await this.managed(tx, actorId, organizationId);
      const member = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId },
        include: { roles: { include: { role: true } } } });
      if (!member) throw new NotFoundException("Staff membership not found");
      if (member.userId === actorId || member.roles.some(r => r.role.key === "organization.owner"))
        throw new ForbiddenException("Cannot remove owner or own membership");
      if (member.status !== MembershipStatus.REMOVED)
        await tx.organizationMembership.update({ where: { id: member.id }, data: { status: MembershipStatus.REMOVED } });
      return { id: member.id, status: MembershipStatus.REMOVED };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
