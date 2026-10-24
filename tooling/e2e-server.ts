import EmbeddedPostgres from "./test-postgres";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { seed } from "./seed";
import { testOrigins, testPorts } from "./test-origins";
import { createServer } from "node:net";
async function databasePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      process.env.E2E_DATABASE_PORT ? testPorts.database : 0,
      "127.0.0.1",
      resolve,
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local PostgreSQL test port");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function run() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_JWT_SECRET = randomBytes(48).toString("base64url");
  process.env.PLATFORM_MFA_KEY = randomBytes(32).toString("hex");
  process.env.OUTBOX_TOKEN_KEY = randomBytes(32).toString("hex");
  process.env.WEB_ORIGIN = testOrigins.web;
  process.env.PLATFORM_ORIGIN = testOrigins.platform;
  let postgres: EmbeddedPostgres | undefined;
  if (process.env.E2E_DATABASE_URL) {
    const supplied = new URL(process.env.E2E_DATABASE_URL);
    if (
      !["localhost", "127.0.0.1"].includes(supplied.hostname) ||
      !supplied.pathname.endsWith("_test")
    )
      throw new Error(
        "E2E requires an explicitly disposable local database ending _test",
      );
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  } else {
    const port = await databasePort();
    const databasePassword = randomBytes(32).toString("hex");
    const directory = path.resolve(".cache/e2e-" + randomUUID());
    await mkdir(directory, { recursive: true });
    postgres = new EmbeddedPostgres({
      databaseDir: directory,
      user: "fluivix_test",
      password: databasePassword,
      port,
      persistent: true,
      authMethod: "scram-sha-256",
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: console.error,
    });
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase("fluivixedu_test");
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
  const db = new PrismaClient();
  await seed(db, "Fluivix-Test-Password-2026");
  await db.$disconnect();
  const { createApp } = await import("../apps/api/dist/app.js");
  const app = await createApp();
  await app.listen(testPorts.api, "127.0.0.1");
  const worker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env: {
      ...process.env,
      MAIL_PROVIDER: "mailpit",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
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
    await postgres?.stop();
    process.exit(0);
  }
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
void run();
