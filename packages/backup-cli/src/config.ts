import { readFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { isIP } from "node:net";
import { z } from "zod";
import {
  BackupError,
  defaultMaxArchiveBytes,
  type KeyProvider,
} from "./archive";

export const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const absoluteFile = z
  .string()
  .refine(
    (value) =>
      path.isAbsolute(value) && !path.basename(value).startsWith(".env"),
  );
const keyId = z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/);
export const backupConfigSchema = z
  .object({
    version: z.literal(1),
    connection: z
      .object({
        host: z
          .string()
          .max(253)
          .refine(
            (value) =>
              isIP(value) !== 0 || /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(value),
          ),
        port: z.number().int().min(1).max(65535),
        user: identifier,
        database: identifier.refine(
          (value) => !["postgres", "template0", "template1"].includes(value),
        ),
        passwordFile: absoluteFile,
        transport: z.enum(["verify-full", "local-test"]).default("verify-full"),
        rootCertificateFile: absoluteFile.optional(),
      })
      .strict(),
    archiveDirectory: absoluteFile,
    workDirectory: absoluteFile,
    activeKeyId: keyId,
    keys: z
      .array(z.object({ id: keyId, file: absoluteFile }).strict())
      .min(1)
      .max(32),
    maxArchiveBytes: z
      .number()
      .int()
      .min(1024)
      .max(64 * 1024 ** 3)
      .default(defaultMaxArchiveBytes),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(24 * 60 * 60 * 1000)
      .default(15 * 60 * 1000),
    retention: z
      .object({
        keepCount: z.number().int().min(2).max(366).default(14),
        maxAgeDays: z.number().int().min(1).max(3660).default(30),
        allowApply: z.boolean().default(false),
      })
      .strict()
      .default({ keepCount: 14, maxAgeDays: 30, allowApply: false }),
  })
  .strict();
export type BackupConfig = z.infer<typeof backupConfigSchema>;
export type DatabaseConnection = BackupConfig["connection"] & {
  password: string;
  ca?: string;
};

function within(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
export async function regularFile(filename: string, secret: boolean) {
  if (!path.isAbsolute(filename) || path.basename(filename).startsWith(".env"))
    throw new BackupError("BACKUP_FILE_UNSAFE");
  const info = await lstat(filename);
  const actual = await realpath(filename),
    expected = path.resolve(filename);
  const matches =
    process.platform === "win32"
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  if (!info.isFile() || info.isSymbolicLink() || !matches)
    throw new BackupError("BACKUP_FILE_UNSAFE");
  if (
    secret &&
    process.platform !== "win32" &&
    ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
  )
    throw new BackupError("BACKUP_FILE_UNSAFE");
  return info;
}
export function validateConfig(value: unknown): BackupConfig {
  const parsed = backupConfigSchema.safeParse(value);
  if (!parsed.success) throw new BackupError("BACKUP_CONFIG_INVALID");
  const config = parsed.data;
  if (
    new Set(config.keys.map((key) => key.id)).size !== config.keys.length ||
    !config.keys.some((key) => key.id === config.activeKeyId)
  )
    throw new BackupError("BACKUP_CONFIG_INVALID");
  if (
    within(config.archiveDirectory, config.workDirectory) ||
    within(config.workDirectory, config.archiveDirectory)
  )
    throw new BackupError("BACKUP_DIRECTORIES_MUST_BE_SEPARATE");
  for (const file of [
    ...config.keys.map((key) => key.file),
    config.connection.passwordFile,
  ])
    if (
      within(config.archiveDirectory, file) ||
      within(config.workDirectory, file)
    )
      throw new BackupError("BACKUP_KEYS_MUST_BE_SEPARATE");
  if (
    config.connection.transport === "verify-full" &&
    !config.connection.rootCertificateFile
  )
    throw new BackupError("BACKUP_DATABASE_CA_REQUIRED");
  if (
    config.connection.transport === "local-test" &&
    (process.env.NODE_ENV !== "test" ||
      !["localhost", "127.0.0.1", "::1"].includes(config.connection.host) ||
      !config.connection.database.endsWith("_test"))
  )
    throw new BackupError("BACKUP_PLAINTEXT_DATABASE_TRANSPORT_FORBIDDEN");
  return config;
}
export async function loadConfig(filename: string) {
  await regularFile(filename, false);
  if ((await lstat(filename)).size > 32 * 1024)
    throw new BackupError("BACKUP_CONFIG_INVALID");
  try {
    return validateConfig(JSON.parse(await readFile(filename, "utf8")));
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("BACKUP_CONFIG_INVALID");
  }
}
export async function loadConnection(
  config: BackupConfig,
): Promise<DatabaseConnection> {
  await regularFile(config.connection.passwordFile, true);
  if ((await lstat(config.connection.passwordFile)).size > 4096)
    throw new BackupError("BACKUP_PASSWORD_FILE_INVALID");
  const password = (
    await readFile(config.connection.passwordFile, "utf8")
  ).replace(/\r?\n$/, "");
  if (!password || /[\r\n\0]/.test(password))
    throw new BackupError("BACKUP_PASSWORD_FILE_INVALID");
  if (config.connection.transport === "verify-full") {
    const file = config.connection.rootCertificateFile;
    if (!file) throw new BackupError("BACKUP_DATABASE_CA_REQUIRED");
    await regularFile(file, false);
    return { ...config.connection, password, ca: await readFile(file, "utf8") };
  }
  return { ...config.connection, password };
}
export function keyProvider(config: BackupConfig): KeyProvider {
  const files = new Map(config.keys.map((key) => [key.id, key.file]));
  return async (id) => {
    const file = files.get(id);
    if (!file) throw new BackupError("BACKUP_KEY_UNKNOWN");
    const info = await regularFile(file, true);
    if (info.size !== 32) throw new BackupError("BACKUP_KEY_INVALID");
    return readFile(file);
  };
}
