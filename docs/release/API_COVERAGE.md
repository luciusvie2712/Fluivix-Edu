# API contract coverage

## Current checkpoint — worker operations local PASS (2026-11-09)

The production worker now publishes an opaque Redis heartbeat after readiness and dispatch. Platform health checks both worker connections, heartbeat age, dispatch progress and aggregate counts for all three queues. Missing configuration, Redis failure, expired heartbeats, paused queues and disabled scheduling have explicit states. Responses contain no job bodies, host names, user names or instance IDs; queue completion does not establish provider delivery. The existing MFA boundary remains enforced.

The platform screen uses the generated client, hides metrics after transport errors, verifies retries and cancels delayed responses on logout. Refresh preserves keyboard focus. Desktop uses two summary columns and three queue columns; narrow screens retain one column. All eight final screenshots were individually inspected at four widths and both motion settings, with no Axe violations or Taste findings. Earlier failed runs and spacing warnings remain in recovery evidence. Tenant and platform login tests still reject the eleventh attempt; fixture counters reset only before an isolated test scenario.

Fresh verification passed 118 unit, 32 mobile, 233 integration and 202 browser tests, with no skipped or flaky cases. All builds, type checks, tooling checks, lint, formatting, the real mobile API smoke test, Expo dependency alignment, reproducible installation and 193-operation contract generation passed. Audit reports 0 HIGH/CRITICAL, 4 MODERATE and 1 LOW. Source and private environment bytes remained stable; all 33 published migrations are unchanged. Commit and exact-SHA CI for this module are pending. Prior reminder commit 5473b63 passed all 30 CI steps. Release remains BLOCKED on the remaining pilot, backup/restore, load and dependency work, plus actual staging, legal/privacy/consent/UAT approvals, signed physical mobile tests, real push and off-host key custody. External alert delivery and production SLA readiness are not verified.

Evidence: `evidence/operations/verification.json`.


## Current checkpoint — reminders exactCI PASS (2026-11-09)

Reminder commit5473b63507a879e69e9c42ed6ad17b4c97c2f9ac is pushed to main and exactCI42644992911/job129255742507 passedall30steps; independentlydecoded118unit/32mobile/227integration/191browser7.2m andactualmobileAPI, audit0HIGHCRITICAL/4MODERATE/1LOW. Localfull118/32/227/19122.3m,24actualfinalimagesindividuallyreviewed,Axe0/Taste0,source/environment/publishedmigrationbyteproof PASS. Evidence: evidence/ci-5473b63-success-2026-11-09.json. Continue P0/M4 operationsheartbeat/queues, isolatedpilot/restore/load/dependencywork; externalapprovals/devices/push/keycustody keepreleaseBLOCKED.


## Current checkpoint — fee reminders local PASS (2026-11-09)

Fee-reminder P0 now implements the fixed reviewed09:00..09:15 centre-IANA preset T-3/T+1/T+7, initialOFF until actualowner confirmation, maximum3durableinvoice stages acrossrestarts/toggles and onecompletechild/daybatch. Additive033 keepsissuedinvoices/ledger andpublished001..032bytes unchanged, with composite tenantFK,version/immutablehistory constraints. Currentselectedrole ownerconfigure/accountanthold/history and canonicaltenantlocks recheck realidentity/subscription/plan. Realoutbox/BullMQ fanout isguardian-only undercurrentconsent/verifiedlink/financepreferences; liveCONFIRMEDallocationbalance andholds/policy/window rechecked at generation,claim andlockedHTTP handoff afterdurableSENDING, withUNKNOWNnoblindretry. ActualRedis,501-invoicekeysetbatch,races,latehandoff andpaymentlockproof pass. WebactualAPI disclosures preserve reviewdrafts/keyboardfocus acrosspagination,errorretry/conflicts,verify lostresponseswithoutsecondPATCH,clearparentfinancialUIonrevocation andabortoldtenantbytes. Native reminder opening reauthorizes guardianchild beforelivefinance navigation. Fullfresh frozen118unit/32mobile/227integration/191browser PASS,0skip/flaky;allbuilds/types/tools/mobileAPI/Expo,193stablecontracts,214realunauthorizedGETrequests,offlineinstall,audit0HIGHCRITICAL/4MODERATE/1LOW,skills/inventory/source.envproof. All24FINALimagesindividuallyreviewed,4widths/2motion,Axe0/Taste0. Earlier21/4focused integration,17/1focusedbrowser,225/2firstfull and225/2secondfull integration plus190/1firstfullbrowser failures andrawspacingwarnings retained. SecondfullslowSQLloggingidentified48.060s enrollmentexportrowquery computedbeforeexisting5000-rowguard. Movebothclassexportboundschecks aftersame-scopedtotal andbefore rowmaterialization; retainserviceguards/5000limit and strengthenactualfiltered200/row1/auditassertions in5001-classfixture. No claim aboutunprovenplanner/resourcecause. Firstfullbrowser teachingJourney mistookpendingverificationstatus forassignment success; noassignmentPOSToccurred andpreview422correct. Test nowwaitsactualteacherGET200/nativevalidity, requiresassignmentPOST201/exactsuccess/scopedDBdates; preservesalloriginal5session/finalize/revisionasserts andapplicationguards. Fresh49reportrepair/3teachingrepair cases andcompletefullgate required withouttimeout/retry/assertionweakening. Prior458c845 exactCI30SUCCESS110/30/184/1739.1m proof retained. Newmodulecommit/exactCI pending; operations/dependency work andexternalapprovals keepreleaseBLOCKED.

Evidence: `evidence/reminders/verification.json`.


## Current checkpoint — W11 exact CI SUCCESS (2026-11-09)

W11 session history committed/pushed main458c845a54c84ef017e809c6f5769fe25117868e; exact CI42595494728/job129086998509 completed SUCCESS for all30 steps. Independently decoded actual110unit/30mobile/184integration/173browser9.1m and real mobile API smoke; local fresh full110/30/184/17321.6m plus all24 individually reviewed images and16Taste reports0findings. Evidence: evidence/ci-458c845-success-2026-11-09.json and evidence/session-history/verification.json. Reminders and operations/dependency work continue; external release gates remain BLOCKED.


## Current checkpoint — W11 session history local PASS (2026-11-09)

