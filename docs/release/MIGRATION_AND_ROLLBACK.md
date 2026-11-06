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
