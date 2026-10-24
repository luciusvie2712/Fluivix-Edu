# FluivixEdu implementation checkpoint

This repository implements tenant/platform identity, subscriptions, operational audit,
student profiles and the Prompt02 Expo app with teaching, published results,
guardian finance and inbox APIs. Full P0 release remains BLOCKED; see
`docs/ai/evidence/mobile/HANDOFF.md` for all21 mobile routes, all30 TC statuses and
actual evidence. Signed native builds and physical-device acceptance are not verified.

## Mobile on Windows PowerShell

For **Expo Go on an Android phone**, explicitly select Expo Go mode:

```powershell
pnpm.cmd --filter @fluivix/mobile dev:go --clear
```

The terminal must say `Using Expo Go`, not `Using development build`. If the
server is already running in the other mode, press `s` then scan the new QR.
The phone and computer must share a reachable network. On a physical phone,
`localhost` refers to the phone; use the computer's LAN IPv4 for
`EXPO_PUBLIC_API_BASE_URL` (for example `http://<computer-ip>:4000`) and run the
API with `API_HOST=0.0.0.0` for intentional LAN testing. USB `adb reverse` is
the alternative documented below. Do not change production exposure for this.

Expo Go does not provide Android remote push. Notification module loading and
push registration are therefore skipped in Expo Go; authentication and the API
inbox remain available. Actual push testing requires a development/release build.
The SDK58 notification entry imports ExpoTopicSubscriptionModule, which is absent
in the tested Expo Go runtime; importing that entry eagerly can keep the app at
its splash. Native push imports must remain behind the runtime capability check.

Run from the repository root. Existing `.env` is never overwritten by these commands.
The following API runner creates a fresh isolated synthetic PostgreSQL database and
does not need the development database to be reset. It does not start a push/mail worker.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:generate
pnpm.cmd --filter @fluivix/api build
$env:SEED_PASSWORD = Read-Host 'Synthetic seed password (16+ characters)'
pnpm.cmd dev:mobile:api
```

Keep that terminal running. In a second terminal:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4200'
pnpm.cmd --filter @fluivix/mobile dev
```

Synthetic users: `teacher@example.test`, `student@example.test`,
`guardian@example.test`, with the password entered above. Select Center A; the
guardian has two verified synthetic children and the teacher has a20-person class.
Teacher also has a second role/tenant for switching checks. Starting a fresh isolated
runner restores fixtures after destructive test flows. No real consent is seeded.

Android emulator/device requires installed Android SDK/adb and an attached target.
With USB/emulator `adb reverse tcp:4200 tcp:4200` makes this localhost API reachable.
For LAN development set `API_HOST=0.0.0.0` before starting the synthetic API and set
`EXPO_PUBLIC_API_BASE_URL` to this Windows machine's reachable LAN address; configure
the firewall intentionally. Production requires an HTTPS API origin. Never put
server secrets in Expo public variables. iOS native builds require macOS/Xcode or
a configured EAS account/project and signing credentials. None were available here.

```powershell
pnpm.cmd test:mobile:api
pnpm.cmd --filter @fluivix/mobile test
pnpm.cmd --filter @fluivix/mobile build
```

The last command exports Hermes bundles, not APK/IPA. Prepared Maestro journeys
are in `apps/mobile/.maestro/`; they require a real installed development build,
Maestro/adb, fresh synthetic API data and the `SEED_PASSWORD` flow variable. They
have not been executed on a device. Expo Push requires a configured EAS project,
physical device, platform push credentials, an approved privacy notice/version and
consent; default `PUSH_PROVIDER=disabled`. Inbox APIs remain independent of OS permission.

If local Redis6379 is occupied by another project, use a dedicated port:

```powershell
$env:FLUIVIX_REDIS_PORT='6385'
docker compose up -d --wait redis
$env:TEST_REDIS_URL='redis://127.0.0.1:6385'
```

For an existing *synthetic local* development DB, `pnpm.cmd db:migrate` followed
by `pnpm.cmd db:seed:mobile` adds fixtures without overwriting existing credentials.
It requires `SEED_PASSWORD`, refuses production/remote databases, and does not imply
all production migrations or backup/restore checks are approved.

## Windows PowerShell

Node 24 and pnpm 10.34.7 are used. Install with `pnpm install --frozen-lockfile`,
then `pnpm db:generate` and `pnpm --filter @fluivix/server-crypto build`.
Provide the variables in `.env.example` through your process environment or local
secret configuration. Never commit `.env` or signing/encryption keys.

With Docker Desktop running, `docker compose up -d` starts PostgreSQL, Redis and
Mailpit on loopback ports. Run `pnpm db:migrate`, supply an explicit
`SEED_PASSWORD`, then `pnpm db:seed` for synthetic local accounts. Seed refuses
production mode and non-local database endpoints. It never changes existing user
credentials. The synthetic owner email is `owner@example.test`.

Start API using `pnpm --filter @fluivix/api build` then
`pnpm --filter @fluivix/api start`. Start web with
`pnpm --filter @fluivix/web dev`. API binds to loopback, port 4000; web port 3000.
The API uses Secure, HttpOnly, SameSite=Strict cookies; use localhost in the browser
or HTTPS when served through a reverse proxy. Browser access tokens stay in memory.

