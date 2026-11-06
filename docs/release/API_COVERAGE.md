# API contract coverage

Generated inventory: 144 actual OpenAPI operations; 134
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
| GET | `/audit-logs` | ABSENT / REVIEW |
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
| GET | `/fee-plans` | ABSENT / REVIEW |
| POST | `/fee-plans` | MATCH |
| GET | `/fee-plans/{id}` | ABSENT / REVIEW |
| PATCH | `/fee-plans/{id}` | ABSENT / REVIEW |
| POST | `/invoices/preview-run` | ABSENT / REVIEW |
| POST | `/invoices/generate-run` | MATCH |
| GET | `/invoices` | MATCH |
| GET | `/invoices/{id}` | MATCH |
| POST | `/invoices/{id}/void` | MATCH |
| GET | `/payments` | MATCH |
| POST | `/payments` | MATCH |
| GET | `/payments/{id}` | MATCH |
| POST | `/payments/{id}/reverse` | MATCH |
| GET | `/finance/reports/receivables` | ABSENT / REVIEW |
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