W-11 now reads real immutable session change history through the new scoped GET/api/v1/sessions/:id/changes. Additive032 derives change types from existing snapshots, enforces tenant actor FK and indexed paging; all001..031 bytes and append-only protections remain intact, with real legacy upgrade and tracked full SQL replay evidence. Owner/manager/academic or currently assigned teacher reads are revalidated after the canonical tenant lock. Whitelisted data and batched current labels exclude contacts, arbitrary JSON and foreign references. Web shows lazy before/after comparisons, local dates/centre times, actual actor/reason/version,44px keyboard controls and focused pagination, same-query reload/error/retry with draft retention, newer-history notice and removal of parent editors/caches after actual403/404 revocation; tenant/role switching aborts delayed real bytes. Recurring replacement cancellations are verified through the originalTC027 path. Fresh third complete frozen acceptance110unit/30mobile/184integration/173browser PASS,0skip/flaky, all builds/types/tools/mobileAPI/Expo,188stable contracts,208 actual unauthorized GET requests, offline frozen install, skills/inventory and source/environment proof. All24 FINAL browser images individually reviewed across4widths/2motion and3surfaces; axe0/Taste0. Audit0HIGH/CRITICAL/4MODERATE/1LOW. Failed first complete182/2 due stale103-vs104 GET inventory and both earlier browser failures, interrupted full browser and Docker-focused timeout remain retained; all guards/assertions remain and inventory coverage increased. The earlier173PASS browser run was held from acceptance by two actual Taste warnings; real DOM measurements guided scoped spacing repair, final focused15PASS with16Taste reports0findings, then this full pipeline was run again. All raw warning reports and original24 observations are retained. Prior41f8cdd exactCI30SUCCESS proof retained. New module commit/exactCI pending. Reminders, reusable operations/M4, dependency maintenance and actual external approvals keep release BLOCKED.

Evidence: `evidence/session-history/verification.json`.

## Historical checkpoints

## Current checkpoint — Calendar form repair exact CI PASS (2026-11-09)

Exact main commit41f8cdd6de25d844b271e966d47ba96a9fccb3bd passed all30 CI steps in run42570819133/job129007518700. Independently decoded logs confirm89unit/30mobile/161integration/158browser(7.6m), matching the complete frozen local gate and16 individually reviewed current images. Audit0HIGH/CRITICAL/4MODERATE/1LOW. Calendar date-form/resource-verification race is repaired and delivered; original CI failure and clean red-baseline evidence remain retained. Proof:evidence/ci-41f8cdd-success-2026-11-09.json. W-11 session change history is the next implementation slice. Remaining reminders, operations/dependencies and actual staging/legal/UAT/signed-device/push/key-custody approvals keep release BLOCKED.

## Historical checkpoints

## Current checkpoint — Calendar form CI repair local PASS (2026-11-09)

Fixed the CI-reproduced calendar submit race: pending real room verification no longer blocks applying dates because auto-applied resource filters sit outside the date form. Native date checks and all mutation picker verification remain intact. Deterministic real-response regression first FAILED on the previous production bundle and now PASSES while the room picker still has custom validity. Focused27/27 PASS including the original failed CI room journey. Complete fresh frozen acceptance89unit/30mobile/161integration/158browser PASS,0skip/flaky; all builds/types/tools, actual mobile API smoke, Expo alignment, stable187-operation generated contracts, offline frozen install, source/environment byte proof, skills and AI inventory PASS. Audit0HIGH/CRITICAL,4MODERATE/1LOW. All16 current Day/Week images individually reviewed and matched final full-suite bytes, axe0/Taste0; earlier module images restored exactly with new regression copies archived privately. Failed CI0881f40 and both honest red-baseline reports retained. Repair commit/exact remote CI pending. Remaining session history, reminders, ops, dependencies and external approvals keep overall release BLOCKED.

Evidence: `evidence/calendar-read-verification/verification.json`.

## Historical checkpoints

## Current checkpoint — Calendar periods local PASS (2026-11-09)

Calendar Day/Week/Custom navigation now uses real scoped scheduling data with Monday-first local-date periods, centre-IANA Today, strict inline date/range validation, exact applied-range captions and Vietnamese output dates. Class/teacher/room selections survive period movement while result pagination resets. Cancelled rows no longer incorrectly label cancellation as rescheduling; active reschedules retain their badge. Backend policies, counters, immutable history, confirmations, API and migrations remain unchanged. Fresh second frozen acceptance passed89unit/30mobile/161integration/157browser with0skip/flaky,8uncached builds/types/tools,actualmobileAPI,Expo alignment,stable187-operation contracts,offline frozeninstall,skills/inventory and audit0HIGH/CRITICAL (4MODERATE/1LOW). All16current browser images were individually reviewed across4widths/bothmotionmodes with final-byte equality,axe0/Taste0 and firstrecord/44px/keyboard checks. Failed12/1firstfocus, genuinely rejected phone/cancellation images, historical41focus and voluntarily interrupted first full gate remain accurately retained; only final13focus and complete second full source are accepted. Prior e6c8767 exactCI passed30steps with decoded matching counts. New module commit/exactCI pending. WholeW10/session-history remains PARTIAL until the separate scoped history slice; remaining reminders/ops/dependencies/external staging/legal/UAT/devices/push/custody gates keep releaseBLOCKED.

Evidence: `evidence/calendar-period/verification.json`.

## Historical checkpoints

## Current checkpoint — Compact navigation exact CI PASS (2026-11-09)

Exact main commit e6c87672f52df4c85d3984ea382bbbe98840c91a passed all30 CI steps in run42558583184/job128969733481. Independently decoded logs confirm70unit/30mobile/161integration/144browser(6.7m), matching the frozen local gate and14manually reviewed current images. Audit0HIGH/CRITICAL/4MODERATE/1LOW. Proof:evidence/ci-e6c8767-success-2026-11-09.json. Compact navigation is delivered; release remains BLOCKED. Calendar day/week controls are now IN_PROGRESS and are not accepted as complete. Reminder preset, remaining operations/dependencies, full traceability and external release gates continue.

## Historical checkpoints

## Current checkpoint — Compact navigation local PASS (2026-11-09)

Tenant navigation now folds behind a labelled native menu button at widths up to1024px, so operational content appears in the first viewport. Desktop links stay visible. Keyboard close/return, resize recovery, current resource directory, route/context resets and unsaved student draft retention are verified against the real API. Existing role routes, read-only/offline messages and logout remain operational. No API, schema, migration or native UI changed. The same framed-sheet/blue/Arial16 design and all3 verified UI skill sources were applied;14 current browser images across360/768/1024/1440 and both motion preferences were individually reviewed, with0axe violations and0Taste findings. Fresh frozen acceptance passed70unit/30mobile/161integration/144browser with0skip/flaky,8uncached builds/typechecks, tools TypeScript, mobileAPI, Expo alignment, stable187-operation contract generation, frozen install, skills/inventory and audit0HIGH/CRITICAL (4MODERATE/1LOW remain). Prior4d561bf exactCI passed all30steps with independently decoded matching counts. New module commit/exactCI pending; releaseBLOCKED. Calendar day/week, reminders, operations/dependencies and external approvals remain tracked.

Evidence: `evidence/tenant-navigation/verification.json`.

## Historical checkpoints

## Current checkpoint — Authentication contract exact CI PASS (2026-11-09)

Exact commit 4d561bf0e90a69f68d6477373f9fea617ba8da7b on main passed all 30 CI steps in run 42553724861/job128954712573. Decoded job logs confirm 70 unit, 30 mobile, 161 integration and 133 browser tests (7.2m); audit has 0 HIGH/CRITICAL, 4 MODERATE and 1 LOW. This independently matches the completed local frozen gate. Proof: evidence/ci-4d561bf-success-2026-11-09.json. Release remains BLOCKED by the outstanding P0/M4 and external staging, legal, device and push gates. The next slice addresses compact tenant navigation; it has no accepted result yet.