The local mail worker (`pnpm --filter @fluivix/worker start` after its build)
requires Redis, Mailpit, `NODE_ENV=development`, `WEB_ORIGIN` on localhost, and
the same `OUTBOX_TOKEN_KEY` as the API. It sends only to loopback Mailpit port
1025. The user has approved Resend. To select that driver, configure
`MAIL_PROVIDER=resend`, `RESEND_API_KEY`, a verified `MAIL_FROM`, and the intended
`WEB_ORIGIN` through local/secret-manager configuration. No live Resend send has
been verified because the key is not configured. Retries reuse the event ID and
stop before the provider's 24-hour idempotency window expires. An uncertain local
SMTP acceptance becomes UNKNOWN and a retained failed job,
requiring operator review; it is never blindly retried or marked successful.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm test:integration`, `pnpm test:e2e`, `pnpm audit`.
Integration and browser tests start isolated **real PostgreSQL 17.6** clusters
under ignored `.cache/` and contain only synthetic data. Worker integration and
email browser tests additionally require the real Redis and Mailpit services from
Docker Compose. Platform MFA tests cover enrollment, replay, recovery and session
rotation; they do not certify staging restore, external UAT or mobile.
If supplying `TEST_DATABASE_URL`, use a fresh disposable database ending `_test`.

`pnpm openapi:generate` reads compiled Nest controllers/DTOs; regenerate the client
with `pnpm client:generate`. Build the API first. No handwritten frontend response
DTOs are used. Local UI skills and source packs remain ignored as requested.
Taste inspection runs only when its installed local skill files are available;
CI must provision those verified skills before invoking that inspection.

See local `docs/ai/08_PROGRESS.md` and `docs/ai/14_RELEASE_EVIDENCE.md` for actual
evidence and remaining scope. Those files are intentionally not pushed to Git.

## Platform identity

Run the separate app with `pnpm --filter @fluivix/platform dev` on port 3001.
Configure a distinct random `PLATFORM_JWT_SECRET` and 32-byte hex `PLATFORM_MFA_KEY`
in the API environment. Keep the encryption key in secret management; losing it
requires verified operator recovery. Platform identities have separate SQL tables,
JWT issuer/audience/key and Secure HttpOnly cookie. MFA is mandatory; challenge
expires after five minutes/five failed attempts. Access lasts five minutes, rotating
refresh sessions have a fixed eight-hour ceiling. A recovery code revokes existing
sessions and requires new TOTP enrollment before granting access.

For operator provisioning after API build, supply `PLATFORM_BOOTSTRAP_EMAIL`,
`PLATFORM_BOOTSTRAP_NAME`, and a unique `PLATFORM_BOOTSTRAP_PASSWORD` (16+ characters)
through the environment, then `pnpm exec tsx tooling/provision-platform.ts`.
The tool never overwrites existing credentials. The local synthetic seed additionally
creates platform@example.test using the explicitly supplied seed password.
No support impersonation or access to student content is provided by platform auth.
The overview displays actual tenant lifecycle counts. Platform operators can create
plans, provision a pending center with an owner invitation, resend unused invitations,
update contact metadata, suspend/reactivate with an audited reason, and assign
non-overlapping subscription periods. Owner activation uses the real mail worker.
Plan terms become immutable once subscribed; create a new plan for changed terms.
VND values cross the API as canonical decimal strings and persist as PostgreSQL
BIGINT, including values above JavaScript's safe integer range.

Owners/managers can view their actual plan and usage at `/app/settings`. Student
and account quotas are enforced under the tenant row lock; class/storage quota
enforcement awaits those resource modules. This settings page does not yet cover
rooms or the full tenant profile. Most education/finance modules remain pending.
Live Resend verification awaits private configuration.

Platform operational audit (`/platform/audit`) supports exact actor/action/resource
and half-open timestamp filters with server pagination. Its response explicitly
selects metadata and excludes free-text reasons, authentication and learner content.
`/platform/system-health` reports actual current-process uptime, PostgreSQL round-trip
and persisted outbox/delivery counts. Worker heartbeat is explicitly not configured;
these counters do not certify worker liveness or historical SLA. Support access is
disabled pending an approved break-glass policy; no impersonation endpoint exists.

## Student profiles

Staff can create profiles without accounts, search by code/name, filter by status,
edit permitted fields and deactivate with confirmation/reason. The backend checks
tenant scope and permissions, masks private/contact fields for limited viewers,
locks quota changes and rejects stale profile versions with 409. Deactivation keeps
history; reactivation rechecks the active student quota. Creation/enrollment dates
use the tenant timezone; migration backfill derives historical dates from creation.
Imports and profile tabs for classes/attendance/grades/finance/guardians remain pending.

Selected tenant/role persists only in the server session and is revalidated on refresh.
A context switch rejects access tokens carrying the old context. Revoked membership
cannot be restored by refresh; the user returns to explicit context selection.
No access token or personal data is stored in localStorage/sessionStorage.
