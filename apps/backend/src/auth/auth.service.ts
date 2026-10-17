import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { AccountAudience, Prisma, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BrevoMailService } from "../notifications/brevo-mail.service";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly mail: BrevoMailService) {}
  cookieName(): string { return this.config.getOrThrow<string>("SESSION_COOKIE_NAME"); }
  cookieSecure(): boolean { return this.config.get<string>("NODE_ENV") === "production"; }
  async register(email: string, password: string, displayName?: string, accountAudience: AccountAudience = AccountAudience.CUSTOMER) {
    const emailNormalized = normalizeEmail(email);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // INV-IDENTITY: serialize against staff invitations before claiming an email.
        await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${emailNormalized}, 0))) advisory_lock`);
        if (accountAudience === AccountAudience.CUSTOMER) {
          const reserved = await tx.staffInvitation.findFirst({ where: {
            emailNormalized, status: "PENDING", expiresAt: { gt: new Date() },
          }, select: { id: true } });
          if (reserved) throw new ConflictException("Email is unavailable");
        }
        const created = await tx.user.create({ data: { email: email.trim(), emailNormalized, displayName, accountAudience } });
        await tx.credential.create({ data: { userId: created.id, passwordHash } });
        return created;
      });
      return { user, token: await this.createSession(user.id) };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("Email is already registered");
      throw error;
    }
  }

  private key(category: string, value: string) { return hashToken(category + ":" + value); }
  private async checkThrottle(keys: string[]) {
    const now = new Date();
    const buckets = await this.prisma.authLoginThrottle.findMany({ where: { key: { in: keys } } });
    if (buckets.some(row => row.blockedUntil && row.blockedUntil > now)) throw new HttpException("Too many attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
  private async recordFailure(key: string, max: number, intervalMs: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - intervalMs);
    // Atomic counter update: concurrent attempts must not discard each other's failures.
    const rows = await this.prisma.$queryRaw<Array<{ failures: number }>>(Prisma.sql`
      INSERT INTO "AuthLoginThrottle" ("key","failures","windowStartedAt","updatedAt")
      VALUES (${key}, 1, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "failures" = CASE WHEN "AuthLoginThrottle"."windowStartedAt" <= ${cutoff} THEN 1 ELSE "AuthLoginThrottle"."failures" + 1 END,
        "windowStartedAt" = CASE WHEN "AuthLoginThrottle"."windowStartedAt" <= ${cutoff} THEN ${now} ELSE "AuthLoginThrottle"."windowStartedAt" END,
        "blockedUntil" = CASE WHEN "AuthLoginThrottle"."windowStartedAt" <= ${cutoff} THEN NULL ELSE "AuthLoginThrottle"."blockedUntil" END,
        "updatedAt" = ${now}
      RETURNING "failures"
    `);
    if ((rows[0]?.failures ?? 0) >= max) {
      await this.prisma.authLoginThrottle.updateMany({ where: { key }, data: { blockedUntil: new Date(now.getTime() + intervalMs) } });
    }
  }
  async login(email: string, password: string, ip = "unknown", audience: AccountAudience = AccountAudience.CUSTOMER) {
    const normalized = normalizeEmail(email);
    const accountKey = this.key("login-account-ip", normalized + ":" + ip);
    const ipKey = this.key("login-ip", ip);
    await this.checkThrottle([accountKey, ipKey]);
    const user = await this.prisma.user.findUnique({ where: { emailNormalized: normalized }, include: { credential: true } });
    if (!user?.credential || user.accountAudience !== audience || user.status !== UserStatus.ACTIVE || !(await argon2.verify(user.credential.passwordHash, password))) {
      await Promise.all([this.recordFailure(accountKey, 5, 15 * 60_000), this.recordFailure(ipKey, 50, 15 * 60_000)]);
      throw new UnauthorizedException("Invalid email or password");
    }
    // INV-ACCOUNT-02: verifying an old hash must never issue a session after a concurrent password reset.
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`);
      const current = await tx.credential.findUnique({ where: { userId: user.id } });
      const active = await tx.user.findUnique({ where: { id: user.id }, select: { status: true, accountAudience: true } });
      if (current?.passwordHash !== user.credential!.passwordHash || (active?.status !== UserStatus.ACTIVE || active?.accountAudience !== audience)) throw new UnauthorizedException("Invalid email or password");
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60_000) } });
    });
    await this.prisma.authLoginThrottle.deleteMany({ where: { key: accountKey } });
    return { user, token };
  }
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword === currentPassword) throw new BadRequestException("Choose a different password");
    const credential = await this.prisma.credential.findUnique({ where: { userId } });
    if (!credential || !await argon2.verify(credential.passwordHash, currentPassword)) throw new UnauthorizedException("Current password is incorrect");
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`);
      const updated = await tx.credential.updateMany({ where: { userId, passwordHash: credential.passwordHash }, data: { passwordHash: hash, passwordUpdatedAt: new Date() } });
      if (updated.count !== 1) throw new UnauthorizedException("Password changed in another session. Sign in again.");
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { status: "ok" };
  }
  async requestPasswordReset(email: string, ip = "unknown") {
    // Rate limit even unknown accounts. Do not reveal whether a recipient exists.
    const key = this.key("reset-ip", ip);
    await this.checkThrottle([key]);
    await this.recordFailure(key, 8, 15 * 60_000);
    const site = this.config.get<string>("ACCOUNT_PUBLIC_URL");
    if (!this.mail.isConfigured() || !site) throw new ServiceUnavailableException("Password recovery email is not configured");
    let base: URL;
    try { base = new URL(site); }
    catch { throw new ServiceUnavailableException("Password recovery email is not configured"); }
    if (base.protocol !== "https:" && !(this.config.get<string>("NODE_ENV") !== "production" && base.hostname === "localhost")) throw new ServiceUnavailableException("Password recovery email is not configured");
    const user = await this.prisma.user.findUnique({ where: { emailNormalized: normalizeEmail(email) }, select: { id: true, email: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE) return { status: "accepted" };
    const rawToken = randomBytes(32).toString("base64url");
    const digest = hashToken(rawToken);
    const created = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`);
      const old = await tx.passwordResetToken.findUnique({ where: { userId: user.id } });
      if (old && old.createdAt.getTime() > Date.now() - 120_000) return false;
      await tx.passwordResetToken.upsert({ where: { userId: user.id }, update: { tokenHash: digest, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) }, create: { userId: user.id, tokenHash: digest, expiresAt: new Date(Date.now() + 30 * 60_000) } });
      return true;
    });
    if (!created) return { status: "accepted" };
    const url = new URL("/reset-password", base);
    url.hash = new URLSearchParams({ token: rawToken }).toString();
    let sent = false;
    try {
      await this.mail.send({ to: user.email, subject: "Reset your Ecom password", category: "password-reset", text: "Use this link within 30 minutes: " + url.toString() + "\\nIf you did not request this, ignore this email." });
      sent = true;
    } catch { /* Never include provider errors or user identity in the response. */ }
    if (!sent) {
      this.logger.warn("Password reset email delivery failed");
      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, tokenHash: digest } });
    }
    return { status: "accepted" };
  }
  async resetPassword(token: string, newPassword: string) {
    const digest = hashToken(token);
    const candidate = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: digest }, select: { userId: true } });
    if (!candidate) throw new BadRequestException("Invalid or expired password reset link");
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId}::uuid FOR UPDATE`);
      const challenge = await tx.passwordResetToken.findUnique({ where: { tokenHash: digest }, include: { user: true } });
      if (!challenge || challenge.expiresAt <= new Date() || challenge.user.status !== UserStatus.ACTIVE) throw new BadRequestException("Invalid or expired password reset link");
      await tx.credential.update({ where: { userId: challenge.userId }, data: { passwordHash: hash, passwordUpdatedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: challenge.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.delete({ where: { id: challenge.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { status: "ok" };
  }
  async createSession(userId: string): Promise<string> { const token = randomBytes(32).toString("base64url"); await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) } }); return token; }
  async authenticate(token?: string) {
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return { user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName, accountAudience: session.user.accountAudience }, sessionId: session.id };
  }
  async sessionContext(userId: string) {
    const [organizations, platformRoles, identity] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        include: { organization: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.platformRoleAssignment.findMany({
        where: { userId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountAudience: true } }),
    ]);
    return {
      accountAudience: identity.accountAudience,
      organizations: organizations.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        permissions: [...new Set(membership.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))].sort(),
      })),
      platformPermissions: [...new Set(platformRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))].sort(),
    };
  }
  async logout(sessionId?: string): Promise<void> { if (sessionId) await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }); }
}
