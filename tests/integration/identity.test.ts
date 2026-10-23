import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { platformCases } from "./platform-cases";

let database: EmbeddedPostgres | undefined;
let db: PrismaClient;
let app: Awaited<
  ReturnType<typeof import("../../apps/api/dist/app.js").createApp>
>;
let base: string;
let mailWorker: ChildProcess | undefined;
const tenantA = randomUUID(),
  tenantB = randomUUID();
const owner = randomUUID(),
  guardian = randomUUID(),
  outsider = randomUUID(),
  accountant = randomUUID();
const studentA = randomUUID(),
  studentB = randomUUID();
const password = randomBytes(24).toString("base64url");
let hashPassword: typeof import("../../apps/api/dist/auth.service.js").hashPassword;
platformCases(
  () => db,
  api,
  (value) => hashPassword(value),
  login,
);
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("port unavailable");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function api(
  route: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    tenantHeader?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? "http://localhost:3000",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.tenantHeader) headers["X-Tenant-Id"] = options.tenantHeader;
  const response = await fetch(base + route, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const body = await response.json();
  return {
    status: response.status,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    cookieAttributes: response.headers.get("set-cookie") ?? "",
  };
}
async function login(email = "owner@example.test") {
  return api("/auth/login", { method: "POST", body: { email, password } });
}
async function context(email: string, tenantId: string, role: string) {
  const session = await login(email);
  expect(session.status).toBe(200);
  const selected = await api("/auth/switch-context", {
    method: "POST",
    token: session.body.data.accessToken,
    body: { tenantId, role },
  });
  expect(selected.status).toBe(200);
  return selected.body.data.accessToken as string;
}
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_MFA_KEY = randomBytes(32).toString("hex");
  process.env.OUTBOX_TOKEN_KEY = randomBytes(32).toString("hex");
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.PLATFORM_ORIGIN = "http://localhost:3001";
  if (process.env.TEST_DATABASE_URL) {
    if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test"))
      throw new Error("Integration DB name must end in _test");
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    const port = await freePort();
    const directory = path.resolve(".cache", "pg-tests-" + randomUUID());
    await mkdir(directory, { recursive: true });
    const databasePassword = randomBytes(32).toString("hex");
    database = new EmbeddedPostgres({
      databaseDir: directory,
      user: "fluivix_test",
      password: databasePassword,
      port,
      persistent: true,
      authMethod: "scram-sha-256",
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: (message) => {
        throw new Error(String(message));
      },
    });
    await database.initialise();
    await database.start();
    await database.createDatabase("fluivixedu_test");
    process.env.DATABASE_URL = `postgresql://fluivix_test:${databasePassword}@127.0.0.1:${port}/fluivixedu_test`;
  }
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "infra/prisma/schema.prisma",
    ],
    { env: process.env, stdio: "pipe" },
  );
  db = new PrismaClient();
  const services = await import("../../apps/api/dist/auth.service.js");
  hashPassword = services.hashPassword;
  const passwordHash = await hashPassword(password);
  await db.user.createMany({
    data: [
      {
        id: owner,
        email: "owner@example.test",
        displayName: "Owner",
        passwordHash,
        status: "ACTIVE",
      },
      {
        id: guardian,
        email: "guardian@example.test",
        displayName: "Guardian",
        passwordHash,
        status: "ACTIVE",
      },
      {
        id: outsider,
        email: "outsider@example.test",
        displayName: "Outsider",
        passwordHash,
        status: "ACTIVE",
      },
      {
        id: accountant,
        email: "accountant@example.test",
        displayName: "Accountant",
        passwordHash,
        status: "ACTIVE",
      },
    ],
  });
  for (const [id, slug] of [
    [tenantA, "center-a"],
    [tenantB, "center-b"],
  ] as const)
    await db.tenant.create({
      data: {
        id,
        slug,
        name: slug,
        status: "ACTIVE",
        subscriptionEndsAt: new Date(Date.now() + 86400000),
        graceUntil: new Date(Date.now() + 2 * 86400000),
      },
    });
  for (const [userId, tenantId, role] of [
    [owner, tenantA, "owner"],
    [owner, tenantB, "owner"],
    [guardian, tenantA, "guardian"],
    [accountant, tenantA, "accountant"],
  ] as const)
    await db.membership.create({
      data: { userId, tenantId, status: "ACTIVE", roles: { create: { role } } },
    });
  await db.student.createMany({
    data: [
      {
        id: studentA,
        tenantId: tenantA,
        studentCode: "SAME-CODE",
        fullName: "Học viên A",
        notesPrivate: "PRIVATE-A",
      },
      {
        id: studentB,
        tenantId: tenantB,
        studentCode: "SAME-CODE",
        fullName: "Học viên B",
      },
    ],
  });
  await db.guardianLink.create({
    data: {
      tenantId: tenantA,
      studentId: studentA,
      guardianUserId: guardian,
      status: "ACTIVE",
      verifiedBy: owner,
      verifiedAt: new Date(),
    },
  });
  const { createApp } = await import("../../apps/api/dist/app.js");
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = (await app.getUrl()) + "/api/v1";
}, 60000);
afterAll(async () => {
  mailWorker?.kill();
  await app?.close();
  await db?.$disconnect();
  await database?.stop();
});
beforeEach(async () => {
  await db.$executeRaw`DELETE FROM auth_rate_limits`;
});