## Historical checkpoints

## Current checkpoint — Authentication contract local PASS (2026-11-09)

Authentication transport documentation now matches the existing runtime: protected tenant endpoints use bearer access, platform endpoints use their separate platformBearer scheme, credential exchanges remain public to bearer authentication, and browser/platform refresh operations require their distinct HttpOnly cookies. Read-only web-session verification requires access AND its matching refresh cookie. Existing native transport restrictions, browser Origin/CSRF rules and unauthorized error envelopes are documented. Guards, service authorization, token storage, DTO schemas, paths and all187 operation IDs remain unchanged.

Fresh frozen local acceptance passed70unit,30mobile,161integration and133browser tests, with no skipped or flaky browser cases. Two real HTTP tests send206 unauthenticated/malformed requests across every103 protected GET endpoint and verify401, trace envelope, no-store and absence of data. Eight uncached builds/typechecks, tools TypeScript, actualmobileAPI smoke, Expo SDK alignment, stable OpenAPI/client regeneration, offline frozen installation, inventory/skills and audit0HIGH/CRITICAL passed (4MODERATE/1LOW remain). Prior fixture repair e9b1daa exactCI42549212297 passed all30steps. Module commit/exactCI pending; releaseBLOCKED. No new UI or physical-device certification is inferred; remaining calendar/shared-shell, reminders, operations/dependency and external release gates continue.

Evidence: `evidence/auth-contract/verification.json`.

## Historical checkpoints

## Current checkpoint — Teaching fixture exact CI PASS (2026-11-09)

Exact CI for e9b1daa59c74f126e5b2ce42e34a8cc69106f2bf passed all30steps in run42549212297/job128940790206. This resolves the preceding d8577d9 failure: the production future-only rule remained unchanged and both date-relative integration/browser fixtures passed remote integration/E2E. Counts66unit/30mobile/159integration/133browser are from the complete frozen local reports; public remote step status confirms full success, not individually fetched raw-log counts. Proof: evidence/ci-e9b1daa-success-2026-11-09.json. ReleaseBLOCKED; continue remaining P0/M4 work.

## Historical checkpoints

## Current checkpoint — Teaching date fixture local PASS (2026-11-09)

The date-sensitive TC-027 fixture repair passed a fresh complete frozen local gate: 66 unit tests, 30 mobile tests, 159 integration tests and 133 browser tests, with no skipped or flaky browser cases. Eight uncached builds/typechecks, tools TypeScript, actual mobile API smoke, Expo SDK alignment, stable187-operation OpenAPI/client generation, offline frozen installation, inventory/skill checks and the high/critical audit gate passed.

CI42544392738 for d8577d9 exposed a hardcoded 09 November2026 replacement date that had become today. The existing future-only API guard correctly returned422; the same date also prevented the browser rule from changing. Both failures were reproduced locally and retained. Integration and browser fixtures now derive their dates from the actual centre IANA calendar day. Six integration and five browser lessons, all publication/history/scope/version/conflict/immutable/confirmation assertions, and original test timeouts/retries remain. Actual past/future preconditions and a today422/zero-revision check strengthen the scenarios. Only the two test files changed; production source, guards, clock, migrations001..031 and the private environment are unchanged.

Eight final fixture screenshots were reviewed and preserved separately, with actual Taste findings retained. Historical module renders keep their original bytes. The first partial gate was stopped to repair both fixtures together and is explicitly not accepted as a full result. Evidence: `evidence/teaching-ci-date/verification.json`. Repair commit, push and exact-SHA CI are pending; next module waits for CI. Release remains BLOCKED; authentication documentation, calendar/shared-shell review, reminder proposal, operations/dependencies and external approval/device/staging gates remain.

## Historical checkpoints

## Current checkpoint — Teaching resource selection local PASS (2026-11-08)

Local verification passed on frozen source: 66 unit tests, 30 mobile tests, 159 integration tests and 133 browser tests, with no skipped or flaky browser cases. Eight uncached builds and typechecks, tools TypeScript, real mobile API smoke, Expo SDK alignment, stable regeneration of 187 OpenAPI operations and the client, and offline frozen installation passed. Audit found 0 high, 0 critical, 4 moderate and 1 low findings.

Existing scoped APIs now supply searched, paginated class and teacher selectors. A separate detail request verifies the current selection across pages; operational teachers require an active, ready account. Assignment, recurring preview/create/replacement, extra sessions and rescheduling preserve the existing transaction, conflict, assignment, capacity, version, roster, audit and notification rules. Staff can filter the calendar by class, teacher and room, including historical inactive resources. A selected teacher requests assigned classes and makes no general teacher or room directory requests. Transport errors remove cached calendar rows; actual membership revocation returns 403.

The resource-filter disclosure keeps dates and results accessible on narrow screens. Civil dates remain on one line; lifecycle labels and change counts use Vietnamese. Native keyboard scrolling, focus, axe and 16 Taste reports passed, with 24 current responsive screenshots manually reviewed in normal and reduced motion. Prior failed focused reports and two rejected visual baselines remain available; no assertion, retry or timeout was weakened. No migration or permission policy changed, and published migrations 001..031 and the private environment remained unchanged.

Evidence is local acceptance for this module. Commit, push and exact-SHA CI are pending. The calendar remains a scoped agenda; final day/week presentation review, authentication contract documentation, proposed reminders, reusable operations, dependency maintenance and final screen/FR/TC reconciliation remain. Release is BLOCKED by remaining technical work and external staging, legal/consent, UAT, signed physical devices, real push and offhost key-custody gates.

Evidence: `evidence/teaching-selection/verification.json`. W05 exactCI proof retained in `evidence/ci-e128825-success-2026-11-08.json`.

## Historical checkpoints

## Current checkpoint — W05 exact CI verified (2026-11-08)

W05 commite12882536eee56195c4fe16f7434dbeb851c382e is pushed to main. Exact CI42490137881/job128760511668 SUCCESS all30steps; actual job logs66unit/30mobile/159integration/realmobileAPI/121browserPASS(5.4m). Proof:evidence/ci-e128825-success-2026-11-08.json. This resolves preceding W05 remoteNOT_VERIFIED; complete frozen local159/121,32manually reviewed responsive normal/reduced images,187stableoperations and canonical current-actor histories remain in evidence/student-history. Published001..031/private.env unchanged. Remaining teaching resource selectors/calendar teacher filter, fee reminder proposed preset, reusable ops/M4, compatible dependency maintenance and actual staging/legal/UAT/signed-device/real-push/offhost-key-custody gates remain; releaseBLOCKED. Continue master work.

## Historical checkpoints

## Current checkpoint — W05 local acceptance (2026-11-08)

