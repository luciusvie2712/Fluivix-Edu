import path from "node:path";
import {
  BackupError,
  sealArchive,
  withAuthenticatedDump,
  withArchiveLock,
  type ArchiveCommit,
} from "./archive";
import {
  validateConfig,
  loadConnection,
  keyProvider,
  type BackupConfig,
} from "./config";
import {
  directPgTools,
  postgresClient,
  quoteDatabase,
  verifyServer,
  type PgTools,
} from "./postgres";

export async function backupDatabase(
  value: BackupConfig,
  suppliedTools?: PgTools,
): Promise<ArchiveCommit> {
  const config = validateConfig(value);
  return withArchiveLock(config.archiveDirectory, async () => {
    const connection = await loadConnection(config);
    const tools = suppliedTools ?? directPgTools(connection);
    await tools.versions();
    const client = postgresClient(connection, connection.database);
    try {
      await client.connect();
      await verifyServer(client);
    } finally {
      await client.end();
    }
    const key = await keyProvider(config)(config.activeKeyId);
    const source = tools.dump(
      connection.database,
      AbortSignal.timeout(config.timeoutMs),
    );
    try {
      return await sealArchive({
        source: source.source,
        sourceCompletion: source.completed,
        directory: config.archiveDirectory,
        key,
        keyId: config.activeKeyId,
        maxBytes: config.maxArchiveBytes,
      });
    } finally {
      key.fill(0);
      source.cancel();
      await source.completed.catch(() => {});
    }
  });
}

export async function restoreDatabase(input: {
  config: BackupConfig;
  filename: string;
  targetDatabase: string;
  confirmCreate: boolean;
  tools?: PgTools;
}) {
  const config = validateConfig(input.config);
  if (input.confirmCreate !== true)
    throw new BackupError("BACKUP_RESTORE_CONFIRMATION_REQUIRED");
  quoteDatabase(input.targetDatabase);
  if (
    [config.connection.database, "postgres", "template0", "template1"].includes(
      input.targetDatabase,
    )
  )
    throw new BackupError("BACKUP_RESTORE_TARGET_FORBIDDEN");
  if (
    config.connection.transport === "local-test" &&
    !input.targetDatabase.endsWith("_test")
  )
    throw new BackupError("BACKUP_RESTORE_TEST_TARGET_REQUIRED");
  const filename = path.resolve(input.filename);
  if (
    path.relative(
      path.resolve(config.archiveDirectory),
      path.dirname(filename),
    ) !== ""
  )
    throw new BackupError("BACKUP_ARCHIVE_OUTSIDE_DIRECTORY");
  return withArchiveLock(config.workDirectory, async () => {
    const connection = await loadConnection(config);
    const tools = input.tools ?? directPgTools(connection);
    await tools.versions();
    return withAuthenticatedDump(
      {
        filename,
        keys: keyProvider(config),
        workDirectory: config.workDirectory,
        maxBytes: config.maxArchiveBytes,
      },
      async (source, metadata) => {
        // This callback is unreachable until the entire archive is authenticated.
        // Even target creation is delayed until after that boundary.
        const admin = postgresClient(connection, "postgres");
        let created = false;
        try {
          await admin.connect();
          await verifyServer(admin);
          const role = await admin.query<{
            unsafe: boolean;
          }>(`SELECT rolsuper OR rolcreaterole OR rolreplication OR NOT rolcreatedb
          OR pg_has_role(current_user, 'pg_execute_server_program', 'MEMBER')
          OR pg_has_role(current_user, 'pg_read_server_files', 'MEMBER')
          OR pg_has_role(current_user, 'pg_write_server_files', 'MEMBER') AS unsafe
          FROM pg_roles WHERE rolname=current_user`);
          if (!role.rows[0] || role.rows[0].unsafe)
            throw new BackupError("BACKUP_RESTORE_ROLE_UNSAFE");
          const present = await admin.query(
            "SELECT 1 FROM pg_database WHERE datname=$1",
            [input.targetDatabase],
          );
          if (present.rowCount)
            throw new BackupError("BACKUP_RESTORE_TARGET_EXISTS");
          await admin.query(
            "CREATE DATABASE " +
              quoteDatabase(input.targetDatabase) +
              " TEMPLATE template0 OWNER " +
              quoteDatabase(connection.user),
          );
          created = true;
          await admin.query(
            "REVOKE ALL ON DATABASE " +
              quoteDatabase(input.targetDatabase) +
              " FROM PUBLIC",
          );
          await tools.restore(
            input.targetDatabase,
            source,
            AbortSignal.timeout(config.timeoutMs),
          );
          return {
            archiveId: metadata.archiveId,
            targetCreated: true,
            restored: true,
            applicationVerificationRequired: true,
          };
        } catch (error) {
          if (error instanceof BackupError) throw error;
          throw new BackupError(
            created
              ? "BACKUP_RESTORE_FAILED_TARGET_RETAINED"
              : "BACKUP_RESTORE_TARGET_CREATE_FAILED",
          );
        } finally {
          await admin.end();
        }
      },
    );
  });
}
