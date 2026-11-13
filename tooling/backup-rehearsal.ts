import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { z } from "zod";
import { Db } from "../apps/api/dist/db";
import { createApp } from "../apps/api/dist/app";
import { seedMobile } from "./seed-mobile";
import { developmentIds } from "./seed";
import { requireTestRedis } from "./test-redis";

const postgresImage =
  "postgres:17.12-alpine@sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f";
const runId = process.env.BACKUP_REHEARSAL_ID ?? randomUUID().slice(0, 8);
assert(/^[a-z0-9-]{3,32}$/.test(runId));
const prefix = "fluivixedu-backup-" + runId;
const pgName = prefix + "-postgres";
const volumes = {
  database: prefix + "-database",
  keys: prefix + "-keys",
  archives: prefix + "-archives",
  bootstrap: prefix + "-bootstrap",
};
const sourceDatabase =
  "fluivixedu_backup_" + runId.replaceAll("-", "_") + "_source_test";
const targetDatabase =
  "fluivixedu_backup_" + runId.replaceAll("-", "_") + "_restored_test";
const deniedDatabase =
  "fluivixedu_backup_" + runId.replaceAll("-", "_") + "_denied_test";
const directory = path.resolve(".cache", prefix);
const phases: {
  name: string;
  exitCode: number;
  expectedExitCode: number;
  durationMs: number;
}[] = [];
let currentPhase = "setup",
  startedPostgres = false;
let backupImage = "",
  migrationImage = "";

