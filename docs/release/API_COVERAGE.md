# API contract coverage

Generated inventory: 168 actual OpenAPI operations; 134
method/path intents in the master specification (includes non-P0 design intent).
Path parameter names are normalized when comparing. MATCH means route metadata
exists; it does not verify DTOs, permission, object scope or runtime behavior.
ABSENT requires review for a documented equivalent, P1 exclusion or implementation.

| Method | Spec path | Metadata coverage |
|---|---|---|
| POST | `/auth/login` | MATCH |
| POST | `/auth/refresh` | MATCH |
| POST | `/auth/logout` | MATCH |
| POST | `/auth/logout-all` | MATCH |
| POST | `/auth/forgot-password` | MATCH |
| POST | `/auth/reset-password` | MATCH |
| POST | `/auth/accept-invitation` | MATCH |
| GET | `/me` | MATCH |
| GET | `/me/sessions` | MATCH |
| DELETE | `/me/sessions/{id}` | MATCH |
| GET | `/tenants` | MATCH |
| POST | `/auth/switch-context` | MATCH |
| GET | `/platform/tenants` | MATCH |
| POST | `/platform/tenants` | MATCH |
| GET | `/platform/tenants/{id}` | MATCH |
| PATCH | `/platform/tenants/{id}` | MATCH |
| POST | `/platform/tenants/{id}/suspend` | MATCH |
| POST | `/platform/tenants/{id}/reactivate` | MATCH |
| GET | `/platform/plans` | MATCH |
| POST | `/platform/plans` | MATCH |
| GET | `/platform/tenants/{id}/subscriptions` | MATCH |
| POST | `/platform/tenants/{id}/subscriptions` | MATCH |
| GET | `/platform/audit-logs` | MATCH |
| GET | `/tenant/settings` | ABSENT / REVIEW |
| PATCH | `/tenant/settings` | ABSENT / REVIEW |
| GET | `/tenant/subscription` | MATCH |
| GET | `/tenant/usage` | ABSENT / REVIEW |
| GET | `/staff` | MATCH |
| POST | `/staff` | MATCH |
| GET | `/staff/{membershipId}` | MATCH |
| PATCH | `/staff/{membershipId}` | MATCH |
| POST | `/staff/{membershipId}/roles` | MATCH |
| DELETE | `/staff/{membershipId}/roles/{roleId}` | MATCH |
| GET | `/permissions` | MATCH |
| GET | `/audit-logs` | MATCH |
| GET | `/students` | MATCH |
| POST | `/students` | MATCH |
| GET | `/students/{studentId}` | MATCH |
| PATCH | `/students/{studentId}` | MATCH |
| POST | `/students/{studentId}/deactivate` | MATCH |
| POST | `/students/imports` | MATCH |
| GET | `/students/imports/{jobId}` | MATCH |
| POST | `/students/imports/{jobId}/commit` | MATCH |
| GET | `/teachers` | MATCH |
| POST | `/teachers` | MATCH |
| GET | `/teachers/{teacherId}` | MATCH |
| PATCH | `/teachers/{teacherId}` | MATCH |
| GET | `/students/{studentId}/guardians` | MATCH |
| POST | `/students/{studentId}/guardians` | MATCH |
| POST | `/students/{studentId}/guardians/{linkId}/approve` | MATCH |
| DELETE | `/students/{studentId}/guardians/{linkId}` | MATCH |
| POST | `/students/{studentId}/invite` | ABSENT / REVIEW |
| POST | `/guardians/invite` | MATCH |
| GET | `/courses` | ABSENT / REVIEW |
| POST | `/courses` | ABSENT / REVIEW |
| GET | `/rooms` | MATCH |
| POST | `/rooms` | MATCH |
| GET | `/rooms/{roomId}` | ABSENT / REVIEW |
| PATCH | `/rooms/{roomId}` | ABSENT / REVIEW |
| GET | `/classes` | MATCH |
| POST | `/classes` | MATCH |
| GET | `/classes/{classId}` | MATCH |
| PATCH | `/classes/{classId}` | MATCH |
| POST | `/classes/{classId}/close` | MATCH |
| GET | `/classes/{classId}/teachers` | ABSENT / REVIEW |
| POST | `/classes/{classId}/teachers` | MATCH |
| DELETE | `/classes/{classId}/teachers/{assignmentId}` | ABSENT / REVIEW |
| GET | `/classes/{classId}/enrollments` | MATCH |
| POST | `/classes/{classId}/enrollments` | MATCH |
| POST | `/classes/{classId}/enrollments/{id}/withdraw` | MATCH |
| GET | `/classes/{classId}/schedule-rules` | MATCH |
| POST | `/classes/{classId}/schedule-rules` | MATCH |
| POST | `/classes/{classId}/schedule-rules/preview` | MATCH |
| GET | `/classes/{classId}/sessions` | MATCH |
| GET | `/sessions/{sessionId}` | MATCH |
| POST | `/sessions/{sessionId}/reschedule` | MATCH |
| POST | `/sessions/{sessionId}/cancel` | MATCH |
| POST | `/classes/{classId}/sessions/extra` | MATCH |
| GET | `/sessions/{id}/roster` | MATCH |
| GET | `/sessions/{id}/attendance` | MATCH |
| PUT | `/sessions/{id}/attendance/draft` | MATCH |
| POST | `/sessions/{id}/attendance/finalize` | MATCH |
| POST | `/sessions/{id}/attendance/reopen` | MATCH |
| GET | `/sessions/{id}/lesson-report` | MATCH |
| PUT | `/sessions/{id}/lesson-report` | MATCH |
| GET | `/classes/{id}/assessments` | MATCH |
| POST | `/classes/{id}/assessments` | MATCH |
| GET | `/assessments/{id}/results` | MATCH |
| PUT | `/assessments/{id}/results` | MATCH |
| POST | `/assessments/{id}/publish` | MATCH |
| GET | `/fee-plans` | MATCH |
| POST | `/fee-plans` | MATCH |
| GET | `/fee-plans/{id}` | MATCH |
| PATCH | `/fee-plans/{id}` | MATCH |
| POST | `/invoices/preview-run` | MATCH |
| POST | `/invoices/generate-run` | MATCH |
| GET | `/invoices` | MATCH |
| GET | `/invoices/{id}` | MATCH |
| POST | `/invoices/{id}/void` | MATCH |
| GET | `/payments` | MATCH |
| POST | `/payments` | MATCH |
| GET | `/payments/{id}` | MATCH |
| POST | `/payments/{id}/reverse` | MATCH |
| GET | `/finance/reports/receivables` | MATCH |
| GET | `/mobile/dashboard` | MATCH |
| GET | `/mobile/my/classes` | MATCH |
| GET | `/mobile/my/schedule?from=&to=` | ABSENT / REVIEW |
| GET | `/mobile/my/attendance` | MATCH |
| GET | `/mobile/my/grades` | MATCH |
| GET | `/mobile/guardian/students` | MATCH |
| GET | `/mobile/guardian/students/{id}/summary` | MATCH |
| GET | `/mobile/guardian/students/{id}/attendance` | MATCH |
| GET | `/mobile/guardian/students/{id}/grades` | MATCH |
| GET | `/mobile/guardian/students/{id}/invoices` | MATCH |
| GET | `/notifications` | MATCH |
| PATCH | `/notifications/{id}/read` | MATCH |
| POST | `/mobile/devices/push-token` | MATCH |
| DELETE | `/mobile/devices/push-token` | MATCH |
| GET | `/me/notification-preferences` | MATCH |
| PATCH | `/me/notification-preferences` | MATCH |
| GET | `/reports/dashboard?from=&to=` | ABSENT / REVIEW |
| GET | `/reports/attendance?classId=&from=&to=` | ABSENT / REVIEW |
| POST | `/files/upload-url` | ABSENT / REVIEW |
| POST | `/files/{id}/finalize` | ABSENT / REVIEW |
| GET | `/files/{id}/download-url` | ABSENT / REVIEW |
| GET | `/classes/{id}/assignments` | ABSENT / REVIEW |
| POST | `/classes/{id}/assignments` | ABSENT / REVIEW |
| POST | `/assignments/{id}/submissions` | ABSENT / REVIEW |
| POST | `/submissions/{id}/grade` | ABSENT / REVIEW |
| GET | `/classes/{id}/materials` | ABSENT / REVIEW |
| POST | `/classes/{id}/materials` | ABSENT / REVIEW |
| GET | `/privacy/consents` | MATCH |
| POST | `/privacy/requests` | MATCH |
| GET | `/privacy/requests/{id}` | MATCH |

