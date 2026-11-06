# Migration and rollback

Status: local fresh-db migrations tested; staging upgrade/restore **NOT_VERIFIED**.
Do not modify applied migrations001..015. New migrations are016 schedule rules,
017 teaching lifecycle versions and018 private CSV previews. All are forward,
additive changes; old session rows retain EXTRA with no rule. New composite FKs
prevent attaching another tenant/class's rule; unique rule/day prevents retries.

Before an approved deployment: record current and target commit, backup ID and
hash; stop new mutations/queue consumers; inspect Prisma migrate status and SQL
lock requirements; take a verified backup; run upgrade on a restored staging
copy first. Save row counts, constraint checks, timings and smoke-test results.
Deploy migration with `pnpm.cmd db:migrate` using the managed staging connection,
then deploy compatible API/worker before clients that need the new contracts.

Rollback policy: stop new traffic/workers, preserve evidence, roll application
back only if the old binary tolerates the additive schema. Do not run ad hoc
DROP TABLE/COLUMN, delete ledger/history or rewrite `_prisma_migrations`.
When data correction is required, author a reviewed forward repair migration.
Database point-in-time restore requires explicit operator approval and a plan to
reconcile any payments/messages after the recovery point. Revoke/reissue affected
sessions if auth state was restored. Test rollback in staging before approval.

Backup rehearsal must restore to a different isolated database, compare tenant
counts and financial allocation/ledger constraints, run auth/tenant negative and
finance smoke tests, then retain a signed recovery log. A fresh migration test
alone does not satisfy TC-030 or backup recoverability.


Staff migration020 (2026-11-06): additive version=1 and delegation=false on existing memberships, nullable invitation revocation/audit metadata, directory indexes, immutable membership tenant/user identity and SQL last-active-owner guard. Existing emails/passwords/tenant membership/history are not rewritten. A real isolated legacy schema runs the actual migration and verifies preserved rows, defaults and removal rejection. Fresh full migration +51integration PASS locally. Staging upgrade/restore/rollback remains NOT_VERIFIED. Deploy compatible API/worker together before Staff Web. Old application versions do not understand revoked invitations: an auth rollback requires pausing invitation acceptance/mail and an explicit compatibility review; keep all schema/history and use a forward repair. Never undo revocation or owner guards just to roll back a binary.

Migration020 also adds activation_pending separately from global account status. Existing INVITED memberships (and inactive members whose global account is INVITED) are backfilled pending; already active memberships retain access state. New INVITED inserts are marked by SQL, and ACTIVE+pending is a check violation. Invitation acceptance alone clears pending after credential proof. A legacy ACTIVE global identity with a pending tenant invitation remains unactivated in that tenant. Do not roll auth/status handling back to a binary that ignores this marker. Fresh DBs and a transactional legacy-schema rehearsal verify these defaults/invariants.


SQL owner-count isolation contract (2026-11-06): production Staff mutations use PostgreSQL READ COMMITTED and the canonical tenant lock. The owner-removal trigger refuses snapshot-isolated SQL writers rather than count an old owner snapshot. A real REPEATABLE READ negative now asserts fail-closed behavior. No database-wide isolation setting is changed. Full51 integration passed on the final fresh database (integration-2026-11-06-staff-commit-gate.json). All subsequent tests and commit must retain this SQL migration.