async function command(
  label: string,
  program: string,
  args: string[],
  options: {
    input?: string;
    expected?: number;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
) {
  currentPhase = label;
  const began = performance.now();
  const child = spawn(program, args, {
    shell: false,
    windowsHide: true,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
    if (stdout.length > 64 * 1024 * 1024) child.kill("SIGTERM");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 64 * 1024 * 1024) child.kill("SIGTERM");
  });
  child.stdin.end(options.input);
  const timer = setTimeout(
    () => child.kill("SIGTERM"),
    options.timeoutMs ?? 20 * 60 * 1000,
  );
  let code: number;
  try {
    code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (value) => resolve(value ?? -1));
    });
  } finally {
    clearTimeout(timer);
  }
  // Input can contain synthetic credentials. It is never recorded. These
  // commands emit only build metadata, client versions and sanitized CLI JSON;
  // pg_dump plaintext stays entirely inside the backup job's encryption pipe.
  await writeFile(
    path.join(
      directory,
      `${String(phases.length + 1).padStart(2, "0")}-${label}.log`,
    ),
    stdout + "\n" + stderr,
    { flag: "wx", mode: 0o600 },
  );
  phases.push({
    name: label,
    exitCode: code,
    expectedExitCode: options.expected ?? 0,
    durationMs: Math.round(performance.now() - began),
  });
  assert.equal(code, options.expected ?? 0, "BACKUP_PHASE_FAILED_" + label);
  console.log("BACKUP_PHASE_PASS " + label);
  return options.expected === 1 ? stdout + "\n" + stderr : stdout;
}
const docker = (
  label: string,
  args: string[],
  options: Parameters<typeof command>[3] = {},
) => command(label, "docker", args, options);
const hardened = [
  "--rm",
  "--read-only",
  "--user",
  "1000:1000",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges:true",
];
const keysMount = [
  "--mount",
  `type=volume,source=${volumes.keys},target=/run/fluivix-backup/keys,readonly`,
];
const workMount = [
  "--tmpfs",
  "/run/fluivix-backup/work:rw,noexec,nosuid,size=256m,uid=1000,gid=1000,mode=0700",
];
function archiveMount(readonly = false) {
  return [
    "--mount",
    `type=volume,source=${volumes.archives},target=/var/lib/fluivix-backup/archives${readonly ? ",readonly" : ""}`,
  ];
}
async function cli(
  label: string,
  args: string[],
  options: { expected?: number; readonlyArchive?: boolean } = {},
) {
  return docker(
    label,
    [
      "run",
      ...hardened,
      "--network",
      "container:" + pgName,
      "--env",
      "NODE_ENV=test",
      ...keysMount,
      ...workMount,
      ...archiveMount(options.readonlyArchive),
      backupImage,
      ...args,
    ],
    { expected: options.expected ?? 0 },
  );
}
function lastJson(text: string): unknown {
  const line = text.trim().split(/\r?\n/).at(-1);
  assert(line);
  return JSON.parse(line);
}
const commitSchema = z.object({
  status: z.literal("BACKUP_ARCHIVE_COMMITTED"),
  archiveId: z.uuid(),
  keyId: z.string(),
  createdAt: z.iso.datetime(),
  bytes: z.number().int().positive(),
});
type TableProof = { table: string; rows: string; sha256: string };
async function dataManifest(client: Client): Promise<TableProof[]> {
  await client.query("SET timezone='UTC'");
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\"",
  );
  const proof = [];
  for (const { tablename } of tables.rows) {
    assert(/^[a-z_][a-z0-9_]*$/.test(tablename));
    const row = await client.query<{ count: string; canonical: string }>(
      `SELECT count(*)::text AS count, COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::jsonb)::text AS canonical FROM public."${tablename}" t`,
    );
    const value = row.rows[0];
    assert(
      value &&
        Number(value.count) <= 50000 &&
        Buffer.byteLength(value.canonical) <= 32 * 1024 * 1024,
    );
    proof.push({
      table: tablename,
      rows: value.count,
      sha256: createHash("sha256").update(value.canonical).digest("hex"),
    });
  }
  return proof;
}
async function schemaFingerprint(client: Client) {
  const values = await client.query<{
    definition: string;
  }>(`SELECT definition FROM (
    SELECT 'constraint:'||c.relname||':'||con.conname||':'||pg_get_constraintdef(con.oid,true) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'index:'||tablename||':'||indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'trigger:'||c.relname||':'||t.tgname||':'||pg_get_triggerdef(t.oid,true) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT 'function:'||pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    UNION ALL SELECT 'column:'||c.relname||':'||a.attnum||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||a.attidentity::text||':'||a.attgenerated::text||':'||COALESCE(pg_get_expr(d.adbin,d.adrelid),'') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  ) items ORDER BY definition COLLATE "C"`);
  // pg_dump reparses CHECK/partial-index expressions. PostgreSQL can move an
  // array cast to each element on that round trip. Reparse BOTH definitions
  // through the same server, keeping the entire expression and all other DDL.
  // Do not strip casts, predicates or constraints to make hashes match.
  // https://www.postgresql.org/docs/17/functions-info.html documents these
  // pg_get_* strings as reconstructed definitions, not original SQL text.
  const expressions = await client.query<{
    name: string;
    tablename: string;
    expression: string;
    prefix: string;
    indexdef: string | null;
  }>(`SELECT 'constraint:'||c.relname||':'||con.conname AS name,c.relname AS tablename,pg_get_expr(con.conbin,con.conrelid) AS expression,'validated='||con.convalidated||':noinherit='||con.connoinherit AS prefix,NULL::text AS indexdef FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.contype='c'
    UNION ALL SELECT 'index:'||c.relname||':'||ic.relname,c.relname,pg_get_expr(i.indpred,i.indrelid),'',pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND i.indpred IS NOT NULL`);
  const definitions = values.rows.map((row) => row.definition);
  for (const item of expressions.rows) {
    assert(/^[a-z_][a-z0-9_]*$/.test(item.tablename));
    const view = "backup_expression_" + randomBytes(8).toString("hex");
    await client.query(
      `CREATE TEMP VIEW "${view}" AS SELECT (${item.expression}) AS predicate FROM public."${item.tablename}"`,
    );
    let normalized: string;
    try {
      normalized = (
        await client.query<{ definition: string }>(
          "SELECT pg_get_viewdef($1::regclass,false) AS definition",
          ["pg_temp." + view],
        )
      ).rows[0]!.definition;
    } finally {
      await client.query(`DROP VIEW pg_temp."${view}"`);
    }
    let prefix = item.prefix;
    if (item.indexdef) {
      const suffix = " WHERE " + item.expression;
      assert(
        item.indexdef.endsWith(suffix),
        "BACKUP_INDEX_PREDICATE_BOUNDARY_UNEXPECTED",
      );
      prefix = item.indexdef.slice(0, -suffix.length);
    }
    const index = definitions.findIndex((definition) =>
      definition.startsWith(item.name + ":"),
    );
    assert(index >= 0);
    definitions[index] = item.name + ":" + prefix + ":" + normalized;
  }
  definitions.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return createHash("sha256").update(JSON.stringify(definitions)).digest("hex");
}
async function canonicalMigrations() {
  const root = path.resolve("infra/prisma/migrations"),
    expected = [];
  for (const name of (await readdir(root)).sort()) {
    if (!/^\d+/.test(name)) continue;
    const sql = await readFile(path.join(root, name, "migration.sql"), "utf8");
    expected.push({
      name,
      checksum: createHash("sha256")
        .update(sql.replaceAll("\r\n", "\n"))
        .digest("hex"),
    });
  }
  assert.equal(expected.length, 33);
  return expected;
}
async function proveSchemaDriftDetection(client: Client, expected: string) {
  // Negative controls run only against this new synthetic restored database.
  // Each alteration is rolled back, including on an assertion failure.
  for (const statements of [
    [
      "ALTER TABLE public.payments DROP CONSTRAINT payments_method_check",
      "ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (method='CASH')",
    ],
    [
      "DROP INDEX public.guardian_open_pair",
      "CREATE UNIQUE INDEX guardian_open_pair ON public.guardian_student_links (tenant_id,student_id,guardian_user_id) WHERE status='ACTIVE'",
    ],
  ]) {
    await client.query("BEGIN");
    try {
      for (const sql of statements) await client.query(sql);
      assert.notEqual(
        await schemaFingerprint(client),
        expected,
        "BACKUP_SCHEMA_DRIFT_NOT_DETECTED",
      );
    } finally {
      await client.query("ROLLBACK");
    }
    assert.equal(
      await schemaFingerprint(client),
      expected,
      "BACKUP_SCHEMA_NEGATIVE_CONTROL_NOT_ROLLED_BACK",
    );
  }
}
async function verifyMigrations(client: Client) {
  const actual = await client.query<{ name: string; checksum: string }>(
    'SELECT migration_name AS name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  assert.deepEqual(actual.rows, await canonicalMigrations());
}
async function apiJob(
  databaseUrl: string,
  password: string,
  invoiceId: string,
  studentId: string,
  expectedBalance: string,
  write = true,
) {
  process.env.DATABASE_URL = databaseUrl;
  const app = await createApp();
  try {
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    let token = "";
    const request = async (
      route: string,
      body?: unknown,
      idempotencyKey?: string,
    ) => {
      const response = await fetch(base + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json: unknown = await response.json();
      return { response, json };
    };
    const signed = await request("/mobile/auth/login", {
      email: "owner@example.test",
      password,
    });
    assert.equal(signed.response.status, 200);
    token = z
      .object({ data: z.object({ accessToken: z.string().min(20) }) })
      .parse(signed.json).data.accessToken;
    const select = async (tenantId: string) => {
      const selected = await request("/auth/switch-context", {
        tenantId,
        role: "owner",
      });
      assert.equal(selected.response.status, 200);
      token = z
        .object({ data: z.object({ accessToken: z.string().min(20) }) })
        .parse(selected.json).data.accessToken;
    };
    await select(developmentIds.tenantA);
    const balance = async () => {
      const result = await request("/invoices/" + invoiceId);
      assert.equal(result.response.status, 200);
      return z
        .object({ data: z.object({ balanceVnd: z.string().regex(/^\d+$/) }) })
        .parse(result.json).data.balanceVnd;
    };
    assert.equal(await balance(), expectedBalance);
    await select(developmentIds.tenantB);
    assert.equal(
      (await request("/invoices/" + invoiceId)).response.status,
      404,
    );
    await select(developmentIds.tenantA);
    if (write) {
      const body = {
        studentId,
        method: "CASH",
        receivedAmountVnd: "10000",
        receivedAt: new Date().toISOString(),
        allocations: [{ invoiceId, amountVnd: "10000" }],
      };
      const key = "backup-rehearsal-" + randomUUID();
      assert.equal(
        (await request("/payments", body, key)).response.status,
        201,
      );
      const after = (BigInt(expectedBalance) - 10000n).toString();
      assert.equal(await balance(), after);
      const duplicate = await request("/payments", body, key);
      assert([200, 201].includes(duplicate.response.status));
      assert.equal(await balance(), after);
      const rejected = await request(
        "/payments",
        {
          ...body,
          receivedAmountVnd: "800000",
          allocations: [{ invoiceId, amountVnd: "800000" }],
        },
        "backup-overallocation-" + randomUUID(),
      );
      assert([409, 422].includes(rejected.response.status));
      assert.equal(await balance(), after);
      return {
        beforeVnd: expectedBalance,
        afterVnd: after,
        duplicateDidNotAllocateAgain: true,
        overAllocationRejected: true,
        tenantBDenied: true,
      };
    }
    return { beforeVnd: expectedBalance, tenantBDenied: true };
  } finally {
    await app.close();
  }
}

// Rehearsal resources are new, explicitly labelled and retained for inspection.
// No existing database, volume, secret file or application configuration is used.
async function main() {
  const began = performance.now();
  const cache = await realpath(path.resolve(".cache"));
  assert.equal(path.dirname(directory).toLowerCase(), cache.toLowerCase());
  await mkdir(directory, { mode: 0o700 });
  assert(!(await lstat(directory)).isSymbolicLink());
  assert(process.env.TEST_REDIS_URL, "BACKUP_EXPLICIT_TEST_REDIS_REQUIRED");
  await requireTestRedis();
  assert.equal(
    (
      await docker("check-container", [
        "ps",
        "-a",
        "--filter",
        "name=^/" + pgName + "$",
        "--format",
        "{{.Names}}",
      ])
    ).trim(),
    "",
  );
  for (const volume of Object.values(volumes))
    assert(
      !(
        await docker("check-" + volume.split("-").at(-1), [
          "volume",
          "ls",
          "--format",
          "{{.Name}}",
        ])
      )
        .split(/\r?\n/)
        .includes(volume),
    );
  const tag = "fluivixedu-backup:" + runId;
  await docker("build-backup", [
    "build",
    "--file",
    "infra/pilot/Dockerfile",
    "--target",
    "backup",
    "--tag",
    tag,
    ".",
  ]);
  backupImage = (
    await docker("backup-image-id", [
      "image",
      "inspect",
      tag,
      "--format",
      "{{.Id}}",
    ])
  ).trim();
  assert(/^sha256:[a-f0-9]{64}$/.test(backupImage));
  const pilot = z
    .object({
      status: z.literal("PASS"),
      imageIds: z.object({
        migrate: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      }),
    })
    .parse(
      JSON.parse(await readFile(".cache/pilot-rehearsal-result.json", "utf8")),
    );
  migrationImage = pilot.imageIds.migrate;
  const migrationProbe = `const fs=require('fs'),crypto=require('crypto');const root='/app/infra/prisma/migrations';console.log(JSON.stringify(fs.readdirSync(root).filter(n=>/^\\d+/.test(n)).sort().map(name=>({name,checksum:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+name+'/migration.sql','utf8')).digest('hex')}))));`;
  assert.deepEqual(
    lastJson(
      await docker("canonical-migration-image", [
        "run",
        ...hardened,
        "--network",
        "none",
        "--entrypoint",
        "node",
        migrationImage,
        "-e",
        migrationProbe,
      ]),
    ),
    await canonicalMigrations(),
  );
  const versionText = await docker("backup-runtime-versions", [
    "run",
    ...hardened,
    "--network",
    "none",
    "--entrypoint",
    "node",
    backupImage,
    "-e",
    "const cp=require('child_process');console.log(JSON.stringify({node:process.version,dump:cp.execFileSync('pg_dump',['--version'],{encoding:'utf8'}).trim(),restore:cp.execFileSync('pg_restore',['--version'],{encoding:'utf8'}).trim()}));",
  ]);
  const runtime = z
    .object({
      node: z.literal("v24.22.3"),
      dump: z.string().regex(/17\.12/),
      restore: z.string().regex(/17\.12/),
    })
    .parse(lastJson(versionText));
  for (const volume of Object.values(volumes))
    await docker("create-" + volume.split("-").at(-1), [
      "volume",
      "create",
      "--label",
      "fluivix.backup-rehearsal=" + runId,
      volume,
    ]);
  const bootstrapPassword = randomBytes(32).toString("hex"),
    rolePassword = randomBytes(32).toString("hex"),
    fixturePassword = randomBytes(32).toString("base64url");
  const role = "fluivix_backup_runner",
    keysDirectory = "/run/fluivix-backup/keys";
  const databaseUrl = (database: string, port = 5432) =>
    `postgresql://${role}:${rolePassword}@127.0.0.1:${port}/${database}`;
  const config = {
    version: 1,
    connection: {
      host: "127.0.0.1",
      port: 5432,
      user: role,
      database: sourceDatabase,
      passwordFile: keysDirectory + "/database-password",
      transport: "local-test",
    },
    archiveDirectory: "/var/lib/fluivix-backup/archives",
    workDirectory: "/run/fluivix-backup/work",
    activeKeyId: "rehearsal-v1",
    keys: [
      { id: "rehearsal-v1", file: keysDirectory + "/key-v1" },
      { id: "rehearsal-v2", file: keysDirectory + "/key-v2" },
    ],
    retention: { keepCount: 2, maxAgeDays: 1, allowApply: true },
  };
  const initialize = `const fs=require('fs'),crypto=require('crypto');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{try{const v=JSON.parse(input),d='/run/fluivix-backup/keys';for(const name of ['key-v1','key-v2','wrong-key'])fs.writeFileSync(d+'/'+name,crypto.randomBytes(32),{flag:'wx',mode:384});for(const [name,value]of Object.entries(v.files))fs.writeFileSync(d+'/'+name,value,{flag:'wx',mode:384});const b='/run/fluivix-backup/bootstrap';fs.chmodSync(b,493);fs.writeFileSync(b+'/password',v.bootstrapPassword,{flag:'wx',mode:292});console.log('SYNTHETIC_SECRET_FILES_CREATED');}catch{console.error('SYNTHETIC_SECRET_SETUP_FAILED');process.exitCode=1;}});`;
  await docker(
    "initialize-private-files",
    [
      "run",
      ...hardened,
      "-i",
      "--network",
      "none",
      "--mount",
      `type=volume,source=${volumes.keys},target=${keysDirectory}`,
      "--mount",
      `type=volume,source=${volumes.bootstrap},target=/run/fluivix-backup/bootstrap`,
      "--entrypoint",
      "node",
      backupImage,
      "-e",
      initialize,
    ],
    {
      input: JSON.stringify({
        bootstrapPassword,
        files: {
          "database-password": rolePassword,
          "source.json": JSON.stringify(config),
          "rotation.json": JSON.stringify({
            ...config,
            activeKeyId: "rehearsal-v2",
          }),
          "wrong.json": JSON.stringify({
            ...config,
            keys: [{ id: "rehearsal-v1", file: keysDirectory + "/wrong-key" }],
          }),
          "migration-source.json": JSON.stringify({
            DATABASE_URL: databaseUrl(sourceDatabase),
          }),
          "migration-target.json": JSON.stringify({
            DATABASE_URL: databaseUrl(targetDatabase),
          }),
        },
      }),
    },
  );
  await docker("start-owned-postgres", [
    "run",
    "-d",
    "--name",
    pgName,
    "--label",
    "fluivix.backup-rehearsal=" + runId,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=backup_bootstrap",
    "--env",
    "POSTGRES_PASSWORD_FILE=/run/bootstrap/password",
    "--mount",
    `type=volume,source=${volumes.bootstrap},target=/run/bootstrap,readonly`,
    "--mount",
    `type=volume,source=${volumes.database},target=/var/lib/postgresql/data`,
    postgresImage,
    "postgres",
    "-c",
    "log_statement=none",
    "-c",
    "log_min_error_statement=panic",
    "-c",
    "log_parameter_max_length_on_error=0",
  ]);
  startedPostgres = true;
  const inspect = z
    .array(
      z.object({
        Config: z.object({
          Image: z.literal(postgresImage),
          Labels: z.record(z.string(), z.string()),
        }),
        NetworkSettings: z.object({
          Ports: z.object({
            "5432/tcp": z
              .array(
                z.object({
                  HostIp: z.literal("127.0.0.1"),
                  HostPort: z.string().regex(/^\d+$/),
                }),
              )
              .length(1),
          }),
        }),
      }),
    )
    .length(1)
    .parse(
      JSON.parse(await docker("inspect-owned-postgres", ["inspect", pgName])),
    )[0]!;
  assert.equal(inspect.Config.Labels["fluivix.backup-rehearsal"], runId);
  const port = Number(inspect.NetworkSettings.Ports["5432/tcp"][0]!.HostPort);
  const bootstrap = new Client({
    host: "127.0.0.1",
    port,
    user: "backup_bootstrap",
    password: bootstrapPassword,
    database: "postgres",
    connectionTimeoutMillis: 2000,
  });
  let connected = false;
  // Use separate clients during startup: a failed pg Client cannot reconnect.
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = new Client({
      host: "127.0.0.1",
      port,
      user: "backup_bootstrap",
      password: bootstrapPassword,
      database: "postgres",
      connectionTimeoutMillis: 1000,
    });
    try {
      await probe.connect();
      connected = true;
    } catch {
      /* bounded readiness */
    } finally {
      await probe.end();
    }
    if (connected) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(connected, "BACKUP_POSTGRES_NOT_READY");
  await bootstrap.connect();
  try {
    assert.equal(
      (await bootstrap.query("SHOW server_version_num")).rows[0]
        ?.server_version_num,
      "170012",
    );
    // Password is random hex, never supplied in argv or included in error logs.
    assert(/^[a-f0-9]{64}$/.test(rolePassword));
    await bootstrap.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${rolePassword}'`,
    );
    await bootstrap.query(
      `CREATE DATABASE "${sourceDatabase}" TEMPLATE template0 OWNER ${role}`,
    );
  } finally {
    await bootstrap.end();
  }
  const migrate = async (target: "source" | "target") => {
    const script = `const fs=require('fs'),cp=require('child_process');try{const v=JSON.parse(fs.readFileSync('/run/fluivix-backup/keys/migration-${target}.json','utf8'));const child=cp.spawn(process.execPath,['/app/packages/migration-cli/node_modules/prisma/build/index.js','migrate','deploy','--schema','/app/infra/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:v.DATABASE_URL},stdio:'inherit'});child.on('error',()=>{console.error('MIGRATION_START_FAILED');process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);}catch{console.error('MIGRATION_CONFIGURATION_FAILED');process.exitCode=1;}`;
    await docker("migrate-" + target, [
      "run",
      ...hardened,
      "--network",
      "container:" + pgName,
      ...keysMount,
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700",
      "--entrypoint",
      "node",
      migrationImage,
      "-e",
      script,
    ]);
  };
  await migrate("source");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl(sourceDatabase, port),
    REDIS_URL: process.env.TEST_REDIS_URL,
    QUEUE_PREFIX: prefix,
    JWT_SECRET: randomBytes(48).toString("base64url"),
    PLATFORM_JWT_SECRET: randomBytes(48).toString("base64url"),
    PLATFORM_MFA_KEY: randomBytes(32).toString("hex"),
    OUTBOX_TOKEN_KEY: randomBytes(32).toString("hex"),
    PRIVACY_EXPORT_KEY: randomBytes(32).toString("hex"),
    PRIVACY_EXPORT_KEY_ID: "backup-rehearsal",
    WEB_ORIGIN: "http://localhost:3000",
    PLATFORM_ORIGIN: "http://localhost:3001",
    PUSH_PROVIDER: "disabled",
    SCHEDULE_GENERATION_ENABLED: "false",
  });
  currentPhase = "seed-real-services";
  const db = new Db();
  let invoiceId: string, studentId: string;
  try {
    const fixture = await seedMobile(db, fixturePassword);
    studentId = fixture.childId;
    invoiceId = (
      await db.invoice.findFirstOrThrow({
        where: { tenantId: developmentIds.tenantA, studentId },
      })
    ).id;
  } finally {
    await db.$disconnect();
  }
  const source = new Client({
    connectionString: databaseUrl(sourceDatabase, port),
  });
  await source.connect();
  try {
    currentPhase = "snapshot-source-manifest";
    await verifyMigrations(source);
    const before = await dataManifest(source),
      schema = await schemaFingerprint(source);
    await writeFile(
      path.join(directory, "prebackup-manifest.json"),
      JSON.stringify({ dataManifest: before, schemaSha256: schema }, null, 2) +
        "\n",
      { flag: "wx", mode: 0o600 },
    );
    assert(
      before.some(
        (table) => table.table === "payments" && Number(table.rows) > 0,
      ),
    );
    const snapshotAt = new Date().toISOString();
    const configArgs = ["--config", keysDirectory + "/source.json"];
    const committed = commitSchema.parse(
      lastJson(await cli("backup-v1", ["backup", ...configArgs])),
    );
    const archive = "backup-" + committed.archiveId + ".fvbak";
    assert.equal(
      z
        .object({ status: z.literal("BACKUP_ARCHIVE_AUTHENTICATED") })
        .parse(
          lastJson(
            await cli(
              "verify-v1",
              ["verify", ...configArgs, "--archive", archive],
              { readonlyArchive: true },
            ),
          ),
        ).status,
      "BACKUP_ARCHIVE_AUTHENTICATED",
    );
    currentPhase = "source-post-snapshot-payment";
    const sourceFinance = await apiJob(
      databaseUrl(sourceDatabase, port),
      fixturePassword,
      invoiceId,
      studentId,
      "700000",
    );
    // Authentication failure must occur before even creating a target database.
    const wrongKey = await cli(
      "wrong-key-rejected",
      [
        "restore",
        "--config",
        keysDirectory + "/wrong.json",
        "--archive",
        archive,
        "--target-database",
        deniedDatabase,
        "--confirm-create",
      ],
      { expected: 1, readonlyArchive: true },
    );
    z.object({
      status: z.literal("BACKUP_OPERATION_FAILED"),
      code: z.literal("BACKUP_AUTHENTICATION_FAILED"),
    }).parse(lastJson(wrongKey));
    assert.equal(
      (
        await source.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          deniedDatabase,
        ])
      ).rowCount,
      0,
    );
    const restoreStarted = performance.now();
    z.object({
      status: z.literal("BACKUP_RESTORE_CREATED_REVIEW_REQUIRED"),
      restored: z.literal(true),
      applicationVerificationRequired: z.literal(true),
    }).parse(
      lastJson(
        await cli(
          "restore-fresh",
          [
            "restore",
            ...configArgs,
            "--archive",
            archive,
            "--target-database",
            targetDatabase,
            "--confirm-create",
          ],
          { readonlyArchive: true },
        ),
      ),
    );
    const restoreDurationMs = Math.round(performance.now() - restoreStarted);
    const target = new Client({
      connectionString: databaseUrl(targetDatabase, port),
    });
    await target.connect();
    let restoredFinance;
    try {
      currentPhase = "compare-restored-data-and-schema";
      assert.deepEqual(await dataManifest(target), before);
      assert.equal(await schemaFingerprint(target), schema);
      await proveSchemaDriftDetection(target, schema);
      await verifyMigrations(target);
      await migrate("target");
      assert.deepEqual(await dataManifest(target), before);
      const existingTarget = await cli(
        "existing-target-rejected",
        [
          "restore",
          ...configArgs,
          "--archive",
          archive,
          "--target-database",
          targetDatabase,
          "--confirm-create",
        ],
        { expected: 1, readonlyArchive: true },
      );
      z.object({
        status: z.literal("BACKUP_OPERATION_FAILED"),
        code: z.literal("BACKUP_RESTORE_TARGET_EXISTS"),
      }).parse(lastJson(existingTarget));
      assert.deepEqual(await dataManifest(target), before);
      currentPhase = "restored-real-api-finance";
      restoredFinance = await apiJob(
        databaseUrl(targetDatabase, port),
        fixturePassword,
        invoiceId,
        studentId,
        "700000",
      );
    } finally {
      await target.end();
    }
    const rotated = commitSchema.parse(
      lastJson(
        await cli("backup-v2", [
          "backup",
          "--config",
          keysDirectory + "/rotation.json",
        ]),
      ),
    );
    assert.equal(rotated.keyId, "rehearsal-v2");
    await cli(
      "verify-old-after-rotation",
      [
        "verify",
        "--config",
        keysDirectory + "/rotation.json",
        "--archive",
        archive,
      ],
      { readonlyArchive: true },
    );
    const preview = z
      .object({
        status: z.literal("BACKUP_RETENTION"),
        mode: z.literal("PREVIEW"),
        verifiedArchives: z.literal(2),
        candidateArchiveIds: z.array(z.string()).length(0),
      })
      .parse(
        lastJson(await cli("retention-preview", ["retention", ...configArgs])),
      );
    const applied = z
      .object({
        mode: z.literal("APPLIED"),
        deletedArchiveIds: z.array(z.string()).length(0),
        retainedArchives: z.literal(2),
      })
      .parse(
        lastJson(
          await cli("retention-approved-no-expired", [
            "retention",
            ...configArgs,
            "--apply-retention",
          ]),
        ),
      );
    return {
      status: "PASS",
      scope: "LOCAL_SYNTHETIC_ONLY",
      releaseReadiness: "BLOCKED",
      runId,
      backupImage,
      migrationImage,
      runtime,
      snapshotAt,
      restoreDurationMs,
      localElapsedMs: Math.round(performance.now() - began),
      canonicalMigrations: 33,
      dataManifest: before,
      schemaSha256: schema,
      schemaDriftNegativeControls: [
        "CHECK_EXPRESSION",
        "PARTIAL_INDEX_PREDICATE",
      ],
      sourceFinance,
      restoredFinance,
      wrongKeyCreatedNoDatabase: true,
      existingDatabaseUnchanged: true,
      keyRotationOldArchiveVerified: true,
      retention: { preview, applied },
      preservedResources: { postgres: pgName, volumes },
      externalRpoRtoOffsiteKeyCustody: "NOT_VERIFIED",
    };
  } finally {
    await source.end();
  }
}