## Explicit contract decisions

- Operational dashboard/attendance/enrollment reports require the reports plan
  flag and named role grants. Financial dashboard groups are owner/accountant-only;
  unavailable groups are null, never invented0. Core collections/receivables remain
  independent of optional analytics and follow the finance flag. Every report uses
  explicit inclusive tenant-calendar dates, max366 days, one snapshot/asOf, actual
  SQL joins and current-state headcounts labelled separately from period metrics.
- Attendance completion uses ended noncancelled sessions; future sessions are
  separate. Final records require COMPLETED and finalized_at. Reopened/draft rows
  are excluded; zero denominator is null. Physical presence includes PRESENT+LATE
  over finalized roster including excused absence, with numerator/denominator shown.
- Collections use current valid issue dates, confirmed received dates and current
  balances on due dates as distinct axes. Class filters attribute matched allocations
  only (CLASS_ALLOCATED); centre receipts use RECEIVED and retain unallocated money.
  Unallocated class amounts are null, never silently assigned or presented as0.
  Aggregate sums remain exact numeric strings beyond bigint. Calendar trend series
  is independent of DB session timezone. Receipt allocation work is range-bounded.
- Named CSV exports return bounded aggregate files (5000 rows) using safeCsvCell,
  current actor/session/role checks and actual filter/count/trace audit. READ_ONLY
  may perform audited GET exports; business data/ledgers are unchanged. Free-text
  search terms/private learner notes are not written into export audit metadata.