W05 selected-student histories and role-scoped profile navigation pass complete source-frozen local acceptance:159integration,121browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools,actualmobileAPI smoke,SDK alignment,187stable OpenAPI/client operations,offline frozen install and0HIGH/CRITICAL audit. Actual paginated enrollment/finalized-roster attendance routes use canonical tenant reader and current post-lock actor. Profile overview/classes/attendance/grades/finance/guardians use actual APIs with selected-role gates, limited accountant fields, unsaved draft preservation, verified retry and access revocation. No new migration; published001..031/private.env unchanged. Prior442cd7b exactCI42354835993 SUCCESS all30steps/104browser. New W05 commit/exact-SHA remote CI pending. Remaining teaching selectors/calendar teacher filter, reminder proposal, reusable operations/M4, dependency maintenance and external release gates remain; release BLOCKED.

## Historical checkpoints

Generated inventory: 179 actual OpenAPI operations; 134
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


### Notifications N1 — local PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Notifications N1 passes the complete local frozen-source gate:109 integration,78 browser0skip/flaky,60unit/20mobile,8uncached builds/types, real mobile API smoke, stable168-operation contract, offline frozen install,0HIGH/CRITICAL audit and verified skills. Current-resource inbox/legacy sibling scope, multi-role event/device dedupe, actual device generations, bounded retries/receipts/Redis recovery, committed finance during provider failure and Web/Mobile controls are verified. N1 commit/exact-SHA CI pending. Auth4bccaa7 exact CI42296909065 is successful. Fee reminders under approved policy, Privacy/remaining operations/M4 and external staging/legal/UAT/signed-device/real-push remain; release BLOCKED.

Evidence: `docs/release/evidence/notifications/verification.json`; full integration/browser reports and eight responsive normal/reduced-motion images in the same evidence family. Actual failures retained with root causes/repairs; no assertions weakened. Additive028 retains9 legacy rows/3 duplicate groups in migration regression, unknown generation staysNULL, foreign legacy event binding fails23503, new cross-audience unique index23505 and immutable/retry guards23514. New inbox materialization requires current configured purpose/version consent; retained history still requires current role/resource authorization. Generic push has opaque notification ID only. Provider facts/application safety choice: `notifications/provider-policy.json`. Physical push/legal approval not claimed.


### Privacy workflow local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Privacy now passes the complete frozen-source local gate:119 integration,82 browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools, actual mobileAPI smoke, SDK alignment, stable179-operation contract, offline frozen install and0HIGH/CRITICAL audit. Versioned self tracking and owner-only review execute real encrypted temporary exports, narrow tenant profile corrections, notification consent withdrawal and conservatively configured profile redaction; current session/role/relationship authorization and legacy history are retained. All eight final responsive normal/reduced images inspected. Notifications main9a80fa2 exactCI42309663652 SUCCESS(all30 steps). Privacy commit/exact-SHA CI pending. Fee reminders/remaining operational/M4 work and actual staging/legal/UAT/signed-device/real-push gates remain; overall release BLOCKED.

- Additive029 preserves original001..028 bytes, consent/request identities/status/times and unknown reviewer/method fields. Migration-time LEGACY_OBSERVED events have actual observation time and actorNULL. RECEIVED legacy scope can be confirmed now; unknown-scope legacy VERIFIED/APPROVED requests require reasoned rejection and a new verified request, never fabricated past review. Actual legacy upgrade/FK/transition/append-only tests pass.
- Canonical tenant/actor/session locks precede subject authorization, closing the reproduced consent-after-revocation race. Named privacy.manage is owner-only; existing seven privacy.self roles retain only their own tracking. Current requester role/member/verified relation is rechecked before verification, approval, actual fulfillment and download. Safe owned tracking metadata remains after relation removal; child content does not.
- ACCESS/EXPORT use allowlisted one-statement snapshots, exact financial strings and published own education data. Real draft/other-student scores stay excluded. Dedicated key/AAD tenant/request/key-bound AES256GCM, verified digest/size,2MiB limit, expiry default30min/max24h, authenticated no-store downloads and actual bounded worker expiry purge. API410/purge preserves immutable digest/history metadata. No public URLs or client persistent data cache.
- CORRECT applies only validated local fullName/dateOfBirth/contactEmail/contactPhone with explicit student and request versions, null clearing and meaningful reason; no-op/conflict/invalid date/private field edits rejected. WITHDRAW revokes only supported NOTIFICATIONS grants without changing original boolean/capture history. ERASE stays defaultblocked; scoped approved policy, INACTIVE/no active-upcoming enrollment and explicit retained-record confirmation are required. Actual redaction of five current profile fields, child consent revocation and temporary export content removal retain finance/audit/global identity/attendance/published grades. No global deletion or legal-anonymization claim. Account-only correction/erasure remains explicitly unfulfilled pending the approved identity-custodian process.
- Web real requester/owner transitions, server-confirmed outcomes, nullable corrections, blocked erasure, stale/error/READ_ONLY states and authenticated actual JSON download pass. Native scoped tracking/history, old-alert/delayed-response isolation and app-private file checksum/share/finally+startup cleanup pass; all30 native tests run with original timeouts. OS sharing completion does not prove recipient delivery; signed physical file-sharing/push/legal/staging remain BLOCKED.
- Retained failures: canonical correction field list order (fixed exact sorted-set assertion); initial browser implicit-select locator and consumed bootstrap WEB token (accessible combobox and independent current MOBILE policy probe); initial dynamic-import Jest VM limitation (normal supported Expo imports); mock Symbol.hasInstance rejected its own constructor (prototype-aware test double); async RN render was initially unawaited (await real renderer). Slow sandbox first-render run29/30 retained privately, normal native runtime then30/30 with no warmup, timeout or old assertion changes. Cached Turbopack PostCSS child initialization failed twice; only generated .next archived, clean standard build and final uncached pipeline pass. Full preflight formatter-only failure repaired; full strict native callback type failure repaired with a callable wrapper, no suppression.
- Skill source SHAs/five IDs and actual browser evidence: evidence/privacy/design-direction.json. Expo file APIs based on official SDK58 installed declarations and https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/ and https://docs.expo.dev/versions/latest/sdk/sharing/. expo-file-system~58.0.13/expo-sharing~58.0.22 installed with vendor expo install; no inbound share extension. .env unchanged; secret values and private hash withheld.

Contract delta:11new operations,179total. Self GET/privacy/requests; POST/privacy/consents/{id}/withdraw; POST/privacy/requests/{id}/confirm-scope; GET/privacy/requests/{id}/history; GET/privacy/requests/{id}/export. Owner-only GET/privacy/admin/requests; GET/privacy/admin/requests/{id}; GET/privacy/admin/requests/{id}/history; POST/privacy/admin/requests/{id}/verify; POST/privacy/admin/requests/{id}/decision; POST/privacy/admin/requests/{id}/fulfill. Optional create Idempotency-Key, expected versions, opaque review reference and actual typed result metadata are generated. No arbitrary completion toggle or fixture endpoint. Proposed134-operation spec inventory remains distinct from179 executable operations. Minimal owner stewardship reconciles absent explicit privacy-admin delegation; no manager/accountant/platform learner-data grant.


