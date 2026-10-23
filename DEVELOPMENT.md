# FluivixEdu implementation checkpoint

This repository currently implements the identity module and a restricted student
directory used to verify tenant isolation. It does **not** implement all P0 Web,
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
Docker Compose. They do not certify staging restore, platform MFA or mobile.
If supplying `TEST_DATABASE_URL`, use a fresh disposable database ending `_test`.

`pnpm openapi:generate` reads compiled Nest controllers/DTOs; regenerate the client
with `pnpm client:generate`. Build the API first. No handwritten frontend response
DTOs are used. Local UI skills and source packs remain ignored as requested.
Taste inspection runs only when its installed local skill files are available;
CI must provision those verified skills before invoking that inspection.

See local `docs/ai/08_PROGRESS.md` and `docs/ai/14_RELEASE_EVIDENCE.md` for actual
evidence and remaining scope. Those files are intentionally not pushed to Git.
