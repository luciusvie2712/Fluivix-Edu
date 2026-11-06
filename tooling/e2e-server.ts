import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { seed } from "./seed";
import { seedTeachingForE2E } from "./e2e-teaching-fixture";
import { testOrigins, testPorts } from "./test-origins";
import { requireTestRedis, testRedisUrl } from "./test-redis";
async function run() {
  await requireTestRedis();
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_MFA_KEY = randomBytes(32).toString("hex");
  process.env.OUTBOX_TOKEN_KEY = randomBytes(32).toString("hex");
  process.env.WEB_ORIGIN = testOrigins.web;
  process.env.PLATFORM_ORIGIN = testOrigins.platform;
  if (!process.env.E2E_DATABASE_URL)
    throw new Error("Use pnpm test:e2e to provision an isolated database");
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
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
  const db = new PrismaClient();
  await seed(db, "Fluivix-Test-Password-2026");
  await seedTeachingForE2E(db);
  await db.$disconnect();
  const { createApp } = await import("../apps/api/dist/app.js");
  const app = await createApp();
  await app.listen(testPorts.api, "127.0.0.1");
  const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env: {
      ...process.env,
      MAIL_PROVIDER: "mailpit",
      // This suite tests manual preview/commit deterministically; rolling jobs
      // have their own real Redis/PostgreSQL integration case.
      SCHEDULE_GENERATION_ENABLED: "false",
      REDIS_URL: testRedisUrl(),
      QUEUE_PREFIX: "fluivixedu-e2e-" + randomUUID(),
    },
    stdio: "inherit",
    windowsHide: true,
  });
  const next = spawn(
    process.execPath,
    [
      path.resolve("apps/web/node_modules/next/dist/bin/next"),
      "start",
      "--port",
      String(testPorts.web),
    ],
    {
      cwd: path.resolve("apps/web"),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const platform = spawn(
    process.execPath,
    [
      path.resolve("apps/platform/node_modules/next/dist/bin/next"),
      "start",
      "--port",
      String(testPorts.platform),
    ],
    {
      cwd: path.resolve("apps/platform"),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  async function stop() {
    worker.kill();
    next.kill();
    platform.kill();
    await app.close();
    process.exit(0);
  }
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
void run();
