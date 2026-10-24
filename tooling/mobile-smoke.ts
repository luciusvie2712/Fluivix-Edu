import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import path from "node:path";
import EmbeddedPostgres from "./test-postgres";
import { Db } from "../apps/api/dist/db";
import { createApp } from "../apps/api/dist/app";
import { NativeSession, unwrap } from "../apps/mobile/lib/session-client";
import { createApiClient } from "../packages/api-client/src";
import { seedMobile } from "./seed-mobile";
import { developmentIds } from "./seed";
async function freePort() {
  const s = createServer();
  await new Promise<void>((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const address = s.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}
async function main() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_MFA_KEY = randomBytes(32).toString("hex");
  process.env.OUTBOX_TOKEN_KEY = randomBytes(32).toString("hex");
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.PLATFORM_ORIGIN = "http://localhost:3001";
  process.env.PUSH_PROVIDER = "disabled";
  const directory = path.resolve(".cache/mobile-" + randomUUID());
  await mkdir(directory, { recursive: true });
  const pgPort = await freePort(),
    dbPassword = randomBytes(24).toString("hex"),
    password = process.argv.includes("--serve")
      ? (process.env.SEED_PASSWORD ?? "")
      : randomBytes(24).toString("base64url");
  const pg = new EmbeddedPostgres({
    databaseDir: directory,
    user: "mobile_test",
    password: dbPassword,
    port: pgPort,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  let db: Db | undefined,
    app: Awaited<ReturnType<typeof createApp>> | undefined;
  let serving = false;
  const stop = async () => {
    await app?.close();
    await db?.$disconnect();
    await pg.stop();
  };
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("fluivixedu_mobile_test");
    process.env.DATABASE_URL = `postgresql://mobile_test:${dbPassword}@127.0.0.1:${pgPort}/fluivixedu_mobile_test`;
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
    db = new Db();
    const fixture = await seedMobile(db, password);
    app = await createApp();
    const serve = process.argv.includes("--serve"),
      apiPort = serve
        ? Number(process.env.MOBILE_TEST_PORT ?? 4200)
        : await freePort();
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)
      throw new Error("Invalid MOBILE_TEST_PORT");
    await app.listen(
      apiPort,
      serve && process.env.API_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1",
    );
    const base = `http://127.0.0.1:${apiPort}`;
    if (serve) {
      console.log(
        `Synthetic mobile API: http://localhost:${apiPort}/api/v1; refresh in native SecureStore; no production data. Set SEED_PASSWORD before running this command to choose credentials.`,
      );
      let stopping = false;
      const shutdown = () => {
        if (stopping) return;
        stopping = true;
        void stop().then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      serving = true;
      return;
    }
    const native = () => {
      let credential: string | null = null;
      let invalidations = 0;
      const client = new NativeSession(
        base,
        {
          get: async () => credential,
          set: async (value) => {
            credential = value;
          },
          remove: async () => {
            credential = null;
          },
        },
        () => {
          invalidations++;
        },
        () => {},
      );
      return { client, invalidations: () => invalidations };
    };
    const teacher = native(),
      student = native(),
      guardian = native();
    await teacher.client.login("teacher@example.test", password);
    await teacher.client.switchContext(fixture.tenantId, "teacher");
    const dashboard = unwrap(
      await teacher.client.api.GET("/api/v1/mobile/dashboard"),
    );
    assert.equal(dashboard.linkRequired, false);
    assert.equal(dashboard.classesCount, 1);
    const today = dashboard.today,
      rosterSession = await db.classSession.findFirstOrThrow({
        where: {
          tenantId: fixture.tenantId,
          classId: fixture.classId,
          scheduledDate: new Date(today + "T00:00:00Z"),
        },
      });
    let roster = unwrap(
      await teacher.client.api.GET("/api/v1/sessions/{id}/roster", {
        params: { path: { id: rosterSession.id } },
      }),
    );
    assert.equal(roster.rows.length, 20);
    const report = unwrap(
      await teacher.client.api.PUT("/api/v1/sessions/{id}/lesson-report", {
        params: { path: { id: rosterSession.id } },
        body: {
          sessionVersion: roster.session.version,
          lessonSummary: "Synthetic mobile lesson",
          homeworkText: "Text homework",
          teacherNotesPrivate: "Private synthetic note",
        },
      }),
    );
    roster = unwrap(
      await teacher.client.api.PUT("/api/v1/sessions/{id}/attendance/draft", {
        params: { path: { id: rosterSession.id } },
        body: {
          sessionVersion: report.sessionVersion,
          records: roster.rows.map((r) => ({
            studentId: r.studentId,
            status: "PRESENT" as const,
          })),
        },
      }),
    );
    roster = unwrap(
      await teacher.client.api.POST(
        "/api/v1/sessions/{id}/attendance/finalize",
        {
          params: { path: { id: rosterSession.id } },
          body: { sessionVersion: roster.session.version },
        },
      ),
    );
    assert.equal(roster.session.status, "COMPLETED");
    await student.client.login("student@example.test", password);
    await student.client.switchContext(fixture.tenantId, "student");
    const grades = unwrap(
      await student.client.api.GET("/api/v1/mobile/my/grades"),
    );
    assert.equal(grades.length, 1);
    assert.equal(grades[0]!.score, "8.00");
    assert.notEqual(grades[0]!.title, "Bản nháp không công bố");
    const attendance = unwrap(
      await student.client.api.GET("/api/v1/mobile/my/attendance", {
        params: { query: { from: today, to: today } },
      }),
    );
    assert.equal(attendance.length, 1);
    assert.equal(attendance[0]!.attendanceStatus, "PRESENT");
    await guardian.client.login("guardian@example.test", password);
    await guardian.client.switchContext(fixture.tenantId, "guardian");
    const children = unwrap(
      await guardian.client.api.GET("/api/v1/mobile/guardian/students"),
    );
    assert.equal(children.length, 2);
    const invoices = unwrap(
      await guardian.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/invoices",
        { params: { path: { id: fixture.childId } } },
      ),
    );
    assert.equal(invoices[0]!.balanceVnd, "700000");
    const second = children.find((c) => c.id !== fixture.childId)!;
    guardian.client.invalidate();
    const secondInvoices = unwrap(
      await guardian.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/invoices",
        { params: { path: { id: second.id } } },
      ),
    );
    assert.equal(secondInvoices[0]!.balanceVnd, "1200000");
    await teacher.client.switchContext(developmentIds.tenantB, "teacher");
    const otherClasses = unwrap(
      await teacher.client.api.GET("/api/v1/mobile/my/classes"),
    );
    assert.equal(otherClasses[0]!.name, "Lớp Mobile kiểm thử B");
    assert.equal(
      (
        await teacher.client.api.GET("/api/v1/classes/{id}", {
          params: { path: { id: fixture.classId } },
        })
      ).response.status,
      404,
    );
    const direct = createApiClient(base, "omit"),
      signed = unwrap(
        await direct.POST("/api/v1/mobile/auth/login", {
          body: { email: "owner@example.test", password },
        }),
      ),
      owner = unwrap(
        await direct.POST("/api/v1/auth/switch-context", {
          headers: { Authorization: `Bearer ${signed.accessToken}` },
          body: { tenantId: fixture.tenantId, role: "owner" },
        }),
      );
    const link = await db.guardianLink.findFirstOrThrow({
      where: {
        tenantId: fixture.tenantId,
        studentId: fixture.childId,
        guardianUserId: (
          await db.user.findUniqueOrThrow({
            where: { email: "guardian@example.test" },
          })
        ).id,
        status: "ACTIVE",
      },
    });
    unwrap(
      await direct.DELETE("/api/v1/students/{id}/guardians/{linkId}", {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
        params: { path: { id: fixture.childId, linkId: link.id } },
        body: { reason: "Synthetic active-app revocation check" },
      }),
    );
    const denied = await guardian.client.api.GET(
      "/api/v1/mobile/guardian/students/{id}/profile",
      { params: { path: { id: fixture.childId } } },
    );
    assert.equal(denied.response.status, 404);
    assert.ok(guardian.invalidations() > 0);
    await Promise.all([
      teacher.client.logout(),
      student.client.logout(),
      guardian.client.logout(),
    ]);
    console.log(
      "MOBILE_API_SMOKE_PASS: actual Teacher20/finalize/report, Student publication, Guardian2 children/partial finance/revoke and tenant switch. Native device UI NOT tested.",
    );
  } finally {
    if (!serving) await stop();
  }
}
void main().catch((cause: unknown) => {
  console.error(
    JSON.stringify({
      code: "MOBILE_API_SMOKE_FAILED",
      kind: cause instanceof Error ? cause.name : typeof cause,
      at:
        cause instanceof Error
          ? cause.stack
              ?.split("\n")
              .filter((line) => line.trim().startsWith("at "))
              .slice(0, 3)
          : [],
    }),
  );
  process.exit(1);
});
