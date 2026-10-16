import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  cookieName(): string { return this.config.getOrThrow<string>("SESSION_COOKIE_NAME"); }
  cookieSecure(): boolean { return this.config.get<string>("NODE_ENV") === "production"; }
  async register(email: string, password: string, displayName?: string) {
    const emailNormalized = normalizeEmail(email);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email: email.trim(), emailNormalized, displayName } });
        await tx.credential.create({ data: { userId: created.id, passwordHash } });
        return created;
      });
      return { user, token: await this.createSession(user.id) };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("Email is already registered");
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { emailNormalized: normalizeEmail(email) }, include: { credential: true } });
    if (!user?.credential || user.status !== UserStatus.ACTIVE || !(await argon2.verify(user.credential.passwordHash, password))) throw new UnauthorizedException("Invalid email or password");
    return { user, token: await this.createSession(user.id) };
  }
  async createSession(userId: string): Promise<string> { const token = randomBytes(32).toString("base64url"); await this.prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) } }); return token; }
  async authenticate(token?: string) {
    if (!token) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return { user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName }, sessionId: session.id };
  }
  async sessionContext(userId: string) {
    const [organizations, platformRoles] = await this.prisma.$transaction([
      this.prisma.organizationMembership.findMany({
        where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        include: { organization: true, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.platformRoleAssignment.findMany({
        where: { userId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      }),
    ]);
    return {
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
