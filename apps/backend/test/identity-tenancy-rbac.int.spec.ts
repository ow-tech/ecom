import { ForbiddenException, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MembershipStatus, Prisma, UserStatus } from "@prisma/client";
import * as cookieParser from "cookie-parser";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RbacService } from "../src/rbac/rbac.service";

type HttpResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type Account = {
  id: string;
  email: string;
  cookie: string;
  rawToken: string;
};

const runPrefix = `identity-rbac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "CorrectHorseBatteryStaple!42";

describe("identity, tenancy, and RBAC integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rbac: RbacService;
  let auth: AuthService;
  let baseUrl: string;

  const email = (label: string): string => `${runPrefix}-${label}@example.test`;
  const slug = (label: string): string => `${runPrefix}-${label}`;

  async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...(cookie ? { cookie } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
            headers: response.headers,
          });
        });
      });
      request.on("error", reject);
      if (payload) request.write(payload);
      request.end();
    });
  }

  function sessionFrom(response: HttpResponse): { cookie: string; rawToken: string } {
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(header).toEqual(expect.stringContaining("HttpOnly"));
    expect(header).toEqual(expect.stringContaining("SameSite=Lax"));
    expect(header).toEqual(expect.stringContaining("Path=/"));
    const cookie = header!.split(";", 1)[0];
    return { cookie, rawToken: cookie.split("=", 2)[1] };
  }

  async function register(label: string, displayName = label): Promise<Account> {
    const response = await http("POST", "/auth/register", { email: email(label), password, displayName });
    expect(response.status).toBe(201);
    const session = sessionFrom(response);
    return { id: (response.body as { id: string }).id, email: email(label), ...session };
  }

  async function organization(cookie: string, label: string): Promise<{ id: string; slug: string }> {
    const organizationSlug = slug(label);
    const response = await http("POST", "/organizations", { name: label, slug: organizationSlug }, cookie);
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id, slug: organizationSlug };
  }

  async function addMembership(userId: string, organizationId: string, roleKey: string, status = MembershipStatus.ACTIVE): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const membership = await prisma.organizationMembership.create({ data: { userId, organizationId, status } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  }

  async function replaceMembershipRole(userId: string, organizationId: string, roleKey: string): Promise<void> {
    const membership = await prisma.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId, userId } } });
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    rbac = app.get(RbacService);
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.organization.deleteMany({ where: { slug: { startsWith: runPrefix } } });
      await prisma.auditEvent.deleteMany({ where: { actorUser: { emailNormalized: { startsWith: runPrefix } } } });
      await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: runPrefix } } });
    }
    if (app) await app.close();
  });

  it("registers normalized identities with Argon2id credentials and hashed session tokens", async () => {
    const response = await http("POST", "/auth/register", { email: email("normalized").toUpperCase(), password, displayName: "Normalized" });
    expect(response.status).toBe(201);
    const session = sessionFrom(response);
    const accountId = (response.body as { id: string }).id;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: accountId }, include: { credential: true, sessions: true } });

    expect(user.emailNormalized).toBe(email("normalized"));
    expect(user.credential?.passwordHash).not.toBe(password);
    expect(user.credential?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0].tokenHash).not.toBe(session.rawToken);
    expect(user.sessions[0].tokenHash).toHaveLength(64);

    const duplicate = await http("POST", "/auth/register", { email: email("normalized"), password });
    expect(duplicate.status).toBe(409);
  });

  it("logs in only with the correct password, authenticates /auth/me, and rejects no session", async () => {
    const account = await register("login");
    const badLogin = await http("POST", "/auth/login", { email: account.email, password: "not-the-password" });
    expect(badLogin.status).toBe(401);

    const login = await http("POST", "/auth/login", { email: account.email.toUpperCase(), password });
    expect(login.status).toBe(201);
    const loggedIn = sessionFrom(login);
    expect((await http("GET", "/auth/me", undefined, loggedIn.cookie)).status).toBe(200);
    expect((await http("GET", "/auth/me")).status).toBe(401);
  });

  it("revokes sessions at logout, rejects expired sessions and non-active users, and makes repeated service revocation safe", async () => {
    const account = await register("lifecycle");
    const logout = await http("POST", "/auth/logout", undefined, account.cookie);
    expect(logout.status).toBe(201);
    expect(logout.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining("ecom_test_session=;")]));
    expect((await http("GET", "/auth/me", undefined, account.cookie)).status).toBe(401);

    const revoked = await prisma.session.findUniqueOrThrow({ where: { tokenHash: (await prisma.session.findFirstOrThrow({ where: { userId: account.id } })).tokenHash } });
    await expect(auth.logout(revoked.id)).resolves.toBeUndefined();

    const expired = await register("expired");
    await prisma.session.updateMany({ where: { userId: expired.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect((await http("GET", "/auth/me", undefined, expired.cookie)).status).toBe(401);

    const suspended = await register("suspended-user");
    await prisma.user.update({ where: { id: suspended.id }, data: { status: UserStatus.SUSPENDED } });
    expect((await http("GET", "/auth/me", undefined, suspended.cookie)).status).toBe(401);

    const disabled = await register("disabled-user");
    await prisma.user.update({ where: { id: disabled.id }, data: { status: UserStatus.DISABLED } });
    expect((await http("GET", "/auth/me", undefined, disabled.cookie)).status).toBe(401);
  });

  it("changes password only with old-secret proof and revokes every session", async () => {
    const account = await register("security-change");
    const second = await http("POST", "/auth/login", { email: account.email, password });
    expect(second.status).toBe(201);
    const secondCookie = sessionFrom(second).cookie;
    expect((await http("POST", "/auth/password/change", { currentPassword: "invalid", newPassword: "AnotherVeryLongPassword!75" }, account.cookie)).status).toBe(401);
    expect((await http("POST", "/auth/password/change", { currentPassword: password, newPassword: "AnotherVeryLongPassword!75" }, account.cookie)).status).toBe(201);
    expect((await http("GET", "/auth/me", undefined, account.cookie)).status).toBe(401);
    expect((await http("GET", "/auth/me", undefined, secondCookie)).status).toBe(401);
    expect((await http("POST", "/auth/login", { email: account.email, password })).status).toBe(401);
    expect((await http("POST", "/auth/login", { email: account.email, password: "AnotherVeryLongPassword!75" })).status).toBe(201);
  });

  it("uses hashed single-use recovery tokens and rejects replay after reset", async () => {
    const account = await register("security-recovery");
    const originalFetch = global.fetch;
    const env = { api: process.env.RESEND_API_KEY, from: process.env.ACCOUNT_EMAIL_FROM, url: process.env.ACCOUNT_PUBLIC_URL };
    const messages: string[] = [];
    process.env.RESEND_API_KEY = "test-only";
    process.env.ACCOUNT_EMAIL_FROM = "noreply@example.test";
    process.env.ACCOUNT_PUBLIC_URL = "http://localhost:3100";
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      messages.push(String(init?.body ?? ""));
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;
    try {
      const requested = await http("POST", "/auth/password/request-reset", { email: account.email });
      expect(requested.status).toBe(201);
      expect(requested.body).toEqual({ status: "accepted" });
      expect(messages).toHaveLength(1);
      const mail = JSON.parse(messages[0]) as { text: string };
      const link = mail.text.match(/https?:\/\/[^\s]+/)?.[0];
      expect(link).toBeDefined();
      const token = new URL(link!).searchParams.get("token")!;
      expect(token).toBeTruthy();
      const saved = await prisma.passwordResetToken.findUniqueOrThrow({ where: { userId: account.id } });
      expect(saved.tokenHash).not.toBe(token);
      expect(saved.tokenHash).toHaveLength(64);
      expect((await http("POST", "/auth/password/request-reset", { email: email("unknown-recovery") })).body).toEqual({ status: "accepted" });
      expect(messages).toHaveLength(1);
      expect((await http("POST", "/auth/password/reset", { token, newPassword: "NewVeryLongPasswordForRecovery!34" })).status).toBe(201);
      expect((await http("POST", "/auth/password/reset", { token, newPassword: "YetAnotherStrongPassword!34" })).status).toBe(400);
      expect((await http("GET", "/auth/me", undefined, account.cookie)).status).toBe(401);
      expect((await http("POST", "/auth/login", { email: account.email, password: "NewVeryLongPasswordForRecovery!34" })).status).toBe(201);
    } finally {
      global.fetch = originalFetch;
      if (env.api === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = env.api;
      if (env.from === undefined) delete process.env.ACCOUNT_EMAIL_FROM; else process.env.ACCOUNT_EMAIL_FROM = env.from;
      if (env.url === undefined) delete process.env.ACCOUNT_PUBLIC_URL; else process.env.ACCOUNT_PUBLIC_URL = env.url;
    }
  });

  it("throttles repeated invalid sign-ins across the same account and IP", async () => {
    const account = await register("security-throttling");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await http("POST", "/auth/login", { email: account.email, password: "invalid-password" })).status).toBe(401);
    }
    expect((await http("POST", "/auth/login", { email: account.email, password })).status).toBe(429);
  });

  it("creates an active owner membership atomically, resolves owner permissions, and enforces unique slugs", async () => {
    const account = await register("owner");
    const created = await organization(account.cookie, "owner-org");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: created.id, userId: account.id } },
      include: { roles: { include: { role: true } } },
    });
    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    expect(membership.roles.map((assignment) => assignment.role.key)).toEqual(["organization.owner"]);
    await expect(rbac.organizationContext(account.id, created.id, "organization.members.manage")).resolves.toEqual(expect.objectContaining({ permissions: expect.arrayContaining(["organization.read", "organization.update", "organization.members.read", "organization.members.manage"]) }));

    const duplicate = await http("POST", "/organizations", { name: "duplicate", slug: created.slug }, account.cookie);
    expect(duplicate.status).toBe(409);
  });

  it("lists only active memberships and denies foreign, suspended, and removed organization contexts", async () => {
    const member = await register("list-member");
    const owner = await register("list-owner");
    const active = await organization(member.cookie, "list-active");
    const suspended = await organization(member.cookie, "list-suspended");
    const removed = await organization(member.cookie, "list-removed");
    const foreign = await organization(owner.cookie, "list-foreign");
    await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: suspended.id, userId: member.id } }, data: { status: MembershipStatus.SUSPENDED } });
    await prisma.organizationMembership.update({ where: { organizationId_userId: { organizationId: removed.id, userId: member.id } }, data: { status: MembershipStatus.REMOVED } });

    const listed = await http("GET", "/organizations", undefined, member.cookie);
    expect(listed.status).toBe(200);
    expect((listed.body as Array<{ id: string }>).map((entry) => entry.id)).toEqual([active.id]);
    expect((await http("GET", `/organizations/${foreign.id}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${suspended.id}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("GET", `/organizations/${removed.id}`, undefined, member.cookie)).status).toBe(403);
    await expect(rbac.organizationContext(member.id, foreign.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rbac.organizationContext(member.id, suspended.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps a user's organization roles isolated by context and prevents URL substitution", async () => {
    const user = await register("multi-org");
    const other = await register("url-owner");
    const organizationA = await organization(user.cookie, "context-a");
    const organizationB = await organization(user.cookie, "context-b");
    const otherOrganization = await organization(other.cookie, "context-other");
    await replaceMembershipRole(user.id, organizationB.id, "organization.member");

    await expect(rbac.organizationContext(user.id, organizationA.id, "organization.members.manage")).resolves.toEqual(expect.objectContaining({ organizationId: organizationA.id }));
    await expect(rbac.organizationContext(user.id, organizationB.id, "organization.members.manage")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rbac.organizationContext(user.id, organizationB.id, "organization.read")).resolves.toEqual(expect.objectContaining({ organizationId: organizationB.id }));
    expect((await http("GET", `/organizations/${otherOrganization.id}`, undefined, user.cookie)).status).toBe(403);
  });

  it("resolves the seeded owner, admin, and member permission sets without privilege inheritance", async () => {
    const owner = await register("roles-owner");
    const admin = await register("roles-admin");
    const member = await register("roles-member");
    const target = await organization(owner.cookie, "roles-target");
    await addMembership(admin.id, target.id, "organization.admin");
    await addMembership(member.id, target.id, "organization.member");

    await expect(rbac.organizationContext(owner.id, target.id, "organization.members.manage")).resolves.toEqual(expect.objectContaining({ permissions: expect.arrayContaining(["organization.read", "organization.update", "organization.members.read", "organization.members.manage"]) }));
    await expect(rbac.organizationContext(admin.id, target.id, "organization.members.read")).resolves.toEqual(expect.objectContaining({ permissions: expect.arrayContaining(["organization.read", "organization.update", "organization.members.read"]) }));
    await expect(rbac.organizationContext(admin.id, target.id, "organization.members.manage")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rbac.organizationContext(member.id, target.id, "organization.read")).resolves.toEqual(expect.objectContaining({ permissions: ["organization.read", "supplier.read", "catalogue.listings.read", "inventory.locations.read", "inventory.read", "orders.read", "support.read", "support.create", "support.reply", "returns.read", "warranties.read"] }));
    await expect(rbac.organizationContext(member.id, target.id, "organization.update")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("supports owner-scoped staff invitation, least-privilege role changes, acceptance and revocation", async () => {
    const owner = await register("staff-owner");
    const member = await register("staff-member");
    const other = await register("staff-outsider");
    const target = await organization(owner.cookie, "staff-org");
    const otherOrg = await organization(other.cookie, "staff-other-org");
    const url = `/organizations/${target.id}/members`;
    const prohibited = await http("POST", `${url}/invite`, { email: member.email, roleKey: "organization.owner" }, owner.cookie);
    expect(prohibited.status).toBe(400);
    const unowned = await http("POST", `${url}/invite`, { email: member.email, roleKey: "organization.member" }, other.cookie);
    expect(unowned.status).toBe(403);
    const invited = await http("POST", `${url}/invite`, { email: member.email, roleKey: "organization.inventory_staff" }, owner.cookie);
    expect(invited.status).toBe(201);
    const membershipId = (invited.body as { id: string }).id;
    expect((await http("GET", `/organizations/${target.id}`, undefined, member.cookie)).status).toBe(403);
    const invitations = await http("GET", "/organization-invitations", undefined, member.cookie);
    expect(invitations.status).toBe(200);
    expect(invitations.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: membershipId, organizationId: target.id, roleKey: "organization.inventory_staff" })]));
    expect((await http("POST", `/organization-invitations/${membershipId}/accept`, undefined, other.cookie)).status).toBe(404);
    expect((await http("POST", `/organization-invitations/${membershipId}/accept`, undefined, member.cookie)).status).toBe(201);
    expect((await http("GET", `/organizations/${target.id}`, undefined, member.cookie)).status).toBe(200);
    expect((await http("GET", `${url}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("POST", `${url}/invite`, { email: other.email, roleKey: "organization.member" }, member.cookie)).status).toBe(403);
    await expect(rbac.organizationContext(member.id, target.id, "inventory.adjust")).resolves.toBeDefined();
    await expect(rbac.organizationContext(member.id, target.id, "finance.read")).rejects.toBeInstanceOf(ForbiddenException);
    expect((await http("PATCH", `${url}/${membershipId}/role`, { roleKey: "organization.owner" }, owner.cookie)).status).toBe(400);
    expect((await http("PATCH", `${url}/${membershipId}/role`, { roleKey: "organization.finance_viewer" }, owner.cookie)).status).toBe(200);
    await expect(rbac.organizationContext(member.id, target.id, "finance.read")).resolves.toBeDefined();
    await expect(rbac.organizationContext(member.id, target.id, "inventory.adjust")).rejects.toBeInstanceOf(ForbiddenException);
    expect((await http("DELETE", `${url}/${membershipId}`, undefined, owner.cookie)).status).toBe(200);
    expect((await http("GET", `/organizations/${target.id}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("DELETE", `${url}/${membershipId}`, undefined, owner.cookie)).status).toBe(200);
    const ownerMember = await prisma.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: target.id, userId: owner.id } } });
    expect((await http("DELETE", `${url}/${ownerMember.id}`, undefined, owner.cookie)).status).toBe(403);
    expect((await http("PATCH", `${url}/${ownerMember.id}/role`, { roleKey: "organization.member" }, owner.cookie)).status).toBe(403);
    expect((await http("POST", `/organizations/${otherOrg.id}/members/invite`, { email: member.email, roleKey: "organization.member" }, owner.cookie)).status).toBe(403);
    const reinvite = await http("POST", `${url}/invite`, { email: member.email, roleKey: "organization.fulfilment_staff" }, owner.cookie);
    expect(reinvite.status).toBe(201);
    expect((reinvite.body as { id: string }).id).toBe(membershipId);
    expect((await http("GET", `/organizations/${target.id}`, undefined, member.cookie)).status).toBe(403);
    expect((await http("POST", `/organization-invitations/${membershipId}/accept`, undefined, member.cookie)).status).toBe(201);
    await expect(rbac.organizationContext(member.id, target.id, "fulfilment.update")).resolves.toBeDefined();
    await expect(rbac.organizationContext(member.id, target.id, "inventory.adjust")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("preserves database uniqueness for role-permission and membership-role mappings", async () => {
    const owner = await register("constraints-owner");
    const target = await organization(owner.cookie, "constraints-target");
    const membership = await prisma.organizationMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: target.id, userId: owner.id } } });
    const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "organization.owner" } });
    const readPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "organization.read" } });

    await expect(prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: ownerRole.id } })).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    await expect(prisma.rolePermission.create({ data: { roleId: ownerRole.id, permissionId: readPermission.id } })).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });
});
