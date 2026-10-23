# FluivixEdu implementation checkpoint

This repository currently implements tenant/platform identity, center subscriptions,
operational audit/diagnostics, and scoped student profile management. It does **not** implement all P0 Web,
Platform or business modules. Do not deploy it for real learner data.

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
