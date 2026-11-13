# Encrypted PostgreSQL backup jobs

This CLI backs up one PostgreSQL database using `pg_dump --format=custom`,
encrypts the stream with AES-256-GCM and publishes an archive only after the dump
exits successfully. The authenticated header binds the archive ID, timestamp and
key ID. A failed job leaves no published partial archive. Logs contain fixed
status codes and archive metadata; never dump configuration, passwords or keys.

The image uses pinned Node 24.22.3 and PostgreSQL 17.12 clients. It runs as UID
1000 with a read-only root filesystem, no capabilities and a private work tmpfs.
Build from the repository root:

```sh
docker build -f infra/pilot/Dockerfile --target backup -t fluivixedu-backup:operator-reviewed .
```

## Operator setup

Copy `config.example.json` into a protected **separate keys directory** as
`config.json`. Configure the actual hostname and trusted CA. Production connections
require `verify-full`, including hostname verification. `local-test` is accepted
only with `NODE_ENV=test`, a loopback host and database names ending in `_test`.
No production plaintext transport override exists.

Provide the password as a private file, never a URL in command arguments. Set
`FLUIVIX_BACKUP_KEYS_DIR` and `FLUIVIX_BACKUP_ARCHIVE_DIR` in the operator's process
environment to distinct, existing canonical absolute directories. Do not edit the
application `.env`. On Linux both directories must belong to UID 1000, mode 0700;
password and 32-byte key files must be owned by that UID, mode 0600. Symlinks and
junctions are rejected. Windows ACL protection is **NOT_VERIFIED**; the deployment
example targets Linux. Protect the host disk and swap where plaintext may appear.

Initialize a new key using `init-key --key-file ABSOLUTE_NEW_FILE` in a one-time
isolated container with only the keys directory mounted writable. The key is
generated internally, never printed and existing files are refused. Normal jobs
mount that directory read-only. Retain previous key IDs/files when rotating the
active key; test both old and new archives before retiring a key. Loss of a key
means loss of the corresponding backups.

```sh
docker compose -f infra/backup/compose.yaml --profile manual run --rm --no-deps backup backup --config /run/fluivix-backup/keys/config.json
docker compose -f infra/backup/compose.yaml --profile manual run --rm --no-deps backup verify --config /run/fluivix-backup/keys/config.json --archive backup-UUID.fvbak
docker compose -f infra/backup/compose.yaml --profile manual run --rm --no-deps backup retention --config /run/fluivix-backup/keys/config.json
```

These examples use placeholders. `verify` authenticates the whole archive without
restoring it. Retention defaults to preview; actual deletion requires both
`retention.allowApply=true` in reviewed configuration and `--apply-retention`.
It authenticates every recognized archive before deleting anything, refuses
unknown keys/tampering and preserves at least `keepCount` archives. Only archives
beyond that count **and** older than `maxAgeDays` qualify. Keep a verified offsite
copy before approving deletion. An interrupted lock requires operator inspection;
there is no automatic stale-lock deletion.

## Restore and admission

Restore only a trusted archive into a **new database**. PostgreSQL custom dumps
can contain executable SQL; authentication establishes integrity under the backup
key, not that an untrusted author produced safe SQL. The restore role needs LOGIN
and CREATEDB but must be NOSUPERUSER, NOCREATEROLE, NOREPLICATION and have no
server-file/program roles. Use a separate appropriately scoped backup role for
dumping the application database. Do not grant cluster superuser to the job.

```sh
docker compose -f infra/backup/compose.yaml --profile manual run --rm --no-deps backup restore --config /run/fluivix-backup/keys/config.json --archive backup-UUID.fvbak --target-database fluivixedu_restored_review --confirm-create
```

The entire archive is authenticated before target creation or SQL execution.
Restore uses one transaction, exits on errors and never drops, cleans or overwrites
an existing database. A failed newly created target is retained for inspection.
Plaintext is staged only in the private work directory to enforce that boundary
and removed afterward. Reserve enough work space for the decrypted custom dump;
unlinking is not a claim of secure SSD erasure. For restore/verify, mount the
archive directory read-only using an operator-reviewed compose override; restore
locks the work directory rather than modifying the archive directory.

The success status explicitly requires application verification. Before admitting
users: verify canonical migration checksums, run migration deploy from the trusted
release image, compare expected schema and data, check tenant isolation, invoices,
payment allocation/idempotency and audit history, then approve the cutover. The CLI
does not switch application traffic or run reverse migrations. Review PostgreSQL
17.12's index/reindex guidance against the restored copy and take a new full backup.

This covers a single database, not cluster roles, object storage or deployment
configuration. Preserve application MFA, outbox and privacy-export keys separately
from the backup key; encrypted database values depend on those application keys.
Docker volumes are not an offsite secret manager. Schedule approval, encrypted
offsite storage, separate key custody, alert delivery, a staging restore rehearsal
and measured production RPO/RTO remain external release gates. `cron.example` is
disabled and must be adapted and approved; no scheduler is installed by this work.

## Local synthetic rehearsal

After building API/worker and completing `node tooling/pilot-rehearsal.mjs`, run
`TEST_REDIS_URL=redis://127.0.0.1:YOUR_TEST_PORT pnpm test:backup`. The rehearsal
uses new labelled PostgreSQL/secret/archive volumes, canonical migration SQL from
the verified pilot image and synthetic data created through existing services.
It compares every public table and schema constraints/indexes/triggers/functions,
checks key rotation and rejected restores, and exercises the real restored API's
tenant and financial boundaries. It stops only its own database and preserves all
volumes. A local PASS does not establish production recovery objectives or offsite
custody. Private phase logs stay in `.cache`; only sanitized results are retained
in release evidence.
