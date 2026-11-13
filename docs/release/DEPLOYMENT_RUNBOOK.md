# Deployment runbook

A reproducible local synthetic pilot is implemented in `../../infra/pilot/README.md` and verified in `evidence/pilot/verification.json`. It exercises isolated roles, file-mounted synthetic secrets, HTTPS, actual API/worker/SMTP and configuration recovery. This does not change the staging/production BLOCKED status below.


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


### Privacy029 deployment and temporary exports — local checks PASS; staging NOT_VERIFIED

Apply additive029 only after backup and an actual staging upgrade rehearsal. Stop old API/worker versions and quiesce privacy writes before migration; old binaries do not capture the new role/evidence metadata or purge protocol. Preserve001..028 bytes and all legacy consent/request identities, status and timestamps. LEGACY_OBSERVED history records migration-time observations, with unknown past reviewer/method left null. A legacy RECEIVED requester must confirm its current scope before review. Unknown-scope legacy VERIFIED/APPROVED rows require reasoned rejection and a new verified request, not fabricated retrospective evidence. Completed legacy requests do not acquire fabricated export artifacts.

Provide a dedicated server-only PRIVACY_EXPORT_KEY (64 hex characters) and PRIVACY_EXPORT_KEY_ID (3..80 safe characters) through the secret manager. PRIVACY_EXPORT_TTL_MINUTES defaults30 and must be1..1440; this is transient export lifetime, not a legal business-retention decision. Missing key blocks new ACCESS/EXPORT fulfillment; wrong/rotated key blocks decryption explicitly. Current single-key implementation requires draining/expiring old artifacts before rotation, or preserving the old key until they expire; do not silently mark undecryptable artifacts delivered. Ciphertext is tenant/request/key-bound AES-256-GCM; hash/byte metadata remains after the minute worker sweeps expired content in batches100. Monitor that worker; downtime may postpone physical ciphertext purge, but API expiry/current-scope checks still deny downloads. Database backups can retain historical ciphertext; backup access, encryption-key lifecycle and approved retention require operator review.

Profile ERASE is disabled by default. Enable only after actual legal/operator review with PRIVACY_ERASURE_POLICY_VERSION, opaque PRIVACY_ERASURE_APPROVAL_REF and exactly PRIVACY_ERASURE_FIELDS=fullName,dateOfBirth,contactEmail,contactPhone,notesPrivate. Synthetic integration configuration is not approval for customer data. Execution requires explicit retained-record confirmation, current requester relation, reviewed request version, current student version, an INACTIVE profile and no active/upcoming operational enrollment. It redacts those five profile fields, revokes child notification consents and purges that child temporary export content. It retains student code, global account/link identity, immutable finance, attendance, published grades and audit. No global account deletion or legal anonymization claim. Tenant owners cannot mutate global identity via an account-only request; those requests remain explicitly unfulfilled or rejected with a meaningful reason pending the approved account-custodian process.

Native exports use app-private cache and an authenticated fetch, checksum verification, OS file sharing, finally cleanup and startup cleanup of only known feature files. OS share completion does not prove recipient delivery. Verify permissions, cache cleanup, cancellation and recipient save on signed physical iOS/Android builds before release; this external gate remains BLOCKED. Web uses transient Blob download with no public URL or browser storage.
