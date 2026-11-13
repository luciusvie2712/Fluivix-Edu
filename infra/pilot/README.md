# Isolated synthetic pilot

This is a local deployment rehearsal, using only generated fixtures. It does not
deploy staging or authorize real learner data. Production/staging, approved mail
and push, legal/UAT approval, physical mobile devices, off-host backups and key
custody remain release gates.

Requirements: Docker Engine/Compose v2, Node 24.22.2, pnpm 10.34.7 and OpenSSL.
The database template uses PostgreSQL17.11 for the upstream security fixes after
17.6. The rehearsal creates a fresh isolated database; it never upgrades an
existing developer or customer volume. For an existing17.x deployment, review
the [17.11 migration notes](https://www.postgresql.org/docs/17/release-17-11.html),
including the `btree_gist` index/reindex requirements, on a restored copy first.
Do not restart the developer PostgreSQL service just to run this rehearsal.
Redis7.4.12 and Mailpit1.33.1 are selected from their upstream patched releases;
the pilot pins exact image digests. Existing Redis/mailbox volumes are not
silently upgraded or cleared. CI and newly created test services exercise these
versions separately from any services already running on the workstation.
On Windows, set `PILOT_OPENSSL` to the installed OpenSSL executable if it is not
on PATH. Run from the repository root. Never source a customer `.env` for this
stack. Use a new private directory and candidate tag; initialization refuses to
overwrite existing keys. The directory must be one immediate child of `.cache`.

The automated equivalent is `node tooling/pilot-rehearsal.mjs`. It requires a
fresh namespace, records sanitized phase evidence, and stops its owned containers
while retaining data volumes. For another run, set `PILOT_PROJECT` to a new name
matching `fluivixedu-pilot-<suffix>`; existing logs, keys and volumes are retained.

```powershell
node infra/pilot/prepare.mjs .cache/pilot-private
$env:PILOT_SECRETS_DIR=(Resolve-Path .cache/pilot-private).Path
$env:PILOT_IMAGE_TAG='<reviewed-sha>-candidate'
docker compose -f infra/pilot/compose.yaml config --quiet
docker compose -f infra/pilot/compose.yaml --profile migration build
docker compose -f infra/pilot/compose.yaml up -d --wait postgres redis mailpit
docker compose -f infra/pilot/compose.yaml --profile migration run --rm migrate
docker compose -f infra/pilot/compose.yaml exec -T postgres sh -c 'PGPASSWORD="$(cat /run/secrets/migrator_password)" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U fluivix_migrator -d fluivixedu_pilot -f /pilot/grant-application.sql'
docker compose -f infra/pilot/compose.yaml up -d --wait api worker web platform edge
Get-Content -Raw tooling/pilot-seed.mjs | docker compose -f infra/pilot/compose.yaml exec -T api node --input-type=module
node tooling/pilot-smoke.mjs
```

The seed command requires an empty named pilot database and uses the restricted
application role. It refuses an existing population; it never resets rate limits,
deletes history, or seeds automatically at application startup. Do not re-run it
after a successful seed. The HTTPS smoke initially enrolls the synthetic platform
identity in MFA. Repeated smoke runs require the current MFA enrollment flow;
they must not reset an existing platform identity.

All five application/migration targets build Linux dependencies from the frozen
lockfile. Runtime API/worker dependencies install production-only, offline and
frozen from that same lockfile, preserving the relative API/worker layout. Client
images enable `FLUIVIX_CONTAINER_BUILD=true` for Next standalone output with
monorepo tracing and copied static assets. Normal local builds keep their existing
`next start` workflow. The migration image uses a separate pinned Prisma CLI
production workspace and includes its native engine before read-only startup.
`PUBLIC_API_URL` is a public build argument, baked into both clients; changing
it requires rebuilding. No server secret is a build argument. `.dockerignore`
allows only required source and explicitly excludes host dependencies, generated
builds, `.env`, private keys and cache directories.

The JSON secret mount is read only at process startup. It accepts a fixed key
allowlist and never evaluates shell code or prints values. API and worker use
`fluivix_app`; only the one-shot migration task receives the schema-owner URL.
The bootstrap database administrator is confined to the database container.
App roles have no superuser, database/schema creation, role administration, role
inheritance from the migrator, or migration-history access. Apply grants explicitly
after each migration. No replica migrates on startup.

API, worker, clients and edge run as nonroot, with read-only root filesystems,
capabilities dropped and no-new-privileges. Their `/tmp` is bounded volatile
storage. Only edge publishes ports, bound to 127.0.0.1:58443 (Web), 58444
(Platform), 58445 (API). Database, Redis and Mailpit have no published ports and
use an internal Docker network. The worker deliberately runs in test mode with
Mailpit, external push disabled and scheduled generation disabled. This mode
must not be copied to real-data deployment. The mock-free business API runs in
production mode; Mailpit is a real local SMTP sink, not evidence of external
email delivery.

The generated, two-day self-signed certificate has localhost/127.0.0.1 SANs. The
smoke trusts that exact certificate and verifies hostname and chain; it does not
disable TLS verification or import a CA into the machine trust store. HTTPS
terminates at the edge; this single-host pilot does not claim encrypted internal
database/Redis links. Compose file secrets are mounted host files, not an
encrypted secret manager. POSIX modes from preparation do not establish Windows
ACL protection: keep the cache on a private user-controlled volume. File secrets
are readable by their container UID through explicit mounts; their containing
host directory remains mode0700 on POSIX. Real-data
operation requires reviewed secret-manager access, file ownership and rotation.

The API currently uses the direct proxy socket for IP rate limits. The pilot
keeps that fail-closed behavior and does not trust client-supplied forwarded IPs;
a deployed multi-user edge needs an explicit, narrowly trusted proxy configuration
and rate-limit rehearsal before admitting users. A healthcheck's expected401
proves API liveness and the auth boundary; readiness additionally requires a real
MFA health response, fresh worker heartbeat and consumed synthetic mail.

## Rollout and recovery

Record image IDs and Git SHA before every rollout. Run migration separately and
preserve all 33 published migrations and business records. Drain/quiesce API and
worker together before changing binaries. Migration033 introduced `FEE_REMINDER`;
older workers must not consume its events. An old image is eligible for rollback
only after its schema/event compatibility has been tested on a restored copy.
Do not reverse migrations or discard unknown delivery/payment outcomes.

Git's published SQL uses LF. The Linux build normalizes Windows CRLF checkout
transport in its disposable build workspace, leaving repository SQL unchanged;
the rehearsal compares all33 database checksums to canonical source bytes. Before
using a candidate on an existing staging database, compare its actual historical
checksums and stop for review on any difference. Never repair transport drift by
rewriting applied SQL or `_prisma_migrations`.

For a bad runtime configuration, stop the affected owned services, restore the
previous reviewed configuration/secret reference, and recreate the known-good
immutable images with `up -d --no-build --force-recreate`. Re-run HTTPS/auth,
worker and data-integrity checks. Restoring the same candidate after a deliberate
configuration fault proves configuration recovery only; it does not prove
compatibility of an earlier application version. Never retag an image to make
an unverified rollback look successful.

To stop this stack while preserving its named data volumes:

```powershell
docker compose -f infra/pilot/compose.yaml stop
```

Do not use `down -v`, global prune/flush, or an unnamed database reset as a
recovery command. Backup/restore and older-binary rollback require separate
measured evidence. No production readiness claim follows from this README.

If host Application Control prevents a native Windows Hermes compiler from
starting, keep that policy in place. The `all-builds` verification target runs
the complete frozen workspace build with the SDK's Linux compiler on the same
machine's Docker engine:

```powershell
docker build -f infra/pilot/Dockerfile --target build-evidence --no-cache-filter all-builds --build-arg PUBLIC_API_URL=https://localhost:58445/api/v1 --output type=local,dest=.cache/pilot-build-evidence .
```

It builds all eight tasks without cache and validates actual Android/iOS `.hbc`
headers. It does not execute the blocked Windows binary, change security policy,
switch JavaScript engines or disable Hermes bytecode. The host Windows export
remains separately recorded as blocked. These JS/bytecode exports are not signed
installable native apps or physical-device release evidence. This verification
target exports only build evidence and app exports, and is not an application
deployment image.

Implementation references: [Docker file secrets](https://docs.docker.com/compose/how-tos/use-secrets),
[Compose networking](https://docs.docker.com/compose/how-tos/networking/),
[Next standalone monorepo output](https://nextjs.org/docs/pages/api-reference/config/next-config-js/output).