### Teaching post-lock actor local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Teaching post-lock authorization now passes the complete frozen-source local gate:123 integration,84 browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools, real mobileAPI smoke,SDK alignment, stable179-operation contract,offline frozen install and0HIGH/CRITICAL dependency audit. Actual queued room/class creation and attendance finalization can no longer commit after owner suspension; API schedule generation also rechecks the interactive actor. Trusted system rolling jobs retain actorNULL and real subscription checks. Privacy e85260b exactCI42330434479 SUCCESS all30steps. This security commit/exact-SHA CI is pending. W05/W18, proposed automatic fee reminders, local ops/M4 and actual staging/legal/UAT/signed-device/real-push gates remain; overall release BLOCKED.

- Reproduced before repair with actual PostgreSQL, native sessions and owner PATCH/staff suspension: guard-authorized writes wait behind the real revocation in a controlled transitive PG lock queue. Room/class/finalization returned201 after SUSPENDED, violating the post-lock actor invariant. The baseline regression report retains those three actual failures; the fourth schedule fixture correctly returned409 for its conflicting slot, not an authorization reproduction.
- Schedule fixture now uses a separate still-authorized scheduled teacher and a nonconflicting10:00..11:00 slot, so the same valid command can still succeed for the current owner. No conflict guard, production check or403 assertion was removed. Focused5PASS: four actual queued-write rejections with exact unchanged business rows/outbox/actor audit, followed by the same owner command201, plus realRedis rolling generation/dedup/subscription recheck.
- TeachingService now recognizes an interactive actor only with complete actual SID/user/selected role and calls canonical lockTenantActor after waiting for the tenant lock. Current session, user, ACTIVE nonpending membership, held role, named action and subscription are required. Class/enrollment/session/rule/room commands use teaching.manage; attendance draft/finalization/lesson use attendance.write or attendance.write.assigned; privileged reopen keeps attendance.reopen. Resource/assignment/version/roster/conflict checks remain.
- Only the internal rolling worker supplies an identity-free tenant scope. It retains the tenant/subscription lock and actorNULL audit, without a fabricated user token. Partial identity fields fail closed. No schema, migration, DTO, generated payload, dependency or UI change. Applied001..029 and.env bytes unchanged. Full84browser checks cover existing actual UIs and responsive/a11y/reduced-motion regressions; new renders archived privately and committed historical images restored exactly.
- New operations diagnostic also observes missing owner GET/tenant/settings and GET/tenant/usage404; these are next executable gaps, not a tenant authorization bypass. Two earlier private baseline attempts incorrectly counted only direct PG blockers; actual recursive blocking graph repair observes both API transactions. Current baseline report records actual owner suspension200, queued room201 and correctly denied fresh403 without changing production source.
- Browser first run retained81PASS/1FAIL: the former combined teaching journey + eight responsive axe/Taste reviews reached the original30-second total while already checking locked attendance. Private Playwright trace confirms business assertions and all four rule reviews completed. Split into two independently selectable cases, each with a fresh synthetic centre, complete original business journey/assertions and four original surface reviews. No timeout, retry, domain guard, axe/Taste or assertion removed. The attempted filtered pnpm command selected the entire83-case suite; it was aborted after another old two-surface fee-plan visual case hit the same unchanged30-second aggregate, with31 observed passes and1 failure before the next incomplete case. Host free RAM959MiB/15556MiB and45%CPU were observed, not asserted as the sole cause. Exact owned CLI tree was verified before stopping; parent disposed its synthetic PostgreSQL. Its diagnostic is retained as ABORTED/NOT_VERIFIED, never a pass. Fee-plan surfaces now have independent fresh fixtures and all original four-width axe/Taste/screenshot checks; detail retains the original reduced-motion keyboard assertions. Correct direct tsx filtering runs8 actual focused cases before the entire84-browser/build/backend/native/security gate on newly frozen source. No test-timeout, retry or assertion setting changed.
- Evidence: evidence/teaching-actor/verification.json; actual full and baseline/focused integration reports. All three skill sources/five IDs reverified; no new UI direction or motion introduced. No external approval, physical push/device or production readiness claim.


### Input focus local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Delayed feedback focus now preserves ongoing input, including the reproduced 8.25-to-8.2 and 10,00-to-10 native beforeinput races. Complete frozen-source local acceptance:123 integration,86 browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools, real mobileAPI smoke,SDK alignment,stable179-operation contract,offline frozen install and0HIGH/CRITICAL audit. Prior484283c exactCI42336824150 FAILED83/84browser; its actual evidence is retained. This repair exact-SHA remote CI remains NOT_VERIFIED until observed. W05/W18, proposed automatic reminders, ops/M4 and actual external release gates remain; release BLOCKED.

- Actual CI trace and screenshot show the browser sent8.20 after Playwright filled8.25; API correctly persisted the received value. Native beforeinput deterministically reproduces both late-success and late-error focus races on real production Web/API/database. Both baseline failures remain committed. The initial after-input hypothesis passed and is not claimed as a reproduction. One candidate attempt accidentally used the old production bundle; its3PASS/1FAIL report remains explicitly a stale-build diagnostic, not candidate acceptance. Rebuilt focused6PASS, then full source-frozen suite on freshly rebuilt bundles.
- Shared focusAfterAction captures beforeinput/keydown/pointerdown while the frame is pending, cancels obsolete focus, and checks the original active element/body. This handles resumed Enter-submit editing in the same input as well as focus moving elsewhere. Idle successful/error announcements retain accessible focus. GradeSheet and OperationForm use the helper, as do existing fee-plan, invoice, payment, notification, privacy, report, teacher and tenant-audit feedback handlers. No financial confirmation, idempotency, payload, score/money validation, permission or lifecycle change.
- Regression tests release the actual queued main-world frame during native beforeinput. Original zero/max/invalid/correction/history assertions remain; new normal/reduced-motion cases save and verify8.25 through the actual API/database. Four widths360/768/1024/1440 each retain keyboard/axe/Taste/overflow checks and manual screenshot review. Original timeout/retry/assertions unchanged. Same single framed-sheet/blue/Arial16 design; no redraw or added motion library.
- Whole source/config/tooling/workflow inventory was hashed before builds and rechecked throughout acceptance. Published migrations001..029 and private.env unchanged. Prior historical screenshots restored byte-for-byte after archiving fresh full-regression renders privately; new eight grade-focus images and their hashes retained. All three UI skill sources/five IDs reverified/applied. Physical devices, external staging/consent/UAT and push remain unverified/blocked.


### Input-focus repair exact remote acceptance — PASS; overall release BLOCKED (2026-11-07)

