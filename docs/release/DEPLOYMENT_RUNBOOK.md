# Deployment runbook

Status: **BLOCKED** for staging/production execution. No target infrastructure,
approved credentials, operator identities or deployment authorization was supplied.
`docker-compose.yml` provides local dependencies; it is not a complete production
deployment. This task has not deployed an environment or published an app.

For a reviewable candidate, collect the immutable Git SHA, frozen lockfile,
OpenAPI/client drift check, all fresh test reports, dependency scan and gate
approvals. Build API/worker and Web/Platform with the intended public API origin;
Next public variables are build-time configuration. Mobile public variables may
contain only a public HTTPS API URL/project identifier, never server secrets.

Provision isolated PostgreSQL/Redis, dedicated queues, restricted network,
HTTPS endpoints for Web/API/Platform, Mail provider, secret manager, monitoring,
backup/PITR and audit retention. Set separate platform keys/cookies/audience;
configure trusted Web/Platform origins and API bind policy. Keep platform
credentials separate from tenant identities. Validate subscription and privacy
notice configuration before admitting real learners.

Follow MIGRATION_AND_ROLLBACK.md on an approved staging copy, start API/worker,
verify DB + Redis + queue consumption + email delivery + redacted logs, deploy
clients, then execute UAT with two synthetic tenants and all roles. Verify
failure alerts and rollback. A health200 without worker/receipt evidence is
insufficient. Complete RELEASE_GATE.md and request final approval only after
the concrete candidate and all review artifacts are ready.