- Forward027 checks existing tenant named zones without silently rewriting them,
  then guards future SQL inserts/changes against unsupported names/raw offsets.
  Shared runtime/Platform validation and database name checks reject raw numeric
  offsets whose sign PostgreSQL interprets differently. Existing IANA spellings,
  UTC ledger values and001..026 are preserved; report range indexes are additive.
- All financial date filters resolve the active tenant IANA timezone within
  the same read snapshot. GET invoice/receipt/report metadata includes the current
  zone; UTC ledger instants and original POST/idempotency responses are unchanged.
  Calendar boundaries handle DST23/25h, fractional offsets, midnight gaps and
  skipped days. Web payment folds require explicit occurrence selection; skipped
  clocks are blocked before write intent. Centre clock displays include UTC offset.
  Due-day entry uses the last actual instant of that local date. Forward026 changes
  only the fee-term future guard to the scoped tenant zone, retaining immutable
  existing terms/prices and all actor/interval/monthly/course constraints.
- GET /finance/reports/receivables is owner/accountant finance.report.read,
  following the core finance flag independently of optional reports analytics.
  Totals and positive issued rows reuse the same valued-invoice scope, filters,
  asOf and RepeatableRead snapshot. Exact aggregate money is numeric::text and
  can exceed bigint while individual invoice values remain bigint constrained.
  All matching ISSUED documents contribute to billed/paid/remaining totals;
  debt rows require positive balance. VOID/reversed allocations are excluded;
  unallocated receipt money is not silently netted. asOf is the current read,
  not historical ledger accounting. No new balance columns/migration required.
- Shared financial read date/offset validation rejects unsupported extreme
  calendar boundaries or unsafe offsets422 rather than leaking internal500.
  Web report caches are invalidated after invoice/payment mutations; an empty
  page after a concurrent ledger change offers an explicit return to page1.
- Payment list filters method/status/receipt or student search and tenant-calendar received
  dates through parameterized SQL with stable paging. Detail/allocations/balances
  and actual paged audit history use repeatable snapshots. GET /payments/{id}/history
  is staff finance.read only; verified Guardian reads redact internal references,
  receiver IDs/names and reversal details. Unknown legacy actor names remain NULL.
- Existing POST payment/reversal contracts and stored idempotency responses remain
  compatible. Receipt GET adds current centre/student labels and actual recorded
  receiver-name snapshots; this does not fabricate issue-time identity snapshots.
  Reversed documents retain their original allocations and clearly lose effect.
  Forward025 adds only the tenant/received-time pagination index; existing actor
  FKs, append-only records, exact-money and allocation constraints remain.
- Payment Web confirms actual cash/bank receipt, exact integer same-student
  allocations and optional unallocated credit. Ambiguous network failure locks
  the payment intent and reuses its owned key/body; an uncertain reversal resolves
  through a fresh status/history read rather than an automatic second POST.
  Printing uses server receipt data and hides navigation/mutation forms; it is an
  internal receipt, not a VAT invoice or bank-verification/legal approval claim.