Commita8941608667a2a2def583e8c3f4f01b0d40a6fca is pushed to authorized main. Exact GitHub Actions42342299472/job128312428167 completed SUCCESS, all30steps successful. Actual logs:66unit,123integration, actualmobileAPI smoke and86browserPASS(4.5m). Full local frozen-source acceptance and eight manual responsive/reduced-motion images already retained in evidence/grade-focus/verification.json. This observation resolves the prior remote NOT_VERIFIED checkpoint for the repair; failed484283c CI and native beforeinput RED diagnostics remain historical evidence. Proof:evidence/ci-a894160-success-2026-11-07.json. Continue W18/W05/reminders/ops; actual external release gates remain BLOCKED.


### Centre profile/quota local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Centre profile and actual managed quota now pass complete source-frozen local acceptance:134 integration,91browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools,realmobileAPI smoke,SDK alignment,182stable OpenAPI/client operations,offline frozen install and0HIGH/CRITICAL audit. Owner configuration uses current post-lock authorization, optimistic version and audited name/contact/timezone edits; manager reads only. Logical encrypted-export payload bytes and quota are real scoped data, not physical database size. Additive030 only; published001..029/private.env unchanged. Prior a894160 exactCI42342299472 SUCCESS all30steps/86browser. This new settings commit/exact-SHA remote CI is pending. W18room lifecycle,W05,reminders,ops/M4 and actual external release gates remain; release BLOCKED.

- Actual GET/PATCH/tenant/settings and GET/tenant/usage replace previously observed404 gaps. Owner-only tenant.settings.write, current SID/user/ACTIVE nonpending membership/selectedrole/subscription rechecked after canonical tenant lock. READ_ONLY owner/manager reads retained, writes denied; teacher and forged tenant headers denied. Three real transitive PG lock-queue tests suspend the actor through actual owner API before queued settingsGET/usageGET/settingsPATCH resume:403 with unchanged profile/settings audit, then the still-authorized owner command200. No trusted platform impersonation or user token fabricated.
-030 adds monotonic settings_version via database trigger for actual name/contact/timezone changes, including existing platform/direct profile writes. Two owner edits serialize to200/409; direct platform-style profile edit advances version and stale owner409 preserves history. Explicit contactnull clears the contact email, not login credentials. Named IANA validated by runtime and PostgreSQL; operational students/classes/invoice runs/payments hold later timezone changes to preserve calendars/financial dates. No-op/invalid/overposted/version commands do not mutate or add misleading success audits.
- Counts are actual ACTIVEstudents, ACTIVE/INVITED memberships and ACTIVE/DRAFTclasses. Storage is exact tenant-scoped SUM(octet_length(ciphertext)) of retained encrypted base64 privacy-export payload, including expired content until actual purge. UI labels this basis and excludes system backups; no fabricated physical database/object storage metric or P1file upload. Canonical tenant lock covers actual quota comparison and encrypted artifact insertion. Zero quota leaves requestAPPROVED and no artifact; parallel exports fit only one remaining copy and reject the loser409 without completing it or deleting retained audit. Existing plan immutability preserved: first fixture attempt correctly hitP0001 when changing a subscribed plan; revised fixture creates new plans and moves its synthetic subscription reference. First11PASS/1FAIL and corrected12PASS reports retained; selected12 includes one legacy date-backfill regression. Complete134 run has0skip.
- Actual Web owner edit/clear confirms committed version, refreshes centre header through verified session GET and preserves unsaved input after actualPATCH409 until explicit confirmed reload. Sanitized contextual409 guidance replaces the generic client error, with original assertions retained and actual409 assertion added. Manager/READ_ONLY roles, actual transport failure/retry, missing context and slow real session metadata followed by queued logout are tested. No old settings restored after logout/revisit; no fake profile cache updates. Confirmed commit outcome is distinguished from later refresh failure.
- First local browser command omitted local Redis6385 and stopped before any browser/DB fixture; retainedNOT_RUN preflight diagnostic. First five UI cases4PASS/1FAIL exposed generic conflict guidance. Next3PASS/2FAIL caught a mobile min-content overflow after placing subscription next to usage; fixed nested grid minmax/min-width without weakening overflow/axe/Taste/timeouts. All failure reports and private traces retained. Final focused5PASS then complete91browser acceptance on fresh production bundles; eight final normal/reduce captures360/768/1024/1440 manually reviewed. Desktop plan-price first-viewport assertion retained. Same framed-sheet/blue/Arial16 direction; no new library or animation.
- Whole tracked/untracked product/config/tooling/workflow source inventory hashed before the complete gate and rechecked throughout. Historical committed screenshots restored exactly after private archival of fresh regression renders. New settings eight-image family, hashes and Taste checks retained. All three UI sources/five skill IDs reverified/applied. Centre settings/usage slice accepted locally; full W18 still needs versioned room edit/archive/history. No actual staging/retention key custody/legal/UAT/signed device/real push or production-ready claim.


###030 populated-schema upgrade diagnostic — PASS synthetic; actual staging NOT_VERIFIED (2026-11-07)

Fresh owned clone of populated schema029 upgraded through actual Prisma migrate deploy to030. All57original non-migration tables/12,820rows match exact original-column canonical counts/checksums;29historical migration rows unchanged;30th checksum matches current030file. All70legacy tenants initialize version1. Actual SQL verifies version cannot be forged, real profile1->2 and metadata no-op remains2; transaction rollback restores all original fields and initialized versions. Positive version CHECK validated. Diagnostic7912ms, migration4655ms, local synthetic only; no original source/user database/.env write. First catalogue-array parser diagnostic stopped before migration and is retained. Evidence:evidence/tenant-settings/upgrade-verification.json and upgrade-first-diagnostic.json. Actual staging/production data migration and external release gates remain NOT_VERIFIED/BLOCKED.


### Centre profile/quota exact CI — PASS; room baseline gap reproduced; release BLOCKED (2026-11-07)

Commit7feda306275cb38ffceecf87005cd1b400246252 is pushed to main. Exact CI42346216311/job128324416212 SUCCESS all30steps; actual logs66unit/134integration/realmobileAPI smoke/91browserPASS(4.8m). Proof:evidence/ci-7feda30-success-2026-11-07.json. This resolves preceding module remoteNOT_VERIFIED; full local source-frozen gate and populated029->030upgrade remain in evidence/tenant-settings. Published001..030 now immutable.

Next actual P0 baseline on owned fresh database/current compiled7feda30: actual room/teacher/class/rule APIs create default room20, class5, future override room6 and0instances. PATCH class capacity8 returned200, persisted8 while override remains6/active; expected409. Class create response also omits actual stored roomId. This is a reproduced remaining FR-CL-01 gap, not a passing feature test or a failure of the accepted profile module. Proof:evidence/rooms/rule-capacity-baseline.json. Implement room lifecycle/real selectors, safe capacity/default room handling and actual metadata; then complete full gates/exactCI. W05/reminders/ops/M4 and actual external staging/legal/UAT/signeddevice/push gates remainBLOCKED.


