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


### Notification028 upgrade and technical configuration

Stop/drain the prior worker and quiesce relevant API writes before applying028, then start the matching new API/worker build together. The new database send guard requires an actual `device_version` claim; an old worker must not overlap the migrated schema. Preserve Redis failed-job history and business event identities. Fresh109-case local integration and bounded legacy upgrade regression pass; real staging rehearsal/backup/rollback approval remains required. If the new tenant/event FK rejects legacy data, stop and investigate the actual bindings; do not rewrite customer history or disable the constraint. Retained duplicate delivery outcomes/attempts/provider refs stay intact; legacy send generation remainsNULL. This additive migration is not a destructive rollback script.

New notification materialization requires `PRIVACY_POLICY_VERSION` (nonempty, at most100 characters) plus a credential-free HTTPS `PRIVACY_NOTICE_URL`, matching unrevoked NOTIFICATIONS purpose/version consent, current resource relation and category preference. These values establish technical configuration only; legal approval remains a separate blocked gate. Do not reuse synthetic test policies for real-data operation. Push remains inactive unless `PUSH_PROVIDER=expo`; real release credentials/project/device verification must be provided through the operator's secret configuration, never committed. Handoff receipts/statusSENT do not establish physical display. Preserve UNKNOWN outcomes without blindly resending; known rejection has at most five actual attempts. See `evidence/notifications/provider-policy.json` for vendor sources and the application's conservative retry choice.
