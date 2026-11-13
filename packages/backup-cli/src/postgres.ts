import { spawn, execFile } from "node:child_process";
import { checkServerIdentity } from "node:tls";
import { Client } from "pg";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BackupError } from "./archive";
import { identifier, type DatabaseConnection } from "./config";

export type DumpProcess = {
  source: Readable;
  completed: Promise<void>;
  cancel: () => void;
};
export type PgTools = {
  versions: () => Promise<{ dump: string; restore: string }>;
  dump: (database: string, signal: AbortSignal) => DumpProcess;
  restore: (
    database: string,
    source: Readable,
    signal: AbortSignal,
  ) => Promise<void>;
};
export function quoteDatabase(value: string) {
  if (!identifier.safeParse(value).success)
    throw new BackupError("BACKUP_DATABASE_IDENTIFIER_INVALID");
  return '"' + value + '"';
}
export function postgresClient(
  connection: DatabaseConnection,
  database: string,
) {
  quoteDatabase(database);
  if (connection.transport === "verify-full" && !connection.ca)
    throw new BackupError("BACKUP_DATABASE_CA_REQUIRED");
  return new Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    application_name: "fluivixedu-backup",
    ssl:
      connection.transport === "verify-full"
        ? {
            ca: connection.ca,
            rejectUnauthorized: true,
            checkServerIdentity: (_hostname, certificate) =>
              checkServerIdentity(connection.host, certificate),
          }
        : false,
  });
}
export async function verifyServer(client: Client) {
  const value = await client.query<{ server_version_num: string }>(
    "SHOW server_version_num",
  );
  const version = Number(value.rows[0]?.server_version_num);
  if (!Number.isInteger(version) || version < 170012 || version >= 180000)
    throw new BackupError("BACKUP_PATCHED_POSTGRES17_REQUIRED");
  return version;
}
export function verifyClientVersion(value: string) {
  const match = /PostgreSQL\)\s+(\d+)\.(\d+)/.exec(value);
  if (!match || Number(match[1]) !== 17 || Number(match[2]) < 12)
    throw new BackupError("BACKUP_PATCHED_POSTGRES17_CLIENT_REQUIRED");
  return value.trim();
}
function clientEnvironment(
  connection: DatabaseConnection,
  database: string,
): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    [
      "PATH",
      "Path",
      "SystemRoot",
      "SYSTEMROOT",
      "WINDIR",
      "TEMP",
      "TMP",
    ].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]!]],
    ),
  );
  return {
    ...inherited,
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGUSER: connection.user,
    PGDATABASE: database,
    PGPASSWORD: connection.password,
    PGAPPNAME: "fluivixedu-backup",
    PGSSLMODE:
      connection.transport === "verify-full" ? "verify-full" : "disable",
    ...(connection.rootCertificateFile
      ? { PGSSLROOTCERT: connection.rootCertificateFile }
      : {}),
  };
}
export function directPgTools(connection: DatabaseConnection): PgTools {
  const run = (
    name: "pg_dump" | "pg_restore",
    args: string[],
    database: string,
    signal: AbortSignal,
  ) => {
    const child = spawn(name, args, {
      shell: false,
      windowsHide: true,
      env: clientEnvironment(connection, database),
      signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Never log server error text, query fragments, connection URIs or passwords.
    child.stderr.resume();
    const completed = new Promise<void>((resolve, reject) => {
      child.once("error", () =>
        reject(new BackupError("BACKUP_POSTGRES_TOOL_START_FAILED")),
      );
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new BackupError("BACKUP_POSTGRES_TOOL_FAILED")),
      );
    });
    // Consumers can await later without creating an unhandled rejection window.
    void completed.catch(() => {});
    return { child, completed };
  };
  return {
    async versions() {
      const values: string[] = [];
      for (const name of ["pg_dump", "pg_restore"] as const) {
        const text = await new Promise<string>((resolve, reject) =>
          execFile(
            name,
            ["--version"],
            {
              windowsHide: true,
              env: clientEnvironment(connection, connection.database),
              timeout: 10000,
              maxBuffer: 4096,
            },
            (error, stdout) =>
              error
                ? reject(new BackupError("BACKUP_POSTGRES_CLIENT_UNAVAILABLE"))
                : resolve(stdout),
          ),
        );
        values.push(verifyClientVersion(text));
      }
      return { dump: values[0]!, restore: values[1]! };
    },
    dump(database, signal) {
      quoteDatabase(database);
      const { child, completed } = run(
        "pg_dump",
        [
          "--format=custom",
          "--compress=gzip:6",
          "--no-owner",
          "--no-acl",
          "--no-password",
          "--lock-wait-timeout=10000",
          "--dbname",
          database,
        ],
        database,
        signal,
      );
      child.stdin.end();
      return {
        source: child.stdout,
        completed,
        cancel: () => {
          if (child.exitCode === null) child.kill("SIGTERM");
        },
      };
    },
    async restore(database, source, signal) {
      quoteDatabase(database);
      const { child, completed } = run(
        "pg_restore",
        [
          "--single-transaction",
          "--exit-on-error",
          "--no-owner",
          "--no-acl",
          "--no-password",
          "--dbname",
          database,
        ],
        database,
        signal,
      );
      child.stdout.resume();
      try {
        await pipeline(source, child.stdin, { signal });
        await completed;
      } catch {
        if (child.exitCode === null) child.kill("SIGTERM");
        await completed.catch(() => {});
        throw new BackupError("BACKUP_RESTORE_TRANSACTION_FAILED");
      }
    },
  };
}
