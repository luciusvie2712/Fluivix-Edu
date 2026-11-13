import path from "node:path";
import { readdir, lstat, unlink } from "node:fs/promises";
import { authenticateArchive, BackupError, withArchiveLock } from "./archive";
import { keyProvider, validateConfig, type BackupConfig } from "./config";

export async function retainBackups(
  value: BackupConfig,
  input: { apply: boolean; now?: Date },
) {
  const config = validateConfig(value);
  if (input.apply && !config.retention.allowApply)
    throw new BackupError("BACKUP_RETENTION_APPROVAL_REQUIRED");
  return withArchiveLock(config.archiveDirectory, async () => {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime()))
      throw new BackupError("BACKUP_RETENTION_CLOCK_INVALID");
    const candidates = [];
    // Authenticate every owned archive BEFORE deleting any file. Unknown keys,
    // symlinks, truncation or tampering block the whole apply operation.
    for (const name of await readdir(config.archiveDirectory)) {
      if (!/^backup-[0-9a-f-]{36}\.fvbak$/.test(name)) continue;
      const filename = path.join(config.archiveDirectory, name);
      const before = await lstat(filename);
      const metadata = await authenticateArchive(
        filename,
        keyProvider(config),
        config.maxArchiveBytes,
      );
      const info = await lstat(filename);
      if (
        info.dev !== before.dev ||
        info.ino !== before.ino ||
        info.size !== before.size ||
        info.mtimeMs !== before.mtimeMs
      )
        throw new BackupError("BACKUP_RETENTION_ARCHIVE_CHANGED");
      candidates.push({ filename, metadata, info });
    }
    candidates.sort(
      (a, b) =>
        b.metadata.createdAt.localeCompare(a.metadata.createdAt) ||
        b.metadata.archiveId.localeCompare(a.metadata.archiveId),
    );
    const deleting = candidates.filter(
      (item, index) =>
        index >= config.retention.keepCount &&
        now.getTime() - Date.parse(item.metadata.createdAt) >
          config.retention.maxAgeDays * 86400000,
    );
    for (const item of deleting) {
      const current = await lstat(item.filename);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.dev !== item.info.dev ||
        current.ino !== item.info.ino ||
        current.size !== item.info.size ||
        current.mtimeMs !== item.info.mtimeMs
      )
        throw new BackupError("BACKUP_RETENTION_ARCHIVE_CHANGED");
    }
    if (input.apply) for (const item of deleting) await unlink(item.filename);
    return {
      mode: input.apply ? "APPLIED" : "PREVIEW",
      verifiedArchives: candidates.length,
      keepCount: config.retention.keepCount,
      candidateArchiveIds: deleting.map((item) => item.metadata.archiveId),
      deletedArchiveIds: input.apply
        ? deleting.map((item) => item.metadata.archiveId)
        : [],
      retainedArchives: candidates.length - (input.apply ? deleting.length : 0),
    };
  });
}