- Invoice preview uses the shared effective-fee/period/enrollment intersection,
  exact integers and paged actual students. POST /invoices/preview-run writes
  only its bounded operation counter, never invoices/audit/outbox/idempotency.
  New Web issue commits include its fingerprint; changed eligibility/terms409
  requires preview/confirmation again. Existing API clients may omit it and
  still receive the same guarded eligibility/idempotency/business-key checks.
- Thirty fresh preview/generation operations per actor/tenant per15minutes;
  a committed same-key replay precedes the generation counter. Failed or empty
  runs roll back. Bulk processing is the existing bounded transactional run API;
  no separate asynchronous job acceptance is claimed.
- Invoice read lists use same-snapshot SQL balance/status with student/class/
  fee/period/search and tenant-calendar inclusive due-date filters. Staff detail adds
  paged immutable items and redacted lifecycle history; Guardian detail remains
  active verified-child scoped and omits internal void reasons. New actor names
  are actual snapshots; old unknown names stay NULL.
- Forward024 adds same-tenant financial actor FKs and meaningful void/reversal
  reasons without rewriting issued values. Orphan/blank legacy records reject
  upgrade for review. Case-only duplicate OpenAPI idempotency headers are merged
  at the decorator source, preserving the actual HTTP behavior.
- Fee configuration is owner/accountant finance.fee.write; manager's invoice
  permission remains separate. GET /fee-plans/classes returns minimal class
  options without granting access to teaching administration. includeClosed=true
  supports historical class filters; new plans still reject closed classes.
- Forward023 retains used_fee_immutable and the stable fee-plan/period run key.
  PATCH /fee-plans/{id} appends versioned future terms with a meaningful reason;
  baseline fields and issued invoice items remain immutable. Monthly changes
  start on a future month boundary; course changes precede issue and apply from
  the course start. At equal effective dates the highest version wins. New runs
  resolve those terms, while retries preserve actual earlier run snapshots.
- GET /fee-plans/{id}/terms pages actual actor/time/reason history. No legacy
  edit/actor history is backfilled. Configuration and all financial writes
  recheck current actor/session/role/subscription after the tenant lock.
- Assessment administration adds GET /assessments/{id}/history and /lifecycle
  with grade.write or grade.write.assigned and effective-date teacher scope;
  GET /students/{id}/grades requires staff grade.write and is PUBLISHED only.
  Student/Guardian retain existing subject-authorized APIs. All new lists are
  bounded/paged and generated into the shared client.
- Forward migration022 preserves historical JSON/timestamps; legacy actor names
  stay NULL. Orphan actors/duplicate student-version history reject upgrade for
  investigation instead of fabricated membership or deleted history. Earlier
  migrations stay immutable. Local legacy rehearsal is not staging approval.
- Unsaved POST /classes/{id}/schedule-rules/preview now executes real constraints
  and a deliberate transaction rollback; no rule/session/audit is retained.
  It previews at most60days from validFrom. POST creation rechecks conflicts.
  Persisted GET .../{ruleId}/preview and POST .../{ruleId}/generate remain available.
- Forward migration019 retains actual rule/day uniqueness and adds immutable
  occurrence origin so moving a session never resurrects its old occurrence.
  Rule replacement is append-only history; only untouched future rows are replaced.
  Manual, snapshotted, completed and prepared lessons survive. Conflicts roll back
  the entire replacement/generation transaction.
- Worker daily rule/version/local-date jobs reuse the API scheduling transaction,
  with actorNULL system audit, real policy checks and no fabricated user token.
  apps/worker declares its API workspace dependency so Turbo builds that domain
  module first. Deployments must preserve the monorepo compiled package layout.
- VND values remain canonical decimal strings backed by PostgreSQL BIGINT, avoiding
  JavaScript precision loss. Existing clients must not coerce them to Number.
- Native auth remains separate from browser HttpOnly-cookie transport.
- GET /auth/web-session validates the current HttpOnly cookie against the bearer
  session, user, client transport and exact selected context, without rotation or
  credential issuance. Browser refresh/login/context/logout are serialized with
  same-origin Web Locks; ephemeral peer tokens are verified before use. Changed
  identity/context clears cached data and old links. Only same-scope GET may be
  retried once after actual401 recovery; financial writes are never auto-replayed.
