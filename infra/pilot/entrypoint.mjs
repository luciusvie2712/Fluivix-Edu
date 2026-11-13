import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

// Fixed commands, JSON data only: runtime secrets are never evaluated by a shell.
const commands = {
  api: ["/app/apps/api/dist/main.js"],
  worker: ["/app/apps/worker/dist/main.js"],
  migrate: [
    "/app/packages/migration-cli/node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "/app/infra/prisma/schema.prisma",
  ],
};
const allowed = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "PLATFORM_JWT_SECRET",
  "PLATFORM_MFA_KEY",
  "PRIVACY_EXPORT_KEY",
  "PRIVACY_EXPORT_KEY_ID",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "OUTBOX_TOKEN_KEY",
  "EXPO_ACCESS_TOKEN",
]);
let child;
try {
  const command = commands[process.argv[2]];
  if (!command || process.argv.length !== 3) throw new Error();
  const secrets = JSON.parse(readFileSync("/run/secrets/runtime", "utf8"));
  if (!secrets || Array.isArray(secrets) || typeof secrets !== "object")
    throw new Error();
  for (const [key, value] of Object.entries(secrets)) {
    if (
      !allowed.has(key) ||
      typeof value !== "string" ||
      !value ||
      value.includes("\0")
    )
      throw new Error();
  }
  if (!secrets.DATABASE_URL) throw new Error();
  child = spawn(process.execPath, command, {
    env: { ...process.env, ...secrets },
    stdio: "inherit",
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("PILOT_PROCESS_START_FAILED");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
} catch {
  console.error("PILOT_RUNTIME_CONFIGURATION_INVALID");
  process.exitCode = 1;
}
