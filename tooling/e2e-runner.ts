import EmbeddedPostgres from "./test-postgres";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { testPorts } from "./test-origins";
import { requireTestRedis } from "./test-redis";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
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
  await requireTestRedis();
  // Taste must use the same installed browser as Playwright on Linux CI,
  // rather than a system Chrome launcher with first-run/update behavior.
  if (process.platform !== "win32" && !process.env.CHROME_PATH) {
    const executable = chromium.executablePath();
    if (!existsSync(executable))
      throw new Error(
        "Install Playwright Chromium before running browser verification",
      );
    process.env.CHROME_PATH = executable;
  }
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
    process.env.E2E_DATABASE_URL = `postgresql://fluivix_test:${databasePassword}@127.0.0.1:${port}/fluivixedu_test`;
  }
  try {
    const child = spawn(
      process.execPath,
      [
        path.resolve("node_modules/@playwright/test/cli.js"),
        "test",
        ...process.argv.slice(2),
      ],
      {
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    const status = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    return status;
  } finally {
    await postgres?.stop();
  }
}
// embedded-postgres's beforeExit hook can otherwise replace a nonzero exitCode.
// All owned resources have been stopped before propagating Playwright's status.
void run()
  .then((status) => process.exit(status))
  .catch(() => {
    console.error(
      "E2E_RUNNER_FAILED: verify disposable local database and Redis configuration",
    );
    process.exit(1);
  });