### Rooms lifecycle/selection local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Rooms lifecycle and actual room selection pass complete source-frozen local acceptance:150integration,104browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools,actualmobileAPI smoke,SDK alignment,185stable OpenAPI/client operations,offline frozen install and0HIGH/CRITICAL audit. Scoped versioned create/edit/archive/reactivate/history and usage use actual SQL and current post-lock actor checks. Real bounded selectors cover class default create/edit/clear, recurring rule preview/create/replacement, extra/rescheduled sessions and calendar room filter. Additive031 only; published001..030/private.env unchanged. Populated030->031 upgrade diagnostic preserved57tables/13,132rows/30oldmigrationrecords; actual staging is NOT_VERIFIED. Prior7feda30 exactCI42346216311 SUCCESS all30steps/91browser. This new Rooms commit/exact-SHA remote CI is pending. W05,reminders,ops/M4 and external release gates remain; release BLOCKED.

- GET/POST rooms retain operation IDs; new scoped GET/PATCH room detail and GET room history use teaching.manage for owner/manager/academic_staff, with current SID/user/ACTIVE membership/selected-role/mode rechecked after the canonical lock. Teacher/accountant cannot blend held roles; A/B/nested foreign references404; READ_ONLY reads retained/writes403. Five real transitive PG lock-queue tests revoke the manager before list/detail/history/create/update resume:403 with no room/audit mutation, followed by successful owner command.
-031 enforces positive monotonic room version and immutable id/tenant/code. Actual concurrent edits commit one version/audit and return one409; no-op/stale/blankname/invalid integer/overposted/duplicate commands do not invent success. Typed versioned audit captures verified historical actor name and exact before/after fields; unknown legacy/freeform/foreign metadata stays redacted. No room deletion API.
-Archive/shrink guards check actual active/draft default classes, active future inherited/explicit rules and upcoming/ongoing/reopened sessions under canonical lock. Completed/cancelled/past history does not reserve space. Actual locked attendance/enrollment/closed-class historical room IDs, roster and records survive archive. Class-capacity regression reproduces prior200 invalid future override before fix, now409 and unchanged records; exact fitting capacity generates four real valid sessions. Versioned default changes validate own active adequate room and preserve concrete assignments; nullable legacy inherited future assignments block silent movement.
-Web keeps unsaved input after409 and requires explicit confirmed reload; archive cancellation does not mutate, accepted archive reports only actual server success. Actual usage/history/pagination/search and off-page picker selections remain visible and scope-keyed/cancellable. Real extra/rescheduled sessions preserve selected room in session-change snapshots and calendar filters; rule replacement preserves prior valid segment/room throughJune9 and creates same-lineage chosen-room segment fromJune10. No fixture/mock in production.
-16 FINAL screenshots cover populated detail/usage/history and directory at360/768/1024/1440 in normal/reduced motion; axe and keyboard/focus pass, narrow directory ArrowRight actually scrolls. Unmodified Taste checker reports0FAIL and retains2WARN panel-void/68px at1440 detail. Manual review accepts semantic separation before pagination actions (the vendor recommendation permits actions at a panel foot), with no hidden data, stretched empty plot or overlap. Every warning and report hash retained, not suppressed. Manual visual review recorded per-image hashes. Same framed-sheet/blue/Arial16 direction and all3sources/5skills; no new animation dependency or delayed commit feedback. Fresh regression renders of historical artifact families archived privately and original historical evidence restored exactly.
- Two additional meaningful boundary regressions reproduced actual product defects: real aborted roomGET followed by successful retry reset an unsaved draft, and valid maximum40-character unbroken code overflowed360px. Repaired transient-error handling retains the editor mounted but hidden until verified retry restores the draft; actual owner staff-suspension then roomGET403 removes all form fields. Scoped room-title overflow wrapping passes real360px document+heading bounds, native keyboard and axe in normal/reduced motion. No stale detail displayed during transport errors and no permission bypass.
- First complete gate150integrationPASS but97/100browserPASS: two fixtures navigated before initial verified session was ready (actual abortedrefresh then401), and combined directory/detail visual work exceeded30s. Added actualbanner readiness assertion and split independent directory/detail surfaces into four visual cases; every old width, motion, axe/Taste/screenshot/keyboard assertion retained, unchanged30s timeout/security. First repaired focused12/13 also exposed typing into the still-visible previous create form before Next client navigation completed; added actual target heading/code/name readiness assertions, preserving no-op guards and every save assertion. Preserved original firstfull, boundarybaseline and first repaired failures; new source requires the complete second gate150/104, not reuse of first source results.
-All failed focused reports retained: first5/1alert ambiguity, second7/1offline ambiguity, third8/1wrong preview201 expectation (documented200), fourth8/1wrong prior-rule deactivation expectation (prior segment must survive); earlier focused rule1PASS, later focused13PASS and full104PASS. Initial stale-dist generated-client build failure was repaired by APIbuild->OpenAPI->client->Web order; no guard weakening/retry/timeout increase. Original focused lifecycle16/2 route fixture failures and corrected18PASS retained. External staging/legal/UAT/signed physical device/real push/offhost key custody remain unverified; no production-ready claim.


### Rooms exact CI — PASS; release BLOCKED (2026-11-07)

Rooms commit442cd7b503a08e16d7ee07766c3fef96474900a5 is pushed to main. Exact CI42354835993/job128350522274 SUCCESS all30steps; actual job logs66unit/30mobile/150integration/realmobileAPI/104browserPASS(4.4m). Proof:evidence/ci-442cd7b-success-2026-11-07.json. This resolves preceding module remoteNOT_VERIFIED; whole second local frozen gate150/104,16manual image hashes/0FAIL+2documentedTasteWARN, and populated030->031upgrade remain in evidence/rooms. Published001..031 immutable. W18room lifecycle/selection and class/schedule capacity/default guards now verified; W05/reminders/ops-M4/remaining compatible dependency maintenance and actual external release gates remain. ReleaseBLOCKED.


### W05 student histories — local PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-08)

W05 selected-student histories and role-scoped profile navigation pass complete source-frozen local acceptance:159integration,121browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools,actualmobileAPI smoke,SDK alignment,187stable OpenAPI/client operations,offline frozen install and0HIGH/CRITICAL audit. Actual paginated enrollment/finalized-roster attendance routes use canonical tenant reader and current post-lock actor. Profile overview/classes/attendance/grades/finance/guardians use actual APIs with selected-role gates, limited accountant fields, unsaved draft preservation, verified retry and access revocation. No new migration; published001..031/private.env unchanged. Prior442cd7b exactCI42354835993 SUCCESS all30steps/104browser. New W05 commit/exact-SHA remote CI pending. Remaining teaching selectors/calendar teacher filter, reminder proposal, reusable operations/M4, dependency maintenance and external release gates remain; release BLOCKED.

