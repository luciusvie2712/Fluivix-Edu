#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BackupError,
  authenticateArchive,
  privateDirectory,
  withArchiveLock,
} from "./archive";
import { keyProvider, loadConfig } from "./config";
import { backupDatabase, restoreDatabase } from "./operations";
import { retainBackups } from "./retention";

function options(args: string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (["--confirm-create", "--apply-retention"].includes(name)) {
      if (flags.has(name)) throw new BackupError("BACKUP_ARGUMENT_INVALID");
      flags.add(name);
      continue;
    }
    if (
      !["--config", "--archive", "--target-database", "--key-file"].includes(
        name,
      ) ||
      values.has(name)
    )
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    const value = args[++index];
    if (!value || value.startsWith("--"))
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    values.set(name, value);
  }
  return { values, flags };
}
function required(values: Map<string, string>, name: string) {
  const value = values.get(name);
  if (!value) throw new BackupError("BACKUP_ARGUMENT_REQUIRED");
  return value;
}
function selectedArchive(directory: string, name: string) {
  if (!/^backup-[0-9a-f-]{36}\.fvbak$/.test(name))
    throw new BackupError("BACKUP_ARCHIVE_NAME_INVALID");
  return path.join(directory, name);
}
export async function main(args: string[]) {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  if (
    major !== 24 ||
    minor === undefined ||
    patch === undefined ||
    minor < 22 ||
    (minor === 22 && patch < 3)
  )
    throw new BackupError("BACKUP_PATCHED_NODE24_REQUIRED");
  const [command, ...rest] = args;
  if (!command || command === "help") {
    console.log(
      "fluivix-backup backup|verify|restore|retention --config ABSOLUTE_JSON_FILE [--archive backup-UUID.fvbak] [--target-database NEW_NAME --confirm-create] [--apply-retention]",
    );
    console.log("fluivix-backup init-key --key-file NEW_ABSOLUTE_FILE");
    return;
  }
  if (
    !["backup", "verify", "restore", "retention", "init-key"].includes(command)
  )
    throw new BackupError("BACKUP_COMMAND_INVALID");
  const { values, flags } = options(rest);
  if (command === "init-key") {
    if (values.size !== 1 || flags.size)
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    const filename = required(values, "--key-file");
    if (
      !path.isAbsolute(filename) ||
      path.basename(filename).startsWith(".env")
    )
      throw new BackupError("BACKUP_KEY_PATH_INVALID");
    await privateDirectory(path.dirname(filename));
    const key = randomBytes(32);
    try {
      await writeFile(filename, key, { flag: "wx", mode: 0o600 });
    } catch {
      throw new BackupError("BACKUP_KEY_CREATE_REFUSED");
    } finally {
      key.fill(0);
    }
    console.log(
      JSON.stringify({
        status: "BACKUP_KEY_CREATED",
        keyBytes: 32,
        existingFileOverwritten: false,
        windowsAclVerification:
          process.platform === "win32" ? "NOT_VERIFIED" : "NOT_APPLICABLE",
      }),
    );
    return;
  }
  if (values.has("--key-file"))
    throw new BackupError("BACKUP_ARGUMENT_INVALID");
  const config = await loadConfig(required(values, "--config"));
  if (command === "backup") {
    if (values.size !== 1 || flags.has("--confirm-create"))
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    if (flags.has("--apply-retention") && !config.retention.allowApply)
      throw new BackupError("BACKUP_RETENTION_APPROVAL_REQUIRED");
    const result = await backupDatabase(config);
    console.log(
      JSON.stringify({
        status: "BACKUP_ARCHIVE_COMMITTED",
        archiveId: result.archiveId,
        keyId: result.keyId,
        createdAt: result.createdAt,
        bytes: result.bytes,
      }),
    );
    if (flags.has("--apply-retention"))
      console.log(
        JSON.stringify({
          status: "BACKUP_RETENTION",
          ...(await retainBackups(config, { apply: true })),
        }),
      );
  } else if (command === "verify") {
    if (values.size !== 2 || flags.size)
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    const metadata = await withArchiveLock(config.workDirectory, () =>
      authenticateArchive(
        selectedArchive(config.archiveDirectory, required(values, "--archive")),
        keyProvider(config),
        config.maxArchiveBytes,
      ),
    );
    console.log(
      JSON.stringify({ status: "BACKUP_ARCHIVE_AUTHENTICATED", ...metadata }),
    );
  } else if (command === "restore") {
    if (values.size !== 3 || flags.has("--apply-retention"))
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    const result = await restoreDatabase({
      config,
      filename: selectedArchive(
        config.archiveDirectory,
        required(values, "--archive"),
      ),
      targetDatabase: required(values, "--target-database"),
      confirmCreate: flags.has("--confirm-create"),
    });
    console.log(
      JSON.stringify({
        status: "BACKUP_RESTORE_CREATED_REVIEW_REQUIRED",
        ...result,
      }),
    );
  } else {
    if (values.size !== 1 || flags.has("--confirm-create"))
      throw new BackupError("BACKUP_ARGUMENT_INVALID");
    console.log(
      JSON.stringify({
        status: "BACKUP_RETENTION",
        ...(await retainBackups(config, {
          apply: flags.has("--apply-retention"),
        })),
      }),
    );
  }
}
if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        status: "BACKUP_OPERATION_FAILED",
        code:
          error instanceof BackupError ? error.code : "BACKUP_OPERATION_FAILED",
      }),
    );
    process.exitCode = 1;
  });
}
