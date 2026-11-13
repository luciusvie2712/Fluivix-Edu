import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { request } from "node:https";
import { isIP } from "node:net";

// Bounded, synthetic, local-only rehearsal. No cloud deployment, global cleanup,
// existing database reset, automatic migration rollback or external mail/push.
const project = process.env.PILOT_PROJECT ?? "fluivixedu-pilot-rehearsal";
assert(/^fluivixedu-pilot-[a-z0-9-]{1,40}$/.test(project));
const privateDirectory = resolve(".cache", project + "-private");
const logs = resolve(".cache", project + "-logs");
mkdirSync(resolve(".cache"), { recursive: true, mode: 0o700 });
assert(
  !lstatSync(resolve(".cache")).isSymbolicLink(),
  "PILOT_CACHE_SYMLINK_REFUSED",
);
mkdirSync(logs, { mode: 0o700 });
const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(sha.status, 0);
const baseSha = sha.stdout.trim();
const sourceRoots = [
  "apps",
  "packages",
  "infra",
  "tooling",
  "tests",
  ".github",
  "package.json",
  ".node-version",
  "pnpm-lock.yaml",
  "turbo.json",
  "docker-compose.yml",
  ".dockerignore",
  ".env.example",
  ".gitattributes",
  "playwright.config.ts",
  "DEVELOPMENT.md",
];
const changedSource = new Set();
for (const args of [
  ["diff", "--name-only", "--", ...sourceRoots],
  ["ls-files", "--others", "--exclude-standard", "--", ...sourceRoots],
]) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  assert.equal(result.status, 0);
  for (const name of result.stdout.trim().split(/\r?\n/).filter(Boolean))
    changedSource.add(name);
}
const env = {
  ...process.env,
  PILOT_SECRETS_DIR: privateDirectory,
  PILOT_IMAGE_TAG: baseSha.slice(0, 7) + "-candidate",
  PILOT_PROJECT: project,
  PILOT_TRUSTED_PROXY_CIDRS: "[]",
  COMPOSE_PARALLEL_LIMIT: "1",
};
const compose = [
  "compose",
  "--project-name",
  project,
  "-f",
  "infra/pilot/compose.yaml",
];
const phases = [];
let sequence = 0,
  ownedStarted = false;