- Selected learner enrollment/attendance APIs enforce tenant/nested joins, selected role, active membership/session/user and subscription/feature after the canonical lock. Accountant receives limited enrollment and finance; teacher/student/guardian use their separate object-scoped APIs. Two actual PG lock-queue cases revoke the manager through owner API before reads resume:403, no enrollment changes, authorized owner read200. A/B/forged context/unknown learner/overpost/date-range/large-offset negative cases retain actual status assertions.
- Attendance joins actual immutable roster snapshots and includes only completed/finalized marked records. Draft and privileged reopened results stay unpublished; real PRESENT draft->finalize->reopen->LATE refinalize API cases pass. Withdrawal and class closure preserve finalized history; no lesson/homework/private notes/foreign learners are returned. Actual database counts drive bounded20-row pagination/search; no zero placeholder or client aggregate.
- URL navigation exposes only panes allowed by the current selected role, validates forged pane names before child queries and keys state/queries by user/tenant/role/student. Parent access401/403/404 removes editor and private fields; transport failure hides but preserves draft until successful verified retry. Owner staff-suspension through real API produces403 and removes inputs/navigation from DOM without persisting unsaved edits. Dirty overview survives navigation and real failed GET/retry; offline/read-only writes stay disabled. Existing assessment journey explicitly opens its actual grades pane, retaining published-score assertions.
- Finance uses existing typed studentId-filtered invoice/payment APIs and exact string/BigInt VND display, independent pagination, true receipt/detail links and verified centre timezone. Actual API fee/run/payment fixture issues1,200,000VND and records500,000VND allocation; browser confirms700,000VND remaining and the real receipt. Accountant forged attendance pane makes no attendance/grades/guardian request and displays no private form. Foreign student deeplink404 exposes no profile/table.
- Final32 browser images cover overview/enrollments/attendance/finance at360/768/1024/1440 in normal/reduced motion, all manually reviewed with exact hashes. Native keyboard/axe/Taste checks retain all findings. Manual initial360 review caught compressed date/code columns despite axe passing: fixed with bounded horizontal table regions, readable minimum column width, named/focusable keyboard scrolling, visible scroll guidance and left-aligned counts. No checker or assertion weakened; no new animation dependency. Historical evidence renders archived privately and committed prior evidence restored exactly.
- Failed focused reports retained: initial9API fixture failures lacked mandatory synthetic subscription dates; repaired fresh9PASS/150SKIPPED. Initial browser3/6 failures were Next announcer/offline broad locator ambiguity and consumed web-family token; second5/6 retained strict native-login rejection of web cookies. Fixed exact semantic locators and real independent cookie-free native login, preserving every security assertion. Final focused19PASS and complete121PASS have no retries/skips/flaky or timeout increases. Initial strict optional AbortSignal and Prisma fixture model-name errors repaired rather than suppressed. Post-review count alignment/scroll guidance included in complete frozen gate.
- First complete automated159/119 gate passed but manual financial image review rejected the source:768px VND digit groups wrapped and actual receipt CONFIRMED was untranslated. Retained exact old-source screenshots/hashes and reproduced line-box regression against the old production build in both motion modes. Scoped right-aligned tabular non-wrapping money cells and Vietnamese confirmed label repair the actual UI; real DOM Range line-box and translated-status assertions now run at every width in both modes. Complete fresh third frozen159/121 acceptance is required; no first-source result is reused as current acceptance.
- Read-only compatibility review caught an overrestrictive new page wrapper: existing student-own and verified guardian-linked detail APIs returned200 but the new page blocked both roles. Retained two genuine failed browser baselines after successful actual API preconditions; restored only their basic overview. Current browser cases verify one overview link, no private editor/notes, zero staff enrollment/attendance/grades/guardian/finance requests even with a forged finance pane, and unrelated learner404. Teacher remains denied by the existing student-detail permission. No backend permission was widened. Final text-search maxlength100 matches the existing API ListDto bound; current full acceptance covers the final candidate, while earlier focused17 remains historical.
- Second full gate passed159integration and all pre-browser checks but was interrupted across a large host execution/time gap: two unchanged guardian browser cases recorded30-second timeouts after1.5h/23.6h elapsed. Frozen source/environment remained unchanged; failures are retained and no assertion/retry/timeout was relaxed. A fresh third complete gate after aligning the search input with the existing100-character DTO, on a fresh owned database must pass before acceptance.
- Fresh targeted recovery19cases exposed a separate test dependency: guardian visual case assumed a profile created by the preceding journey, so filtered standalone execution had no directory region (18PASS/1FAIL). It now provisions its own synthetic contact through the real UI, verifies the actual returned link and selects that exact profile rather than the first arbitrary row. All four widths, axes/Taste, native horizontal keyboard scrolling and detail/reduced-motion assertions are retained; no timeout/guard/assertion weakening. Failed sixthfocused report and private trace remain, followed by required fresh focused19 and full121 acceptance.
- All project checks finished passing before an auxiliary PowerShell finally-cleanup hit a dynamic UInt32 binding error. The original failed cleanup record and wrapper exit1 are retained in localExecutionState; no explicit cleanup success is invented. The owner command exited and independent process enumeration found zero matching owners. Release of its thread-scoped request is labeled an inference from confirmed owner exit; direct global power inspection requires administrator and was unavailable. No power-plan/display setting was changed. This cache-only helper failure is separate from actual159/121 project test results.
- Same single framed-sheet/blue/Arial16 direction. Applied ui-ux-pro-max labels/logical keyboard focus/deep-link navigation and design-taste-frontend actual-browser inspect/look-fix. All3sources/5skillIDs reverified: Taste6010f91a9935f1c167dfc500fb1a475681892e6b,ProMaxd14efff8ed1faa4187f004f79926f428c8074ec7,animationb6dba3eb759726845a44163ff0bad70dd9e7fbb6. Static pane content and inherited reduced-motion CSS preserve immediate operations; no new motion dependency.
- Synthetic/local evidence does not establish staging deployment, backup key custody/restore rehearsal, legal/consent approval, centre UAT, signed physical iOS/Android build or actual push delivery. Reminder09:00 tenant-IANA,T-3/T+1/T+7,max3 remains a proposed disabled preset until actual owner enable, not fabricated prior numeric approval. Work continues on remaining master P0/M4 items.


### W05 exact CI — PASS; release BLOCKED (2026-11-08)

W05 commite12882536eee56195c4fe16f7434dbeb851c382e is pushed to main. Exact CI42490137881/job128760511668 SUCCESS all30steps; actual job logs66unit/30mobile/159integration/realmobileAPI/121browserPASS(5.4m). Proof:evidence/ci-e128825-success-2026-11-08.json. This resolves preceding W05 remoteNOT_VERIFIED; complete frozen local159/121,32manually reviewed responsive normal/reduced images,187stableoperations and canonical current-actor histories remain in evidence/student-history. Published001..031/private.env unchanged. Remaining teaching resource selectors/calendar teacher filter, fee reminder proposed preset, reusable ops/M4, compatible dependency maintenance and actual staging/legal/UAT/signed-device/real-push/offhost-key-custody gates remain; releaseBLOCKED. Continue master work.
