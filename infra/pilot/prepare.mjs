import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

// Synthetic-only initialization. Refuse reuse instead of rotating existing data keys.
const root = resolve(".cache");
mkdirSync(root, { recursive: true, mode: 0o700 });
if (lstatSync(root).isSymbolicLink())
  throw new Error("PILOT_CACHE_SYMLINK_REFUSED");
const directory = resolve(process.argv[2] ?? ".cache/pilot-private");
const rel = relative(root, directory);
if (!/^[a-zA-Z0-9_-]+$/.test(rel)) {
  throw new Error("PILOT_SECRETS_REQUIRE_NEW_CACHE_SUBDIRECTORY");
}
const openssl = process.env.PILOT_OPENSSL ?? "openssl";
const check = spawnSync(openssl, ["version"], { encoding: "utf8" });
if (check.status !== 0) throw new Error("PILOT_OPENSSL_REQUIRED");
mkdirSync(directory, { mode: 0o700 }); // No recursive/exist_ok: existing keys survive.
const write = (name, value) =>
  writeFileSync(resolve(directory, name), value, { flag: "wx", mode: 0o600 });
const bootstrap = randomBytes(32).toString("hex");
const migrator = randomBytes(32).toString("hex");
const app = randomBytes(32).toString("hex");
write("bootstrap-password", bootstrap);
write("migrator-password", migrator);
write("app-password", app);
write("smoke-password", randomBytes(24).toString("base64url"));
const db = (user, password) =>
  `postgresql://${user}:${password}@postgres:5432/fluivixedu_pilot`;
const shared = { OUTBOX_TOKEN_KEY: randomBytes(32).toString("hex") };
write(
  "migration-runtime.json",
  JSON.stringify({ DATABASE_URL: db("fluivix_migrator", migrator) }),
);
write(
  "api-runtime.json",
  JSON.stringify({
    ...shared,
    DATABASE_URL: db("fluivix_app", app),
    JWT_SECRET: randomBytes(48).toString("base64url"),
    PLATFORM_JWT_SECRET: randomBytes(48).toString("base64url"),
    PLATFORM_MFA_KEY: randomBytes(32).toString("hex"),
    PRIVACY_EXPORT_KEY: randomBytes(32).toString("hex"),
    PRIVACY_EXPORT_KEY_ID: "synthetic-pilot-only",
  }),
);
write(
  "worker-runtime.json",
  JSON.stringify({ ...shared, DATABASE_URL: db("fluivix_app", app) }),
);
const certificate = spawnSync(
  openssl,
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:3072",
    "-sha256",
    "-nodes",
    "-days",
    "2",
    "-subj",
    "/CN=localhost/O=FluivixEdu Synthetic Pilot",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout",
    resolve(directory, "tls.key"),
    "-out",
    resolve(directory, "tls.crt"),
  ],
  { encoding: "utf8" },
);
if (certificate.status !== 0)
  throw new Error("PILOT_CERTIFICATE_GENERATION_FAILED");
// Compose bind-mounted file secrets retain host ownership. Permit their target
// UID to read only its explicitly mounted files; the containing host directory
// remains mode0700. This does not assert Windows ACL protection.
for (const name of readdirSync(directory))
  chmodSync(resolve(directory, name), 0o444);
console.log(
  "PILOT_SYNTHETIC_SECRETS_CREATED; no existing keys or .env changed",
);