let result: Awaited<ReturnType<typeof main>> | undefined;
void main()
  .then((value) => {
    result = value;
  })
  .catch(async (error: unknown) => {
    process.exitCode = 1;
    const sourceLine =
      error instanceof Error
        ? (error.stack?.match(/backup-rehearsal\.ts:(\d+):/)?.[1] ?? null)
        : null;
    const failureCode =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      /^(?:[0-9A-Z]{5}|ERR_ASSERTION|BACKUP_[A-Z_]+)$/.test(error.code)
        ? error.code
        : "BACKUP_REHEARSAL_FAILED";
    await writeFile(
      ".cache/backup-rehearsal-failure.json",
      JSON.stringify(
        {
          status: "FAIL",
          runId,
          phase: currentPhase,
          failureCode,
          sourceLine,
          phases,
        },
        null,
        2,
      ) + "\n",
    );
    console.error(
      "BACKUP_REHEARSAL_FAILED phase=" +
        currentPhase +
        "; inspect private logs; release BLOCKED",
    );
  })
  .finally(async () => {
    if (startedPostgres) {
      try {
        const label = (
          await docker("verify-stop-ownership", [
            "inspect",
            pgName,
            "--format",
            '{{index .Config.Labels "fluivix.backup-rehearsal"}}',
          ])
        ).trim();
        assert.equal(label, runId);
        await docker("stop-owned-preserve-data", ["stop", pgName]);
      } catch {
        process.exitCode = 1;
        console.error("BACKUP_OWNED_STOP_FAILED");
      }
    }
    if (result && !process.exitCode) {
      await writeFile(
        ".cache/backup-rehearsal-result.json",
        JSON.stringify(
          { ...result, phases, checkedAt: new Date().toISOString() },
          null,
          2,
        ) + "\n",
      );
      console.log(
        "BACKUP_REHEARSAL_PASS; local synthetic only; release BLOCKED",
      );
    }
  });