let completedResult, failedPhase;
function progress(status, phase) {
  writeFileSync(
    ".cache/pilot-rehearsal-live.json",
    JSON.stringify(
      { status, project, phase, observedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
}
function run(
  label,
  command,
  args,
  { input, expected = 0, timeout = 1200000, combinedOutput = false } = {},
) {
  const started = Date.now();
  progress("RUNNING", label);
  const result = spawnSync(command, args, {
    env,
    input,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  const logName = `${String(++sequence).padStart(2, "0")}-${label}.log`;
  writeFileSync(
    resolve(logs, logName),
    (result.stdout ?? "") + "\n" + (result.stderr ?? ""),
  );
  phases.push({
    name: label,
    exitCode: result.status,
    durationMs: Date.now() - started,
    expectedExitCode: expected,
  });
  // Captured CLI output can contain credentials: do not expose it in exceptions.
  assert.equal(
    result.status,
    expected,
    `PILOT_PHASE_FAILED ${label}; inspect private log`,
  );
  console.log(`PILOT_PHASE_PASS ${label}`);
  return combinedOutput
    ? (result.stdout ?? "") + "\n" + (result.stderr ?? "")
    : (result.stdout ?? "");
}
const dc = (label, args, options) =>
  run(label, "docker", [...compose, ...args], options);
const sql = (label, role, query, expected = 0) =>
  dc(
    label,
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      role,
      "-d",
      "fluivixedu_pilot",
      "-Atc",
      query,
    ],
    { expected },
  );
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function httpsStatus(path) {
  return new Promise((resolveStatus, reject) => {
    const req = request(
      {
        hostname: "localhost",
        family: 4,
        port: 58445,
        path,
        ca: readFileSync(resolve(privateDirectory, "tls.crt")),
        rejectUnauthorized: true,
        timeout: 5000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolveStatus(res.statusCode));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("PILOT_HTTPS_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}
try {
  // Exact named resources only; refuse an existing database volume or stack.
  assert.equal(
    run("check-containers", "docker", [
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]).trim(),
    "",
  );
  assert.equal(
    run("check-volumes", "docker", [
      "volume",
      "ls",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]).trim(),
    "",
  );
  run("prepare", process.execPath, [
    "infra/pilot/prepare.mjs",
    privateDirectory,
  ]);
  dc("compose-config", ["config", "--quiet"]);
  dc("build-images", ["--profile", "migration", "build"]);
  const ids = {};
  for (const service of ["api", "worker", "migrate", "web", "platform"]) {
    ids[service] = run("image-id-" + service, "docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      `fluivixedu-pilot-${service}:${env.PILOT_IMAGE_TAG}`,
    ]).trim();
  }
  ownedStarted = true;
  dc("start-data", ["up", "-d", "--wait", "postgres", "redis", "mailpit"]);
  dc("migration", ["--profile", "migration", "run", "--rm", "migrate"]);
  dc("grant-app", [
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'PGPASSWORD="$(cat /run/secrets/migrator_password)" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U fluivix_migrator -d fluivixedu_pilot -f /pilot/grant-application.sql',
  ]);
  assert.equal(
    sql(
      "role-bounds",
      "fluivix_app",
      `SELECT current_user,has_database_privilege(current_user,current_database(),'CREATE'),has_schema_privilege(current_user,'public','CREATE'),pg_has_role(current_user,'fluivix_migrator','MEMBER')`,
    ).trim(),
    "fluivix_app|f|f|f",
  );
  sql(
    "deny-app-ddl",
    "fluivix_app",
    "CREATE TABLE public.forbidden_pilot_ddl(id int)",
    1,
  );
  sql(
    "deny-migration-history",
    "fluivix_app",
    'SELECT * FROM "_prisma_migrations"',
    1,
  );
  assert.equal(
    sql(
      "33-applied-migrations",
      "fluivix_migrator",
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ).trim(),
    "33",
  );
  const migrationRoot = resolve("infra/prisma/migrations");
  const expectedMigrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(
      (entry) =>
        entry.name +
        "|" +
        createHash("sha256")
          .update(
            readFileSync(
              resolve(migrationRoot, entry.name, "migration.sql"),
              "utf8",
            ).replaceAll("\r\n", "\n"),
          )
          .digest("hex"),
    )
    .sort();
  assert.equal(expectedMigrations.length, 33);
  assert.deepEqual(
    sql(
      "canonical-migration-checksums",
      "fluivix_migrator",
      "SELECT migration_name || '|' || checksum FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
    )
      .trim()
      .split(/\r?\n/),
    expectedMigrations,
  );
  dc("start-apps", [
    "up",
    "-d",
    "--wait",
    "api",
    "worker",
    "web",
    "platform",
    "edge",
  ]);
  const edgeId = dc("proxy-edge-id", ["ps", "-q", "edge"]).trim();
  const edgeInfo = JSON.parse(
    run("proxy-edge-identity", "docker", ["inspect", edgeId]),
  )[0];
  assert.equal(edgeInfo.Config.Labels["com.docker.compose.project"], project);
  const proxyPeer =
    edgeInfo.NetworkSettings.Networks[project + "_data"].IPAddress;
  assert.equal(isIP(proxyPeer), 4);
  env.PILOT_TRUSTED_PROXY_CIDRS = JSON.stringify([proxyPeer + "/32"]);
  dc("apply-explicit-trusted-proxy-peer", [
    "up",
    "-d",
    "--no-build",
    "--no-deps",
    "--wait",
    "--force-recreate",
    "api",
  ]);
  // Keep the named proxy peer stable while resolving the replacement API.
  dc("reload-edge-with-stable-peer", [
    "exec",
    "-T",
    "edge",
    "nginx",
    "-s",
    "reload",
  ]);
  run("nginx-forwarded-header-proof", process.execPath, [
    "tooling/proxy-header-smoke.mjs",
    project,
    ids.api,
    privateDirectory,
  ]);
  for (const service of ["api", "worker", "web", "platform", "edge"]) {
    assert.notEqual(
      dc("nonroot-" + service, ["exec", "-T", service, "id", "-u"]).trim(),
      "0",
    );
    const id = dc("container-id-" + service, ["ps", "-q", service]).trim();
    const hardening = JSON.parse(
      run("inspect-hardening-" + service, "docker", [
        "inspect",
        "--format",
        '{"readonly":{{json .HostConfig.ReadonlyRootfs}},"capDrop":{{json .HostConfig.CapDrop}},"securityOpt":{{json .HostConfig.SecurityOpt}},"ports":{{json .NetworkSettings.Ports}}}',
        id,
      ]),
    );
    assert.equal(hardening.readonly, true);
    assert(hardening.capDrop.includes("ALL"));
    assert(hardening.securityOpt.includes("no-new-privileges:true"));
    const published = Object.values(hardening.ports ?? {}).flatMap(
      (value) => value ?? [],
    );
    if (service === "edge") {
      assert.equal(published.length, 3);
      assert(published.every((binding) => binding.HostIp === "127.0.0.1"));
    } else assert.equal(published.length, 0);
  }
  assert.equal(
    run("internal-data-network", "docker", [
      "network",
      "inspect",
      project + "_data",
      "--format",
      "{{.Internal}}",
    ]).trim(),
    "true",
  );
  for (const service of ["postgres", "redis", "mailpit"]) {
    const id = dc("data-container-id-" + service, ["ps", "-q", service]).trim();
    const ports = JSON.parse(
      run("no-published-data-ports-" + service, "docker", [
        "inspect",
        "--format",
        "{{json .NetworkSettings.Ports}}",
        id,
      ]),
    );
    assert.equal(
      Object.values(ports ?? {}).flatMap((value) => value ?? []).length,
      0,
    );
  }
  dc("api-rootfs-readonly", [
    "exec",
    "-T",
    "api",
    "node",
    "-e",
    "const a=require('node:assert/strict');a.throws(()=>require('node:fs').writeFileSync('/app/forbidden-write','test'),e=>e.code==='EROFS'||e.code==='EACCES');console.log('READONLY_PASS')",
  ]);
  dc(
    "seed-empty-synthetic",
    ["exec", "-T", "api", "node", "--input-type=module"],
    { input: readFileSync("tooling/pilot-seed.mjs", "utf8") },
  );
  run("https-auth-worker-smoke", process.execPath, ["tooling/pilot-smoke.mjs"]);
  const proxyBucket = createHash("sha256")
    .update("login-ip:" + proxyPeer)
    .digest("hex");
  assert.equal(
    sql(
      "real-api-uses-forwarded-client-not-proxy-bucket",
      "fluivix_app",
      `SELECT count(*) FROM auth_rate_limits WHERE key='${proxyBucket}'`,
    ).trim(),
    "0",
  );
  dc("actual-mailpit-receipt", [
    "exec",
    "-T",
    "api",
    "node",
    "-e",
    "fetch('http://mailpit:8025/api/v1/messages').then(r=>r.json()).then(x=>{require('node:assert/strict').equal(x.total,1);console.log('ONE_SYNTHETIC_SMTP_MESSAGE_RECEIVED')})",
  ]);
  const snapshotQuery = `SELECT (SELECT count(*) FROM tenants),(SELECT count(*) FROM student_profiles),(SELECT count(*) FROM users),(SELECT count(*) FROM platform_users),(SELECT count(*) FROM auth_sessions),(SELECT count(*) FROM platform_sessions),(SELECT count(*) FROM invoices),(SELECT count(*) FROM payments)`;
  const before = sql(
    "before-configuration-fault",
    "fluivix_app",
    snapshotQuery,
  ).trim();
  const fault = resolve(logs, "configuration-fault.yaml");
  writeFileSync(fault, 'services:\n  api:\n    command: ["invalid-mode"]\n');
  run("inject-owned-startup-fault", "docker", [
    ...compose,
    "-f",
    fault,
    "up",
    "-d",
    "--no-build",
    "--no-deps",
    "--force-recreate",
    "api",
  ]);
  let exited = false;
  for (let i = 0; i < 20; i++) {
    const raw = dc("fault-container-state-" + i, [
      "ps",
      "--all",
      "--format",
      "json",
      "api",
    ]);
    const state = JSON.parse(raw);
    const record = Array.isArray(state) ? state[0] : state;
    if (record.State === "exited") {
      exited = true;
      break;
    }
    await delay(500);
  }
  assert(exited, "Invalid runtime command must fail closed");
  assert(
    [502, 503, 504].includes(
      await httpsStatus(
        "/api/v1/platform/system-health?token=synthetic-proxy-redaction-sentinel",
      ),
    ),
  );
  assert(
    !dc("proxy-error-url-redaction", ["logs", "--no-log-prefix", "edge"], {
      combinedOutput: true,
    }).includes("synthetic-proxy-redaction-sentinel"),
  );
  dc("restore-reviewed-api-image", [
    "up",
    "-d",
    "--no-build",
    "--no-deps",
    "--wait",
    "--force-recreate",
    "api",
  ]);
  // Refresh nginx DNS resolution after the API container receives a new address.
  dc("refresh-edge", ["exec", "-T", "edge", "nginx", "-s", "reload"]);
  assert.equal(
    dc("proxy-peer-stable-after-recovery", ["ps", "-q", "edge"]).trim(),
    edgeId,
  );
  const recoveredEdge = JSON.parse(
    run("proxy-peer-ip-stable-after-recovery", "docker", ["inspect", edgeId]),
  )[0];
  assert.equal(
    recoveredEdge.NetworkSettings.Networks[project + "_data"].IPAddress,
    proxyPeer,
  );
  assert.equal(await httpsStatus("/api/v1/platform/system-health"), 401);
  assert.equal(
    sql("after-configuration-recovery", "fluivix_app", snapshotQuery).trim(),
    before,
  );
  assert.equal(
    dc("restored-image-id", ["images", "-q", "api"])
      .trim()
      .replace(/^sha256:/, ""),
    ids.api.replace(/^sha256:/, ""),
  );
  const smoke = JSON.parse(
    readFileSync(".cache/pilot-https-smoke.json", "utf8"),
  );
  assert.equal(smoke.status, "PASS");
  const forwardedHeaders = JSON.parse(
    readFileSync(".cache/proxy-header-smoke.json", "utf8"),
  );
  assert.equal(forwardedHeaders.status, "PASS");
  assert.equal(forwardedHeaders.project, project);
  completedResult = {
    status: "PASS",
    project,
    baseSha,
    sourceWorktreeDirty: changedSource.size > 0,
    changedSourcePaths: [...changedSource].sort(),
    imageIds: ids,
    phases,
    httpsSmoke: smoke,
    trustedProxy: {
      namedPeerCount: 1,
      singleHostCidr: true,
      peerStableAcrossRecovery: true,
      actualApiProxyBucketAbsent: true,
      forwardedHeaders,
    },
    canonicalMigrationChecksumsVerified: 33,
    rowCountsBeforeAndAfterConfigurationRecovery: before.split("|").map(Number),
    configurationRecovery:
      "Same immutable candidate restored after invalid startup command; row counts unchanged. Earlier binary rollback NOT_VERIFIED.",
    externalReleaseReadiness: "BLOCKED",
    checkedAt: new Date().toISOString(),
  };
} catch (error) {
  failedPhase = phases.at(-1)?.name ?? "setup";
  writeFileSync(
    ".cache/pilot-rehearsal-failure.json",
    JSON.stringify(
      {
        status: "FAIL",
        project,
        baseSha,
        phases,
        code: error?.code ?? "PILOT_PHASE_FAILED",
        sourceLine:
          error?.stack?.match(/pilot-rehearsal\.mjs:(\d+):/)?.[1] ?? null,
      },
      null,
      2,
    ) + "\n",
  );
  console.error(
    "PILOT_REHEARSAL_FAILED; inspect private phase logs; no release PASS",
  );
  progress("FAIL", phases.at(-1)?.name ?? "setup");
  process.exitCode = 1;
} finally {
  if (ownedStarted) {
    try {
      dc("stop-owned-pilot-preserve-data", ["stop"], { timeout: 120000 });
    } catch {
      failedPhase = "stop-owned-pilot-preserve-data";
      process.exitCode = 1;
      console.error("PILOT_OWNED_STOP_FAILED");
    }
  }
}
if (completedResult && !process.exitCode) {
  completedResult.checkedAt = new Date().toISOString();
  writeFileSync(
    ".cache/pilot-rehearsal-result.json",
    JSON.stringify(completedResult, null, 2) + "\n",
  );
  console.log("PILOT_REHEARSAL_PASS; local synthetic only; release BLOCKED");
  progress("PASS", "complete");
} else {
  progress("FAIL", failedPhase ?? "setup");
}