describe("identity and tenant boundary against real PostgreSQL", () => {
  it("returns 401 without auth and generic errors for unknown/invalid accounts", async () => {
    expect((await api("/me")).status).toBe(401);
    const missing = await api("/auth/login", {
      method: "POST",
      body: { email: "absent@example.test", password },
    });
    const invalid = await api("/auth/login", {
      method: "POST",
      body: { email: "owner@example.test", password: password + "wrong" },
    });
    expect(missing.status).toBe(401);
    expect(invalid.body.error).toEqual(missing.body.error);
    expect(JSON.stringify(missing.body)).not.toContain("passwordHash");
  });
  it("uses Secure HttpOnly SameSite cookie, rejects unknown DTO fields and hostile origins", async () => {
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.cookieAttributes).toContain("HttpOnly");
    expect(result.cookieAttributes).toContain("Secure");
    expect(result.cookieAttributes).toContain("SameSite=Strict");
    expect(result.body.data.refreshToken).toBeUndefined();
    expect(
      (
        await api("/auth/login", {
          method: "POST",
          body: { email: "owner@example.test", password, role: "owner" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await api("/auth/refresh", {
          method: "POST",
          cookie: result.cookie,
          origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
  });
  it("TC-002 API portion: switching tenant requires active membership and explicit selected role", async () => {
    const tokenA = await context("owner@example.test", tenantA, "owner");
    const tokenB = await context("owner@example.test", tenantB, "owner");
    expect(
      (await api("/students", { token: tokenA })).body.data.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([studentA]);
    expect(
      (await api("/students", { token: tokenB })).body.data.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([studentB]);
    expect(
      (await api("/students", { token: tokenA, tenantHeader: tenantB })).status,
    ).toBe(403);
    const outsiderLogin = await login("outsider@example.test");
    expect(
      (
        await api("/auth/switch-context", {
          method: "POST",
          token: outsiderLogin.body.data.accessToken,
          body: { tenantId: tenantA, role: "owner" },
        })
      ).status,
    ).toBe(403);
  });
  it("TC-029 implemented student resource: masks foreign UUID and rejects nested cross-tenant FK in SQL", async () => {
    const token = await context("owner@example.test", tenantA, "owner");
    const foreign = await api("/students/" + studentB, { token });
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain("Học viên B");
    await expect(
      db.guardianLink.create({
        data: {
          tenantId: tenantA,
          studentId: studentB,
          guardianUserId: guardian,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.guardianLink.create({
        data: {
          tenantId: tenantB,
          studentId: studentB,
          guardianUserId: guardian,
        },
      }),
    ).rejects.toThrow();
  });
  it("TC-004/005 API portion: only verified active guardian link; revoke denies next request and directory", async () => {
    const token = await context("guardian@example.test", tenantA, "guardian");
    expect((await api("/students/" + studentA, { token })).status).toBe(200);
    expect((await api("/students/" + studentB, { token })).status).toBe(404);
    expect((await api("/students", { token })).status).toBe(403);
    await db.guardianLink.updateMany({
      where: { tenantId: tenantA, guardianUserId: guardian },
      data: { status: "REVOKED" },
    });
    expect((await api("/students/" + studentA, { token })).status).toBe(404);
  });
  it("TC-020 API portion: READ_ONLY permits authorized reads and blocks writes; suspended blocks reads", async () => {
    const token = await context("owner@example.test", tenantA, "owner");
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: "READ_ONLY" },
    });
    expect((await api("/students", { token })).status).toBe(200);
    expect(
      (
        await api("/students", {
          method: "POST",
          token,
          body: { studentCode: "NEW", fullName: "Mới" },
        })
      ).status,
    ).toBe(403);
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: "SUSPENDED" },
    });
    expect((await api("/students", { token })).status).toBe(403);
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: "ACTIVE" },
    });
  });
  it("checks role and membership revocation on every request; accountant sees no private fields and cannot write", async () => {
    const token = await context(
      "accountant@example.test",
      tenantA,
      "accountant",
    );
    const response = await api("/students/" + studentA, { token });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE-A|notesPrivate|userId/,
    );
    expect(
      (
        await api("/students", {
          method: "POST",
          token,
          body: { studentCode: "ACC", fullName: "Denied" },
        })
      ).status,
    ).toBe(403);
    await db.membership.update({
      where: { tenantId_userId: { tenantId: tenantA, userId: accountant } },
      data: { status: "REVOKED" },
    });
    expect((await api("/students/" + studentA, { token })).status).toBe(403);
  });
  it("TC-021 refresh reuse commits family revocation including the newest access session", async () => {
    const first = await login();
    const rotated = await api("/auth/refresh", {
      method: "POST",
      cookie: first.cookie,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.cookie).not.toBe(first.cookie);
    expect(
      (await api("/auth/refresh", { method: "POST", cookie: first.cookie }))
        .status,
    ).toBe(401);
    expect(
      (await api("/auth/refresh", { method: "POST", cookie: rotated.cookie }))
        .status,
    ).toBe(401);
    expect(
      (await api("/me", { token: rotated.body.data.accessToken })).status,
    ).toBe(401);
  });
  it("TC-028 token portion: invitation expiry/reuse denied; existing account password never replaced", async () => {
    const { hashToken, newToken } = await import(
      "../../apps/api/dist/security.js"
    );
    const raw = newToken();
    await db.invitation.create({
      data: {
        tenantId: tenantA,
        email: "invited@example.test",
        role: "academic_staff",
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60000),
        invitedBy: owner,
      },
    });
    const dto = { token: raw, password, displayName: "Người được mời" };
    expect(
      (await api("/auth/accept-invitation", { method: "POST", body: dto }))
        .status,
    ).toBe(200);
    expect(
      (await api("/auth/accept-invitation", { method: "POST", body: dto }))
        .status,
    ).toBe(401);
    const expired = newToken();
    await db.invitation.create({
      data: {
        tenantId: tenantA,
        email: "expired@example.test",
        role: "teacher",
        tokenHash: hashToken(expired),
        expiresAt: new Date(Date.now() - 1000),
        invitedBy: owner,
      },
    });
    expect(
      (
        await api("/auth/accept-invitation", {
          method: "POST",
          body: { ...dto, token: expired },
        })
      ).status,
    ).toBe(401);
    const existingToken = newToken();
    await db.invitation.create({
      data: {
        tenantId: tenantA,
        email: "outsider@example.test",
        role: "teacher",
        tokenHash: hashToken(existingToken),
        expiresAt: new Date(Date.now() + 60000),
        invitedBy: owner,
      },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: outsider } });
    expect(
      (
        await api("/auth/accept-invitation", {
          method: "POST",
          body: { ...dto, token: existingToken, password: password + "hijack" },
        })
      ).status,
    ).toBe(401);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: outsider } }))
        .passwordHash,
    ).toBe(before.passwordHash);
  });
  it("reset is one-use, revokes sessions, and unknown email response equals known email", async () => {
    const known = await api("/auth/forgot-password", {
      method: "POST",
      body: { email: "outsider@example.test" },
    });
    const unknown = await api("/auth/forgot-password", {
      method: "POST",
      body: { email: "missing@example.test" },
    });
    expect(known.status).toBe(200);
    expect(known.body.data).toEqual(unknown.body.data);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { eventType: "PASSWORD_RESET_REQUESTED" },
      orderBy: { createdAt: "desc" },
    });
    const { openToken } = await import(
      "../../packages/server-crypto/dist/index.js"
    );
    const payload = event.payload as { encryptedToken: string };
    const raw = openToken(payload.encryptedToken);
    expect(JSON.stringify(event)).not.toContain(raw);
    const session = await login("outsider@example.test");
    const dto = { token: raw, password: password + "-reset" };
    expect(
      (await api("/auth/reset-password", { method: "POST", body: dto })).status,
    ).toBe(200);
    expect(
      (await api("/me", { token: session.body.data.accessToken })).status,
    ).toBe(401);
    expect(
      (await api("/auth/reset-password", { method: "POST", body: dto })).status,
    ).toBe(401);
  });
  it("database audit is append-only and student without login can be created", async () => {
    const token = await context("owner@example.test", tenantA, "owner");
    const created = await api("/students", {
      method: "POST",
      token,
      body: { studentCode: "NO-LOGIN", fullName: "Học viên chưa có tài khoản" },
    });
    expect(created.status).toBe(201);
    expect(
      (
        await db.student.findUniqueOrThrow({
          where: { id: created.body.data.id },
        })
      ).userId,
    ).toBeNull();
    const audit = await db.auditLog.findFirstOrThrow({
      where: { resourceId: created.body.data.id },
    });
    await expect(
      db.auditLog.delete({ where: { id: audit.id } }),
    ).rejects.toThrow("append only");
  });
  it("real Redis/BullMQ/Mailpit: invitation outbox delivers once and repeat delivery is idempotent", async () => {
    process.env.MAIL_PROVIDER = "mailpit";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.QUEUE_PREFIX = "fluivixedu-test-" + randomUUID();
    const token = await context("owner@example.test", tenantA, "owner");
    const recipient = `mail-${randomUUID()}@example.test`;
    const result = await api("/staff", {
      method: "POST",
      token,
      body: { email: recipient, role: "teacher" },
    });
    expect(result.status).toBe(201);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { aggregateId: result.body.data.invitationId },
    });
    mailWorker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    await expect
      .poll(
        async () =>
          (await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }))
            .processedAt !== null,
        { timeout: 20000 },
      )
      .toBe(true);
    expect(
      (
        await db.mailDelivery.findUniqueOrThrow({
          where: { eventId: event.id },
        })
      ).status,
    ).toBe("SENT");
    const { deliver } = await import("../../apps/worker/dist/delivery.js");
    for (let retry = 0; retry < 3; retry++)
      await deliver(db, event.id, "http://localhost:3000");
    const response = await fetch(
      "http://127.0.0.1:8025/api/v1/search?query=" +
        encodeURIComponent("to:" + recipient),
    );
    expect(response.status).toBe(200);
    const mailbox = await response.json();
    expect(mailbox.messages).toHaveLength(1);
    const message = await fetch(
      `http://127.0.0.1:8025/api/v1/message/${mailbox.messages[0].ID}`,
    ).then((response) => response.json());
    expect(message.Text).toContain("/invite/accept#token=");
    const match = String(message.Text).match(/token=([A-Za-z0-9_-]{43})/);
    expect(match).not.toBeNull();
    expect(JSON.stringify(event.payload)).not.toContain(match![1]);
  });
});
