import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AccountAudience, MembershipStatus, Prisma, RoleScope, StaffInvitationScope, StaffInvitationStatus, UserStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { BrevoMailService } from "../notifications/brevo-mail.service";
import { AuditService } from "../audit/audit.service";
import { STAFF_ROLE_KEYS } from "./organization-members.service";

const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
const emailKey = (email: string) => email.trim().toLowerCase();
const PLATFORM_DELEGABLE = ["platform.operations_admin", "platform.support_admin", "platform.audit_viewer"];
const EXPIRY_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class StaffInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly mail: BrevoMailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private async manager(tx: Prisma.TransactionClient, actorId: string, scope: StaffInvitationScope, organizationId?: string) {
    if (scope === StaffInvitationScope.SUPPLIER) {
      if (!organizationId) throw new BadRequestException("Supplier organization required");
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Organization" WHERE "id"=${organizationId}::uuid FOR UPDATE`);
      const membership = await tx.organizationMembership.findFirst({ where: {
        organizationId, userId: actorId, status: MembershipStatus.ACTIVE,
        organization: { status: "ACTIVE" },
        roles: { some: { role: { scope: RoleScope.ORGANIZATION,
          permissions: { some: { permission: { key: "organization.staff.manage" } } } } } },
      } });
      if (!membership) throw new ForbiddenException("Supplier staff management denied");
    } else {
      const assignment = await tx.platformRoleAssignment.findFirst({ where: {
        userId: actorId, role: { scope: RoleScope.PLATFORM,
          permissions: { some: { permission: { key: "platform.staff.manage" } } } },
      } });
      if (!assignment) throw new ForbiddenException("Platform staff management denied");
    }
  }

  private async allowed(tx: Prisma.TransactionClient, actorId: string, scope: StaffInvitationScope, roleKey: string) {
    if (scope === StaffInvitationScope.SUPPLIER) {
      if (!STAFF_ROLE_KEYS.includes(roleKey)) throw new ForbiddenException("Supplier role cannot be delegated");
    } else if (roleKey === "platform.head_admin") {
      const root = await tx.platformRoleAssignment.findFirst({ where: { userId: actorId, role: {
        key: "platform.super_admin", scope: RoleScope.PLATFORM,
      } } });
      if (!root) throw new ForbiddenException("Only the super admin can appoint head admins");
    } else if (!PLATFORM_DELEGABLE.includes(roleKey)) throw new ForbiddenException("Platform role cannot be delegated");
    const role = await tx.role.findFirst({ where: {
      key: roleKey, scope: scope === StaffInvitationScope.SUPPLIER ? RoleScope.ORGANIZATION : RoleScope.PLATFORM,
    }, select: { id: true } });
    if (!role) throw new ConflictException("Role registry is not seeded");
    return role.id;
  }

  private url(token: string): string {
    const origin = this.config.get<string>("ACCOUNT_PUBLIC_URL");
    if (!origin) throw new ServiceUnavailableException("Public application URL not configured");
    let url: URL;
    try { url = new URL("/staff/invitation", origin); } catch { throw new ServiceUnavailableException("Public application URL invalid"); }
    if (url.protocol !== "https:" && !(this.config.get<string>("NODE_ENV") !== "production" && url.hostname === "localhost"))
      throw new ServiceUnavailableException("Staff invitation requires HTTPS");
    // URL fragments are not sent in HTTP requests or Referer headers.
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  }

  async invite(actorId: string, scope: StaffInvitationScope, organizationId: string | undefined, email: string, roleKey: string) {
    const normalized = emailKey(email);
    if (!normalized || normalized.length > 320) throw new BadRequestException("Invalid staff email");
    // Check delivery configuration before creating a pending record.
    if (!this.config.get<string>("BREVO_API_KEY") || !this.config.get<string>("BREVO_FROM_EMAIL"))
      throw new ServiceUnavailableException("Staff invitations are not configured");
    const token = randomBytes(32).toString("base64url");
    const url = this.url(token);
    const invitation = await this.prisma.$transaction(async tx => {
      await this.manager(tx, actorId, scope, organizationId);
      await this.allowed(tx, actorId, scope, roleKey);
      // Serialize races with customer registration and active workforce records.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${normalized}, 0))`);
      const existing = await tx.user.findFirst({ where: { emailNormalized: normalized },
        select: { id: true, accountAudience: true, status: true } });
      if (existing && (existing.accountAudience !== AccountAudience.WORKFORCE || existing.status !== UserStatus.ACTIVE || existing.id === actorId))
        throw new ConflictException("Email is unavailable for staff invitation");
      if (existing && scope === StaffInvitationScope.PLATFORM && await tx.platformRoleAssignment.findFirst({
        where: { userId: existing.id, role: { key: "platform.super_admin" } },
      })) throw new ForbiddenException("Protected platform identity cannot receive staff invitations");
      if (existing) {
        if (scope === StaffInvitationScope.SUPPLIER && await tx.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: organizationId!, userId: existing.id } },
        }).then(row => row?.status === MembershipStatus.ACTIVE || row?.status === MembershipStatus.SUSPENDED)) throw new ConflictException("Staff member already belongs to this organization or is suspended");
        if (scope === StaffInvitationScope.PLATFORM && await tx.platformRoleAssignment.findFirst({
          where: { userId: existing.id, role: { key: roleKey } },
        })) throw new ConflictException("User already has this platform role");
      }
      await tx.staffInvitation.updateMany({ where: { scope, organizationId: organizationId ?? null, emailNormalized: normalized, status: StaffInvitationStatus.PENDING, expiresAt: { lte: new Date() } }, data: { status: StaffInvitationStatus.EXPIRED, tokenHash: null } });
      return tx.staffInvitation.create({ data: {
        scope, organizationId: scope === StaffInvitationScope.SUPPLIER ? organizationId : null,
        emailNormalized: normalized, email: email.trim(), roleKey, invitedByUserId: actorId,
        expiresAt: new Date(Date.now() + EXPIRY_MS), tokenHash: digest(token), sendAttempts: 1,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try {
      const providerMessageId = await this.mail.sendStaffInvitation(invitation.email, "You're invited to Ecom staff", url);
      await this.prisma.staffInvitation.updateMany({ where: { id: invitation.id, status: StaffInvitationStatus.PENDING },
        data: { emailedAt: new Date(), providerMessageId } });
    } catch {
      // Never claim delivery; retain record for audited retry.
      throw new ServiceUnavailableException("Invitation created but email was not accepted. Resend from staff invitations.");
    }
    await this.audit.emit({ actorUserId: actorId, organizationId, action: "STAFF_INVITATION_CREATED",
      entityType: "STAFF_INVITATION", entityId: invitation.id, metadata: { scope, roleKey } });
    return { id: invitation.id, status: "PENDING", delivery: "ACCEPTED_BY_PROVIDER", expiresAt: invitation.expiresAt };
  }

  async list(actorId: string, scope: StaffInvitationScope, organizationId?: string) {
    if (scope === StaffInvitationScope.SUPPLIER) await this.rbac.organizationContext(actorId, organizationId!, "organization.members.read");
    else await this.rbac.requirePlatform(actorId, "platform.staff.read");
    return this.prisma.staffInvitation.findMany({ where: { scope, organizationId: organizationId ?? null },
      select: { id: true, email: true, roleKey: true, status: true, createdAt: true, expiresAt: true, emailedAt: true, acceptedAt: true },
      orderBy: { createdAt: "desc" }, take: 100 });
  }

  async revoke(actorId: string, invitationId: string) {
    return this.prisma.$transaction(async tx => {
      const invitation = await tx.staffInvitation.findUnique({ where: { id: invitationId } });
      if (!invitation) throw new NotFoundException("Invitation not found");
      await this.manager(tx, actorId, invitation.scope, invitation.organizationId ?? undefined);
      await this.allowed(tx, actorId, invitation.scope, invitation.roleKey);
      await tx.staffInvitation.updateMany({ where: { id: invitationId, status: StaffInvitationStatus.PENDING },
        data: { status: StaffInvitationStatus.REVOKED, revokedAt: new Date(), tokenHash: null } });
      await this.audit.emitInTransaction(tx, { actorUserId: actorId, organizationId: invitation.organizationId ?? undefined,
        action: "STAFF_INVITATION_REVOKED", entityType: "STAFF_INVITATION", entityId: invitationId,
        metadata: { scope: invitation.scope } });
      return { status: "REVOKED" };
    });
  }

  async resend(actorId: string, invitationId: string) {
    if (!this.config.get<string>("BREVO_API_KEY") || !this.config.get<string>("STAFF_INVITATION_FROM_EMAIL"))
      throw new ServiceUnavailableException("Staff invitations are not configured");
    const token = randomBytes(32).toString("base64url");
    const url = this.url(token);
    const row = await this.prisma.$transaction(async tx => {
      const candidate = await tx.staffInvitation.findUnique({ where: { id: invitationId } });
      if (!candidate) throw new NotFoundException("Invitation not found");
      await this.manager(tx, actorId, candidate.scope, candidate.organizationId ?? undefined);
      await this.allowed(tx, actorId, candidate.scope, candidate.roleKey);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StaffInvitation" WHERE "id"=${invitationId}::uuid FOR UPDATE`);
      const invitation = await tx.staffInvitation.findUniqueOrThrow({ where: { id: invitationId } });
      if (invitation.status !== StaffInvitationStatus.PENDING || invitation.expiresAt <= new Date())
        throw new ConflictException("Only an active pending invitation can be resent");
      if (invitation.sendAttempts >= 5 || invitation.emailedAt && invitation.emailedAt.getTime() > Date.now() - 120_000)
        throw new ForbiddenException("Resend limit reached; try again later");
      return tx.staffInvitation.update({ where: { id: invitation.id },
        data: { tokenHash: digest(token), emailedAt: null, providerMessageId: null,
          expiresAt: new Date(Date.now() + EXPIRY_MS), sendAttempts: { increment: 1 } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const providerMessageId = await this.mail.sendStaffInvitation(row.email, "Your Ecom staff invitation", url);
    await this.prisma.staffInvitation.updateMany({ where: { id: row.id, status: StaffInvitationStatus.PENDING, tokenHash: digest(token) },
      data: { emailedAt: new Date(), providerMessageId } });
    await this.audit.emit({ actorUserId: actorId, organizationId: row.organizationId ?? undefined,
      action: "STAFF_INVITATION_RESENT", entityType: "STAFF_INVITATION", entityId: row.id, metadata: { scope: row.scope } });
    return { id: row.id, delivery: "ACCEPTED_BY_PROVIDER" };
  }

  async accept(rawToken: string, password?: string, displayName?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new BadRequestException("Invalid invitation link");
    const tokenHash = digest(rawToken);
    const passwordHash = password ? await argon2.hash(password, { type: argon2.argon2id }) : null;
    return this.prisma.$transaction(async tx => {
      const candidate = await tx.staffInvitation.findUnique({ where: { tokenHash } });
      if (!candidate) throw new BadRequestException("Invalid or expired invitation");
      // Lock row before validating state, so concurrent acceptance cannot grant twice.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StaffInvitation" WHERE "id"=${candidate.id}::uuid FOR UPDATE`);
      const invitation = await tx.staffInvitation.findUniqueOrThrow({ where: { id: candidate.id } });
      if (invitation.status !== StaffInvitationStatus.PENDING || invitation.expiresAt <= new Date() || invitation.tokenHash !== tokenHash)
        throw new BadRequestException("Invalid or expired invitation");
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${invitation.emailNormalized}, 0))`);
      let user = await tx.user.findFirst({ where: { emailNormalized: invitation.emailNormalized } });
      if (user && (user.accountAudience !== AccountAudience.WORKFORCE || user.status !== UserStatus.ACTIVE))
        throw new ConflictException("Email is unavailable for staff activation");
      if (!user) {
        if (!passwordHash || !password || password.length < 12 || password.length > 256)
          throw new BadRequestException("A password of at least 12 characters is required");
        user = await tx.user.create({ data: { email: invitation.email, emailNormalized: invitation.emailNormalized,
          accountAudience: AccountAudience.WORKFORCE, emailVerifiedAt: new Date(), displayName } });
        await tx.credential.create({ data: { userId: user.id, passwordHash } });
      } else if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      }
      if (invitation.scope === StaffInvitationScope.SUPPLIER) {
        if (!invitation.organizationId) throw new ConflictException("Invalid invitation scope");
        const organization = await tx.organization.findUnique({ where: { id: invitation.organizationId } });
        if (organization?.status !== "ACTIVE") throw new ConflictException("Supplier organization is not active");
        const roleId = await this.allowed(tx, invitation.invitedByUserId, invitation.scope, invitation.roleKey);
        // Inviter must still be authorized at acceptance, including after removal.
        await this.manager(tx, invitation.invitedByUserId, invitation.scope, invitation.organizationId);
        const currentMembership = await tx.organizationMembership.findUnique({ where: {
          organizationId_userId: { organizationId: invitation.organizationId, userId: user.id },
        } });
        if (currentMembership?.status === MembershipStatus.ACTIVE || currentMembership?.status === MembershipStatus.SUSPENDED)
          throw new ConflictException("Staff membership is already active or suspended");
        const membership = await tx.organizationMembership.upsert({
          where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
          create: { organizationId: invitation.organizationId, userId: user.id, status: MembershipStatus.ACTIVE },
          update: { status: MembershipStatus.ACTIVE },
        });
        // Existing active memberships must not be re-roled by an older link.
        // An invitation can only activate a new/removed membership.
        await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
        await tx.membershipRole.create({ data: { membershipId: membership.id, roleId } });
      } else {
        const protectedRoot = await tx.platformRoleAssignment.findFirst({ where: {
          userId: user.id, role: { key: "platform.super_admin" },
        } });
        if (protectedRoot) throw new ForbiddenException("Protected platform identity cannot accept staff invitations");
        await this.manager(tx, invitation.invitedByUserId, invitation.scope);
        const roleId = await this.allowed(tx, invitation.invitedByUserId, invitation.scope, invitation.roleKey);
        await tx.platformRoleAssignment.upsert({ where: { userId_roleId: { userId: user.id, roleId } },
          create: { userId: user.id, roleId }, update: {} });
      }
      await tx.staffInvitation.update({ where: { id: invitation.id }, data: { status: StaffInvitationStatus.ACCEPTED,
        acceptedByUserId: user.id, acceptedAt: new Date(), tokenHash: null } });
      await this.audit.emitInTransaction(tx, { actorUserId: user.id, organizationId: invitation.organizationId ?? undefined,
        action: "STAFF_INVITATION_ACCEPTED", entityType: "STAFF_INVITATION", entityId: invitation.id,
        metadata: { scope: invitation.scope, roleKey: invitation.roleKey } });
      return { status: "ACTIVE", accountAudience: "WORKFORCE", scope: invitation.scope };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
