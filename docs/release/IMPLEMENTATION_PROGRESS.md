# P0 implementation and release hardening

## Latest checkpoint — 2026-11-07

Notifications N1 passes the complete local frozen-source gate:109 integration,78 browser0skip/flaky,60unit/20mobile,8uncached builds/types, real mobile API smoke, stable168-operation contract, offline frozen install,0HIGH/CRITICAL audit and verified skills. Current-resource inbox/legacy sibling scope, multi-role event/device dedupe, actual device generations, bounded retries/receipts/Redis recovery, committed finance during provider failure and Web/Mobile controls are verified. N1 commit/exact-SHA CI pending. Auth4bccaa7 exact CI42296909065 is successful. Fee reminders under approved policy, Privacy/remaining operations/M4 and external staging/legal/UAT/signed-device/real-push remain; release BLOCKED.

Remote main43e68bd has verified successful CI42241955407 for Invoice/W14,
including the navigation synchronization repair. Failure42238649247 is retained
separately; the repair has fresh44 browser/74 integration and the full local gate.
Payment/W15 local gate PASS: exact paged receipt reads/history, Web cash/bank
multi-invoice installments, internal print and confirmed reversal are implemented.
Full76 integration and49 browser cases pass, including committed-response loss,
unallocated money, actual role restrictions, four viewport axe/Taste and
keyboard/reduced motion. Final8 screen images and print image reviewed. All other
local gates pass; Payment commit/remote CI remain pending. Staff/W17,
Guardian/W06, Teacher/W07, Assessment/W12 and Fee plans/W13 are technically
verified locally and on exact-SHA CI. Fee-plan evidence uses Node24.22.2:
71 integration,40 browser,49 unit,15 mobile, uncached builds/types and stable
152-operation contract. Invoice/W14 has a verified local gate:74 integration,
44 browser cases with no skips/flakiness,49 unit,15 mobile Jest and stable156-operation
contract. Full build/types/lint/format, mobile API and Expo checks pass. Its
module416378f was pushed to main. CI42238649247 passed43/44 browser cases but
exposed a visual-test navigation race: page.url() was captured before the client
route completed. The follow-up asserts the actual detail URL before capturing it;
no timeout/retry/assertion was relaxed. Full repair regression PASS:44 browser,
74 integration,49 unit,15 mobile Jest, uncached build/types and remaining local
gates. Production sources and applied migrations are unchanged by the repair.
Exact-SHA successful remote CI42241955407 is now observed for43e68bd.
Remaining Payment/Receivables,
Dashboard/Reports/Audit, Privacy/Notifications and
M4 work are incomplete. Overall release BLOCKED. Older dated sections below retain
historical findings and failed attempts; they are not current acceptance verdicts.


## Mandate and baseline

Continue all executable P0 work from `d43b3388bf89bb8db4228bda31428c69b2f7edfe` on
`feat/p0-release-hardening`. Date: 2026-10-24. No production deployment or store
submission is authorized. Preserve local `.env` and the three pre-existing edits
in mobile tsconfig and Web/Platform next-env declarations.

The master specification, AGENTS instructions, AI scope/security/backend/skills
instructions, prior progress and evidence were inspected. Existing tests and
historical evidence do not establish complete P0 or release readiness.

## Current-session observations

| Command/check | Result | Limits |
|---|---|---|
| `python scripts/validate_ai_pack.py` | PASS, 19 Web + 9 Platform + 21 Mobile manifest entries; 33 P0 FR, 30 TC | Structural inventory only; Windows uses `python` |
| `pnpm.cmd test` before changes | 24/24, 8 files | Unit only |
| `pnpm.cmd lint` before changes | exit 0 | No runtime proof |
| `pnpm.cmd typecheck` before changes | exit 0 | Turbo cache hits; repeat uncached after changes |
| `pnpm.cmd --filter @fluivix/mobile test` | 15/15, 4 suites | Jest; not native device UAT |
| `pnpm.cmd audit --json` with network access | exit 1; 1 high, 0 critical | node-forge 1.4.0, GHSA-86w9-cpqp-85rv, no published fix reported |
| `pnpm.cmd db:generate` after migration 016 | exit 0 | Verified identical copied engine avoids DLL held by user's API; no process killed |
| `pnpm.cmd test` after strict timezone utility | 27/27, 9 files | Includes Vietnam UTC boundary, fractional zone, DST gap/fold rejection |

Raw audit is local `.cache/release-audit-network.json`; it contains dependency
metadata only. Initial restricted-network audit failed EACCES and is not counted
as a vulnerability scan. An initial mobile command with extra `--` found zero
tests; the corrected command above actually executed all 15 tests.

## Execution queue and honest state

1. Audit source routes/schema/screens and trace all 33 FR + TC-001..030 — IN_PROGRESS.
2. Recurring schedules, enrollment and class lifecycle — IN_PROGRESS; migration
   016 and recurring preview/generation API implemented, PostgreSQL regression running.
3. CSV import with per-row preview and atomic commit — pending.
4. Staff and teacher lifecycle — pending.
5. Finance public APIs/reporting — pending gap reconciliation.
6. Operational Web pages and end-to-end flows — pending.
7. Mobile hardening and native release preparation — pending.
8. Notification deduplication/preferences/reminders and DSR operations — pending.
9. Dependency/security remediation — high advisory remains OPEN.
10. Migration/CI/observability/backup/load/UAT/release runbooks — pending.

## First implemented checkpoint

API/DB/client module commit: `3a06a7b`. This is a technical checkpoint, not P0
completion. Migrations016..018 and the following behaviors are now implemented:

- ISO weekday rules with tenant timezone, strict DST fold/gap rejection; preview
  and atomic generation60days; concurrent retry skips existing rule/date without
  overwriting manual/session history. Rule editing and automatic rolling jobs
  remain gaps.
- Versioned class/teacher edits, explicit class closure preconditions, withdrawal
  preserving immutable roster. Effective-date peak capacity includes withdrawals
  whose last day is in the future. Composite FK/negative A/B tests exercised.
- CSV512KiB/5000rows with strict headers/encoding/quotes, field validation and
  duplicate preview; all-or-nothing commit rechecks scope/quota/duplicates under
  lock; same-job retries return one committed result. Preview raw rows purged on
  commit/24h expiry; worker minute sweep; bounded open previews.
- Real Web CSV preview/error report/confirmation and teaching class/detail,
  assignment, enrollment/withdrawal, recurring builder, calendar and session
  attendance/lesson/changes/reopen. New pages are still being reviewed/tested.

Fresh regression: unit38/38; integration40/40 in evidence JSON; mobile Jest15/15;
`pnpm.cmd test:mobile:api` PASS for actual Teacher20/finalize/report, Student
publication, Guardian2/finance/revocation and tenant switching. No device UI test.
Uncached typecheck8tasks0cache exit0; lint exit0. `pnpm.cmd build`:8tasks success,
1cache hit; Web/Platform production outputs and Android/iOS Hermes exports, not
signed APK/IPA. Full Edge regression19/19 passed. After screenshot-driven polish,
targeted CSV/student/teaching regression3/3 passed and saved e2e.json. Latest tiny
dirty-form guard assertion is awaiting its focused run.

Browser screenshots and axe/Taste results are under evidence/visual. No axe
violations or Taste FAIL; Taste reports a panel-void spacing WARN on the session
sheet. Visual review corrected narrow clipped attendance controls and oversized
confirmation checkboxes; locked attendance/lesson now render readable values.

All14 requested release documents exist. They distinguish engineering checks,
unexecuted external gates and unfinished code. Nothing has been deployed/pushed
to main in this continuation. The initial pnpm install attempt aborted before
module deletion; lockfile-only offline resolution and a local workspace junction
added the shared contracts dependency without replacing active node_modules.

Every slice must update this record plus `docs/ai/08_PROGRESS.md` and
`docs/ai/14_RELEASE_EVIDENCE.md`. No FR is DONE_VERIFIED solely because an API exists.

## Recurring hardening checkpoint — ced5dca

Migration019, rule replacement/history, immutable occurrence identity, real daily
rolling jobs and unsaved preview are implemented. Preview writes are deliberately
rolled back, including audit. Creation and generation recheck real conflicts.
Protected manual/snapshotted/completed/prepared lessons survive future changes;
an invalid replacement rolls back cancellations and new rows together.

Latest unit38/38 and integration42/42 are in evidence JSON. Redis/BullMQ is real;
tests cover daily dedupe, advancing horizon, READ_ONLY and sanitized failure state.
Current focused browser4/4 (teaching-csv-final-e2e.json) includes CSV download,
unsaved rule preview, future edits/history and a genuine two-session response race.
The earlier3/4 failure is retained as e2e-stale-first-failure.json: homework was
reset while refresh remounted the form. Product code now blocks edits until sync
finishes and uses the version associated with lesson content. No assertion removed.
Web build, lint, Web/tools typechecks passed. Earlier full19/19 predates this
extension; full20 remains to rerun at the next regression gate.

All new rule UI was checked at360/768/1024/1440 with actual Edge, axe and Taste.
Screenshots were inspected; grid spacing was reduced. No axe violation/Taste FAIL;
a44px panel-spacing WARN remains visible in the report and has been reviewed.

Next executable slice: staff directory/roles/invitations, last-owner protection,
teacher directory and assignment lifecycle. Audit the teacher roster's effective
assignment-date scope and enrollment conflict date intersections during this slice.
Then finance APIs/Web, guardian/grades/reporting/audit/settings Web, notification
dedupe/reminders, DSR operations, mobile/network hardening and operational gates.
Remaining code work is not excused by external legal/device/infrastructure blockers.

## Skills reverified

Vendor checkout HEADs match `docs/ai/18_SKILL_SOURCE_LOCK.json`:

| Source | SHA | Installed IDs | Application |
|---|---|---|---|
| Taste | 6010f91a9935f1c167dfc500fb1a475681892e6b | design-taste-frontend | App-screen rules + real Edge/axe/Taste checks of CSV/session/rule UI at4 widths |
| Pro Max | d14efff8ed1faa4187f004f79926f428c8074ec7 | ui-ux-pro-max | Existing education operations direction retained; targeted research before UI |
| Web Animation | b6dba3eb759726845a44163ff0bad70dd9e7fbb6 | accessible-animation, micro-interaction, 60fps-animation | Rules loaded; no new motion in backend slice; native uses RN principles |

Installed SKILL.md files match their vendor copies byte-for-byte; all3 sources are
MIT. Design research and native guidance ran locally. Only the specific browser
screens/artifacts above are visually verified; signed native UI UAT remains blocked.

## External release constraints

Signed Android/iOS builds, iOS host/device, signing identities, EAS project/store
accounts, real push credentials/receipt/device tests, staging deployment/access,
approved infrastructure/backups and legal/privacy approvals remain unverified.
The user's physical Android Expo Go login/context selection observations are
bounded evidence and do not replace signed-device UAT or push verification.

Overall: **BLOCKED**. Implementation is actively incomplete; do not publish or
describe the repository as production-ready.


### Module commit and merge preparation (2026-11-06)
- Scope: preserve and commit existing API development runner, mobile TypeScript config, Next generated declarations, CI reporter/artifact config, and release documentation/inventory by module. No feature slice implemented.
- Fresh verification PASS: python scripts/validate_ai_pack.py; pnpm.cmd lint; pnpm.cmd test (38/38); pnpm.cmd exec tsc -p tsconfig.tools.json; pnpm.cmd --filter @fluivix/api build; web/platform/mobile typecheck; mobile test (15/15, 4 suites); targeted Prettier check; node --check tooling/dev-api.mjs; git diff --check.
- Existing release JSON evidence parsed successfully; historical reports are retained with their original dates. Integration/E2E, physical devices, restore and external approvals were not rerun in this Git handoff. Release remains BLOCKED per RELEASE_GATE.md.
- Secret screening: 47 changed/untracked files checked; no matches to local .env secret values or private-key/GitHub-token/JWT patterns. .env remains ignored and untracked.
- Existing vendor source HEADs match lock: design-taste-frontend 6010f91a9935f1c167dfc500fb1a475681892e6b; ui-ux-pro-max d14efff8ed1faa4187f004f79926f428c8074ec7; accessible-animation/micro-interaction/60fps-animation b6dba3eb759726845a44163ff0bad70dd9e7fbb6. Installed SKILL.md files verified against vendor sources; instructions inspected for applicability. Applied UI skills: none (Git handoff, no UI implementation or design acceptance).
- PowerShell execution policy required pnpm.cmd; python3 executable inaccessible, equivalent validator executed with python. Git metadata writes/network require elevated sandbox execution.


## 2026-11-06 ? P0-A verification baseline (in progress)

Baseline: main/origin main bec1a06; clean tree before work. Latest observed remote CI run 42156495368 failed at pnpm test:integration.

Implemented, awaiting final regression and remote CI:
- CI integration/E2E explicitly use TEST_REDIS_URL6379 with Redis container healthcheck; local default consistently6379, opt-in6385 documented. Shared worker/test Redis parser preserves ACL, TLS and selected DB and sanitizes invalid configuration. Bounded test readiness fails before creating fixtures; no timeout increase.
- Official node-forge1.4.3 pinned via pnpm override (Expo CLI supports ^1.4.0); official Expo58 patch alignment plus RN0.88.1 Metro/Jest peers. Fresh npm audit went from6HIGH/0CRITICAL to0HIGH/0CRITICAL (1LOW/4MODERATE remain). Positive Node RSA interoperability and malformed nested DigestAlgorithm rejection executed against the actual Expo CLI dependency.
- Full baseline browser run19/20 exposed real shared-IP rate-limit state between test cases. Production limit remains10 per15minutes. Added isolated test-runner DB propagation, per-case cleanup restricted to local *_test fixtures, and a browser/API case asserting request11 returns429. Final full rerun pending.

Fresh observed commands: frozen install PASS; Prisma generation PASS; AI pack PASS; lint PASS; typecheck PASS; format PASS after normalizing baseline formatting;49 unit tests PASS;42 integration PASS against new disposable PostgreSQL container55435 plus Redis6385/Mailpit;15 mobile Jest PASS; mobile API smoke PASS; first full build PASS (Hermes exports, not APK/IPA); final patch build ongoing. OpenAPI/client regeneration PASS; final no-drift check pending. Failed readiness/migration/browser reports retained in evidence, not overwritten as successes.

Environment: Windows/Node24.15.0/pnpm10.34.7/Python3.13/Docker29.4.1. PowerShell requires pnpm.cmd; python3 inaccessible, python equivalent used. Existing .env unchanged. Local TEST_DATABASE_URL from .env pointed at unavailable5432; explicit disposable Docker test database was used instead.

Skill verification: installed SKILL.md files match audited MIT vendor copies. design-taste-frontend SHA6010f91a9935f1c167dfc500fb1a475681892e6b; ui-ux-pro-max SHAd14efff8ed1faa4187f004f79926f428c8074ec7; accessible-animation/micro-interaction/60fps-animation SHAb6dba3eb759726845a44163ff0bad70dd9e7fbb6. Instructions inspected. Existing Taste browser checks ran as part of regression; no new UI design accepted in P0-A.

Other requested P0 modules remain incomplete; staging/device/push/legal/business UAT gates remain BLOCKED_EXTERNAL/NOT_VERIFIED. No production approval. No new commit/push until automated gates pass.


### P0-A local verification checkpoint (2026-11-06)
- Final sequential E2E21/21 PASS, including real request11=429 and full onboarding. All local gates listed in TEST_RESULTS.md now pass; JSON summary in evidence/p0a-local-verification-2026-11-06.json.
- Full patch build8/8 PASS; OpenAPI/client no drift. Frozen installation and audit high threshold repeated successfully.
- Added an owning E2E runner so test DB configuration is available to both servers and browser fixtures. Counter cleanup is restricted to disposable loopback *_test DBs. Production rate limits unchanged.
- Verified failure propagation: a deliberate no-matching-scenario probe returns1. Fixed embedded-postgres beforeExit overriding process.exitCode; resource cleanup precedes explicit child-status propagation.
- Preserved failed reports and historical tracked visual artifacts; new visual snapshots archived under evidence/visual/2026-11-06. One intermediate browser failure was caused by an overlapping local build replacing served chunks; final run executed sequentially.
- CI/security/mobile patch changes form one atomic baseline repair: either the old Redis CI failure or vulnerable dependency would fail mandatory gates independently. Remaining functional slices are not included in this checkpoint. Remote CI still pending push. Overall release BLOCKED.


### Remote CI correction (2026-11-06)
- Commit edcf9a101e86720e4c5ef387f841a7fc6a618a61 pushed to origin/main. Run https://github.com/luciusvie2712/Fluivix-Edu/actions/runs/42163108112 FAILED:20/21 browser tests, Taste login standalone Chrome launch exceeded20seconds. All earlier CI steps, including42 real PostgreSQL/Redis integration cases, passed. No module completion claimed.
- Public log endpoint returned403; read actual log using existing GitHub authentication, keeping credential only in process memory and raw logs under ignored .cache. Sanitized result retained in evidence/ci-edcf9a1-2026-11-06.json.
- Corrective runner chooses Playwright-installed Chromium on Linux via CHROME_PATH, honoring an explicit operator override. Avoids unaudited system browser selection. No timeout increase, retry, skipped test, altered vendor skill or weakened finding assertion. Verification ongoing.


### Corrective CI patch local gate (2026-11-06)
- Full local verification repeated PASS: lint, typecheck/tools tsc, format,49 unit,15 mobile Jest,8/8 cached build,42 isolated PostgreSQL/Redis integration,21 browser E2E, mobile API smoke, Expo check, OpenAPI/client no drift and audit0HIGH/0CRITICAL. New JSON reports: integration-2026-11-06-ci-correction.json, e2e-2026-11-06-ci-correction.json.
- CI workflow now also executes the existing real mobile API smoke after integration. No production code or authorization policy changed in this corrective patch.
- Linux-specific browser selection still requires exact corrective-commit CI evidence. Original failed run/evidence retained. Other functional P0 slices and external gates remain incomplete/BLOCKED.


### Linux native PostgreSQL supply-chain correction (2026-11-06)
- CI run42164545223 for dce1f75 failed at newly enabled mobile API smoke. Earlier gates including42 integration passed. The embedded bootstrap rejected with a string, while pnpm install explicitly reported ignored @embedded-postgres/linux-x6417.6.0-beta.15 postinstall.
- Audited exact official npm tarball and verified SHA512 against pnpm-lock.yaml. Postinstall only restores14 shared-library symlinks under module native/lib; every source exists and no absolute/traversal paths occur. MIT package, upstream gitHeadeab9a9da10633c874929b3d393cbbd734e05af0b.
- Reproduced under disposable non-root Linux Node24: initdb before hydration exits127 missing libpq.so.5; exact reviewed script restores PostgreSQL17.6 startup. Full init/start/status/stop lifecycle rerun pending; bundled package has no psql, so no SQL-query claim from that probe. API/CI suites remain authoritative for SQL acceptance.
- Only exact package/version added to pnpm.onlyBuiltDependencies. No broad build-script approval, security suppression or test skip. Local full verification ongoing; remote gate remains pending.


### Native bootstrap corrective local gate passed (2026-11-06)
- Native Linux Node24 container reproduced missing-libpq exit127 before hydration and PostgreSQL17.6 init/start/status/fast-stop PASS after the reviewed14-link postinstall, under a non-root user. No SQL query claimed from the native probe (psql not bundled); real API suites exercise SQL.
- Full local gate repeated PASS: frozen install, lint, typecheck/tools tsc, format,49 unit,15 mobile Jest,8 cached build tasks,42 real PostgreSQL/Redis integration,21 E2E, mobile API smoke, OpenAPI/client no drift and audit0HIGH/0CRITICAL. Evidence: *-2026-11-06-native-bootstrap.json. Initial format failure fixed before remaining gate execution.
- package.json only adds @embedded-postgres/linux-x64@17.6.0-beta.15 to the existing build allowlist. Exact-version selectors are supported by pinned pnpm10.34.7 (introduced10.19). No other script approval, application change or skipped assertion. Remote correction still NOT_VERIFIED until CI result is observed.


### Taste browser transport correction (2026-11-06)
- Remote run42166142485 (3bce4c9) passed native mobile API smoke on Linux, confirming the reviewed native symlink fix. E2E19/21: both standalone Taste Chrome/CDP launches aborted with signal (exit code null); all functional Playwright journeys passed. Raw log retained under .cache; sanitized evidence in ci-3bce4c9-taste-driver-2026-11-06.json. Kernel/sandbox cause is not invented from a truncated Chrome crash stack.
- Replaced only the standalone launch transport with the existing Playwright browser. New inspectTasteApp executes unmodified audited probe/frame/layout/app/colourShare and judge/judgeLayout/judgeApp exports; upstream APP_SKIP/title app-mode policy is retained. No extra waived finding, OS/security flag, timeout increase or vendor source change.
- Coverage expanded to1440/1024/768/390/360, screenshots and raw metrics retained. Real browser negative probes assert that app heavy-shadow, general palette-purple and frame covered-text still fail. Focused positive/negative runs PASS. Viewed actual360/1440 screenshots: labels/actions visible, no clipping. Full regression and remote CI pending.
- This supersedes the unsuccessful CHROME_PATH-only workaround. It follows the repository's existing authenticated Playwright/Taste probe bridge without exporting cookies/tokens to another browser.


### Taste transport full local gate (2026-11-06)
- PASS: lint, typecheck (including tooling), format,49 unit,15 mobile Jest,8 build tasks,42 isolated PostgreSQL/Redis integration,22 browser E2E (0 skipped/flaky), mobile API smoke, Expo dependency alignment, OpenAPI/client no drift and audit0HIGH/0CRITICAL (1LOW/4MODERATE remain tracked). Reports: integration-2026-11-06-taste-driver.json and e2e-2026-11-06-taste-driver-full.json.
- Audited general/layout/app finding parity at1440/768/390 verified against the previous standalone reports. Extra1024/360 coverage and three injected regression failures retained in evidence/taste-driver. Existing hero-void/unused-canvas warnings describe the deliberate bounded login form and are not suppressed. Historical tracked visual snapshots preserved.
- Changes: tooling/taste-review.ts, tooling/e2e-runner.ts, identity/platform E2E, DEVELOPMENT.md and release evidence. Remote exact-commit CI remains NOT_VERIFIED until observed. Remaining business P0 slices and external release gates are incomplete/BLOCKED.


### Exact baseline CI verified (2026-11-06)
- Commit1a86b2b7352fa6e4c5ef5eeb86a0ac0f1250495b pushed to main; GitHub Actions run42168349871 SUCCESS, including42 integration, mobile API smoke,22 browser E2E, audit and generated-contract drift gates. URL:https://github.com/luciusvie2712/Fluivix-Edu/actions/runs/42168349871. P0-A technical baseline verified; native signed-device evidence and overall release remain BLOCKED.
- Next slice: Staff/RBAC. Reconcile spec permission matrix (manager by delegation) with route inventory (role mutations owner only): owner delegates invitation/status administration of non-owner/non-manager memberships; role assignment/removal/catalog remain owner-only. No self elevation; explicit version/reason; tenant row lock and current actor recheck. Invitations are revoked atomically on resend or privilege removal.
- UI decision: retain existing framed-sheet, blue brand, Vietnamese Arial and shared forms. Pro Max broad education query suggested glass/marketing hero; narrower internal-admin query confirmed minimal Swiss style but still a marketing layout. Reject incompatible marketing layout under spec precedence; apply readable tables, explicit labels and the existing single design direction. Reuse reduced-motion-safe opacity/press feedback; no decorative animation. Skill SHAs: Taste6010f91a9935f1c167dfc500fb1a475681892e6b, ProMaxd14efff8ed1faa4187f004f79926f428c8074ec7, animationb6dba3eb759726845a44163ff0bad70dd9e7fbb6.


### Staff/RBAC vertical slice (2026-11-06; local final verification in progress)
- Added real Staff directory/search/status filter/pagination and detail, invitation lifecycle/resend, status restore/suspend/revoke, role grant/revoke, effective-per-role permission visibility and owner catalog. Web routes /app/staff and /app/staff/[id] call generated typed clients; named backend permissions independently enforce access.
- Migration202611060020 adds membership version/delegation, invitation revocation, audit metadata and SQL owner/identity invariants. All staff mutations lock the tenant and recheck active actor, selected live session, subscription and delegated scope inside the transaction. Owner-only role changes/catalog reconcile master route inventory; delegated managers only invite/manage lower staff. Self elevation and owner/manager target changes by managers denied. Last active owner protected in service and SQL.
- Invitations reserve INVITED memberships under quota without access, require existing account password proof, remain single-use/24h and are revoked atomically on resend/status/role changes. Worker suppresses revoked invitation mail. Pending/revoked or globally inactive users have no effective permissions. Global identities and memberships in other tenants are preserved.
- UI uses shared accessible forms, explicit confirmation/reason/version and server commit outcomes; related editors stay disabled until a write and refresh complete. A delayed genuine DELETE response regression proves interleaved edits cannot lose selection. Query keys include identity/tenant/role and AbortSignal; error renders hide stale list data. No production fixtures added.
- Local integration51/51 PASS including real SQL owner guard/concurrent owners, guarded delegation revocation while waiting for a lock, invitation expiry/reuse/resend, cross-tenant/role/READ_ONLY negatives and actual legacy migration preserving existing data/history. Current reports: integration-2026-11-06-staff-final.json, staff-upgrade-full.json. Unit49/mobile15, builds/types/lint/format and mobile smoke/Expo/audit have passed; final repeated static/build/browser gate remains pending.
- Failure evidence retained: initial test package import resolution and checked Prisma fixture relation fixed; pg_stat_activity snapshot replaced by live pg_locks observation. Browser selector matched status+date cell; teacher direct-link test now uses a genuine API-selected context while preserving Mobile-only Web chooser policy. Delayed role response exposed editor overlap; shared mutation lock and held-real-response assertion fixed it. One full browser run24/25 failed only a corrupted Vietnamese selector from Windows script input; corrected without timeout/retry changes. Visual multi-viewport checks split from business workflow (formerly24.6s; new workflow9.9s) rather than increasing timeout.
- Taste source6010f91a9935f1c167dfc500fb1a475681892e6b executed on actual staff views at360/768/1024/1440 and reduced-motion detail, with axe WCAG2/2.1/2.2AA tags and screenshots under evidence/staff. Viewed360/1440 images; preserve existing framed-sheet direction, labels/quiet tables. Added narrow-screen scroll cue and removed duplicate provisional email/name. Final keyboard/browser rerun pending.
- Remote Staff commit/CI NOT_VERIFIED. Overall release BLOCKED; this slice does not complete Guardian/Assessment/Finance/Reports/Privacy or external staging/legal/signed-device/push approvals.


### Membership activation and context hardening (2026-11-06)
- Found and closed a lifecycle bypass before release: a globally ACTIVE account invited to a new tenant could otherwise be suspended then reactivated without accepting that tenant invitation. Membership activation_pending is distinct from global User.status; SQL marks new/legacy INVITED rows, forbids ACTIVE+pending, and only credential-proven invitation acceptance clears the marker. Staff PATCH cannot set that marker. Restore pending membership to INVITED and send a new invitation; direct activation stays409.
- The actual multi-tenant integration case now asserts pending/suspended name redaction and search isolation, status-bypass409, forged activation marker422, SQL constraint rejection, old-token401, explicit restore/re-invite and password-proven acceptance preserving the other tenant/password. Legacy migration also verifies pending backfill and activation constraint. Full51 integration PASS in integration-2026-11-06-staff-activation.json. Previous local full runs remain historical evidence of earlier snapshots.
- Own membership/status/selected-role revocation now uses the existing server logout and clears the whole client session/cache after the committed change. A separate real-browser case bootstraps only synthetic test identity, self-suspends under a second active owner, then checks login redirect, committed status, old access401 and denied stale deep link. Browser verification pending.
- Migration020 remains uncommitted/unreleased; all revised migration tests run against newly created disposable databases. No already-applied user/development migration was changed or rerun.


### Delegated role boundary (2026-11-06)
- Narrowed manager delegation to academic_staff/teacher. Accountant can write payments that manager cannot, so financial memberships are not lower-privilege staff; inviting/controlling accountant, manager or owner remains owner-only. This supersedes the earlier broader lower-staff description. Backend, invite/resend options, editable-target UI and real integration negatives agree. Guardian invitations retain the separate existing guardian.manage workflow; no unrequested financial privilege is granted through staff delegation.
- The51-case suite now explicitly denies delegated-manager accountant invitation/status mutation. Final verification follows this boundary; no API, status or role is authorized solely by hidden buttons.


SQL owner-count isolation contract (2026-11-06): production Staff mutations use PostgreSQL READ COMMITTED and the canonical tenant lock. The owner-removal trigger refuses snapshot-isolated SQL writers rather than count an old owner snapshot. A real REPEATABLE READ negative now asserts fail-closed behavior. No database-wide isolation setting is changed. Full51 integration passed on the final fresh database (integration-2026-11-06-staff-commit-gate.json). All subsequent tests and commit must retain this SQL migration.


Owner availability clarification (2026-11-06): both service and SQL count only owners whose membership AND global account are ACTIVE. A disabled backup identity cannot justify removing the last usable owner. The existing owner invariant case now disables the synthetic backup account, asserts API409 and SQL rejection, restores that fixture, then exercises isolation/concurrent-owner cases. No global account-disable endpoint is added. Final verification uses a fresh database; prior26 browser run passed, and the final source check follows before commit.


### Staff/RBAC local acceptance gate PASS (2026-11-06)
- Final source: lint, typecheck/tooling, format,49 unit,15 mobile Jest,8 build tasks,51 real PostgreSQL/Redis integration,26 browser E2E (0 skipped/flaky), real mobile API smoke, Expo alignment, OpenAPI/client regeneration stability and audit0HIGH/0CRITICAL PASS.1LOW/4MODERATE remain tracked. Local secret screening passed without displaying local values.
- Authoritative reports: integration-2026-11-06-staff-owner-account-final.json; e2e-2026-11-06-staff-verified.json; evidence/staff/verification.json includes normalized source hashes. Earlier failed/intermediate reports are preserved, never relabeled PASS. Historical teaching snapshots restored; final Staff screenshots/Taste/axe/keyboard and self-revocation regression retained.
- Implemented W17 technical Staff/RBAC slice: scoped directory/detail/search/pagination, invitations/resend/expiry, activation proof independent of global account, status/role lifecycle, bounded delegation, permission visibility, audit/version/concurrency and last usable owner protection. Manager may manage academic_staff/teacher only; accountant/admin memberships remain owner-only. Service owner writes use READ COMMITTED; SQL rejects snapshot-isolated removal to prevent stale counts.
- Remote Staff commit/CI NOT_VERIFIED until the exact pushed SHA is observed. Overall release BLOCKED; remaining P0 business modules and external gates remain open. No production deployment or native-device/legal/staging acceptance is inferred.


### Staff exact-commit CI verified (2026-11-06)
- Commitdb88cbb5aa590b4326fd2faf96fcaa3f0c67b860 pushed to main; GitHub Actions run42182941288 SUCCESS, including51 real integration,26 browser E2E, mobile API smoke, audit and generated-contract drift checks. URL:https://github.com/luciusvie2712/Fluivix-Edu/actions/runs/42182941288. Staff/W17 IMPLEMENTED_TECHNICAL_VERIFIED. This does not complete the broader FR-AU requirements or authorize release.
- Actual Staff1440 Taste has one WARN panel-void (44px semantic section spacing), no FAIL; retained without artificial filler or finding waiver. Other exercised Staff viewports/detail have no findings. Axe/keyboard/reduced-motion cases passed.
- Beginning Guardian/W06: reconcile WF02 provision -> pending relationship -> verification -> invitation -> activation. Current API only permits ACTIVE guardian membership at link creation and lacks profile/history Web. Preserve independent consent and activation, strict tenant scope, authoritative link checks and existing native epoch/cache invalidation.


### Guardian/W06 local acceptance gate PASS (2026-11-06)
- Implemented contact provisioning independent of active staff role grants, scoped search/filter/paging/detail, student relationship panel, pending -> verified -> invitation -> activation journey, invitation resend/history, versioned verification/revocation with confirmation/reasons, and append-only same-tenant SQL history. Existing accounts prove their password; names remain redacted while activation is pending. Verification does not record privacy consent.
- Evidence:58 PostgreSQL/Redis integration (including actual migration021 legacy rehearsal, duplicate open pairs, cross-tenant nested FKs, verifier suspension while waiting on lock, and actual native delayed-response/cache revocation);29 browser E2E with0skip/flaky, real worker/Mailpit acceptance and revocation, read-only/empty/missing/forbidden states;49 unit;15 mobile Jest;8 build tasks; lint/typecheck/tools/format; native API smoke; Expo alignment; stable142-operation generated contract; audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked); local secret screen PASS.
- Three vendor SHAs and all five installed skill IDs reverified byte-for-byte against their canonical distributed files. Pro Max confirmation/submit feedback applied; existing framed-sheet seed1920114305 retained; shared accessible focus/press/reduced-motion behavior used. Guardian directory/detail360/768/1024/1440 axe/Taste and keyboard scroll passed, all eight final images inspected. Findings are saved without waiver. No native-device UI claim.
- Source hashes and command/report scope: evidence/guardians/verification.json. Historical failed/intermediate reports remain separate. Broader FR-US/AU and overall P0/M4 remain incomplete; release BLOCKED. Guardian commit/exact-SHA CI remain NOT_VERIFIED until observed.


### Guardian exact-commit CI and Teacher/W07 start (2026-11-06)
- Guardian commit d345764ae407e09df30b8586fdf4162f9e875c29 pushed to main; exact GitHub Actions run42194322533 SUCCESS (58 integration,29 E2E, mobile API smoke, audit, generated-contract drift). Evidence: docs/release/evidence/ci-d345764-success-2026-11-06.json. W06 IMPLEMENTED_TECHNICAL_VERIFIED; overall P0/M4 remains BLOCKED.
- Next vertical slice Teacher/W07 is IN_PROGRESS: scoped eligible teacher-account picker, code/status search, actual account readiness, assigned-class history, live actor checks after tenant lock for create/update/assignment. Existing SQL FKs are represented in Prisma; no applied migration or customer data is changed. New real PostgreSQL cases and Web screens pending verification.


### Teacher/W07 local acceptance gate PASS (2026-11-06)
- Implemented tenant-scoped directory/search/code/status/paging, profile/detail, minimal accepted active teacher-account picker, profile creation, optimistic edit/deactivation with reason and confirmation, assigned-class history and actual class assignment. Status/account readiness remain separate; inactive profile/account cannot receive new assignments/sessions. Existing assignments and history remain intact. Class/schedule selectors honor actual account readiness.
- Canonical tenant lock rechecks current actor membership/selected role/session/subscription for teacher create/update/assignment. Three real suspended-while-waiting negatives commit no changes. Concurrent overlapping assignments now return201/409 instead of201/500; SQL daterange exclusion still rejects direct overlap. Existing composite FKs are represented in Prisma; no new DDL or applied migration change.
- Local evidence:61 real PostgreSQL/Redis integration;32 browser E2E with0skip/flaky (including actual profile create/assignment/deactivate, read-only/empty/missing/forbidden states);49 unit;15 mobile Jest;8 build tasks; lint/typecheck/tools/format; mobile API smoke; Expo alignment; stable144-operation generated contract; audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked); secret screen PASS.
- Teacher directory/detail360/768/1024/1440 axe/Taste/keyboard/reduced-motion exercised and all eight final images viewed. Three skill sources/five IDs reverified; existing framed-sheet seed1920114305 and accessible shared confirmation/form/button feedback retained. Any44px semantic section-spacing WARN is retained with rationale, no waiver. No device/native UI approval is inferred.
- Exact source hashes and reports: evidence/teachers/verification.json. Historical visuals preserved and failed diagnostic report retained. Teacher remote commit/CI NOT_VERIFIED until observed; Assessment/Finance/Reports/Dashboard/Audit/Privacy/Notifications/broader class-schedule/M4 remain. Overall release BLOCKED.


### Teacher exact-commit CI and Assessment/W12 start (2026-11-06)
- Teacher commit4093b08cb185270e7a6b5f00da5a8d4dd84e94cd pushed to main; exact GitHub Actions run42218621304 SUCCESS, including61 integration,32 E2E, mobile API smoke, audit and contract drift checks. Evidence: docs/release/evidence/ci-4093b08-success-2026-11-06.json. Teacher/W07 IMPLEMENTED_TECHNICAL_VERIFIED, broader P0/M4 BLOCKED.
- Assessment/W12 IN_PROGRESS: forward migration022 adds same-tenant creator/grader/history actor constraints, unique student/version history and nullable new actor snapshots without inventing legacy names. API adds scoped grade/lifecycle history and published-only student-detail grades; actor/session/role/feature rechecked after lock. Shared exact score validator moved to contracts for Web/Mobile; only a workspace link was added, no external dependency changed. Seed-only scoped sessions preserve credentials and production actor checks, and are revoked in finally. Typecheck/lint pass; new integration/Web/legacy migration verification remains pending.


### Assessment/W12 local acceptance gate PASS (2026-11-06)
- Added operational /app/assessments list/create and per-assessment roster editor, class-detail panel and published-only student-detail results. Exact zero/maximum/comma decimal, partial changed-row drafts, missing-score reason, range validation, explicit confirmed publication and privileged reasoned correction/republication use real API and generated types. Optimistic conflicts retain unsaved input until confirmed reload; real commit outcomes receive focus.
- Added paged before/after grade and publication/correction history, actual actor name snapshots/trace IDs and honest legacy unknown names. Effective-date teacher assignment scopes reads/list metadata. Every create/save/publish/correction rechecks live actor/session/role/subscription after tenant lock. Forward migration022 enforces same-tenant creator/grader/history actor and unique student/version; legacy rehearsal preserves old timestamps/JSON and rejects orphan/duplicate rows without fabricated data. Applied001..021 unchanged.
- Local commands PASS: lint, typecheck/tools, format,49 unit,15 mobile Jest,8 build tasks and final Web rebuild,66 PostgreSQL/Redis integration,36 browser E2E with0skip/flaky, actual mobile API smoke, Expo alignment, frozen offline install, stable147-operation generated contract, audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked), local secret screen without printing values. Reports and normalized source hashes: evidence/assessments/verification.json.
- Three skill sources/five IDs byte-verified; existing framed-sheet direction retained. Pro Max inline/error focus recommendations and shared accessible reduced-motion-safe form/button behavior applied; real360/768/1024/1440 axe/Taste and keyboard editor checks pass, eight viewport images viewed. Historical earlier-module screenshots archived then restored to their original commits; failed diagnostic report remains separate.
- Initial concurrency browser fixture reused rotating refresh cookies, invalidating an older tab. Two independent actual sessions now verify stale409/input preservation without weakening auth; multi-tab restoration remains a separate auth-hardening limitation. A new submitDisabled control preserves editable pristine grade fields while disabling only the save button; full regression verifies shared forms.
- Assessment remote commit/exact-SHA CI NOT_VERIFIED until observed. Finance/report/dashboard/audit/privacy/notifications and remaining P0/M4 gates remain open. Release BLOCKED; no staging/legal/signed-device/push/store approval or production readiness inferred.


### Fee plans/W13 local acceptance gate PASS (2026-11-06)
- Operational fee-plan directory/detail with scoped search/status/class/paging, real minimal class options, zero/monthly/course creation, exact integer VND and reasoned confirmed future terms/history. Owner/accountant finance.fee.write follows the master configuration policy; manager invoice permissions remain separate. Closed classes are available for historical filters but cannot receive new fee plans.
- Forward023 retains existing used-fee/issued invoice immutability and stable fee-plan/period run uniqueness. Append-only actor/time/reason/version terms apply only to applicable new runs; same-date higher version wins. Monthly changes start on future month boundaries; course terms apply from the future course start before issue. Legacy rehearsal preserves original >2^53 amount and creates no fictional edit history. All six financial writes recheck live actor/session/role/subscription after tenant lock; waiting-revocation negatives commit no changes.
- Final Node24.22.2/libuv1.52.1 checks PASS:8 uncached build and8 uncached typecheck tasks plus tools tsc, lint/format,49 unit,15 mobile Jest,71 PostgreSQL/Redis integration,40 browser E2E with0skip/flaky, actual mobile API smoke, Expo alignment, stable152-operation generated contract, frozen offline install, audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked), secret screening with values withheld. Reports/source hashes: evidence/fee-plans/verification.json. Applied001..022 untouched.
- Node24.15.0 workers silently exited3221226505 in full integration/browser runs. Matching upstream nodejs/node#63620 confirms a Windows TCP/libuv fix from24.16; no local dump attribution claimed. Official latest24 LTS24.22.2 ZIP checksum verified, used through process-only.cache tools; global runtime/PATH unchanged. Root.node-version/engines and CI pin the same patch. Failed30-test/39-browser reports remain FAIL regardless of a partial Vitest JSON success field. A subsequent70/71 run under simultaneous builds/Metro/Jest hit an existing Staff lock-poll deadline; unchanged isolated case and final serial full suite pass. No assertion/timeout/retry relaxation.
- Three skill sources/five IDs verified; Pro Max confirmation/outcome guidance, existing framed-sheet direction and shared reduced-motion-safe focus/press feedback applied. Real360/768/1024/1440 axe/Taste/keyboard checks pass and eight final images viewed. Any43px section gap WARN is retained with rationale, no waiver. Earlier-module regression screenshots archived then restored to historical commit evidence.
- Fee-plan remote commit/exact-SHA CI NOT_VERIFIED until observed. W14/W15 invoice preview/list/detail/payment/receivables/print receipts and dashboard/reports/audit/privacy/notifications remain executable work. Overall release BLOCKED; no external staging/legal/signed-device/push/store approval inferred.


### Invoice/W14 local acceptance gate PASS (2026-11-06)
- Operational invoice list/search/status/fee-class/period/due-date filters and detail, immutable item snapshots and paged actual publication/void history. SQL derives exact balances/status from confirmed allocations under a repeatable snapshot; Vietnam inclusive day boundaries, full tenant scope and Guardian verified-child/redacted internal reason retained. Archived fee plans remain available to historical filters, not new issuance.
- Paged preview and issue share fee-validity/period/enrollment intersection without prorating. Preview creates no billing/audit/outbox/idempotency rows; only its operation counter changes. Web confirms an exact server fingerprint; changed terms/roster409 requires re-preview/reconfirmation. Existing clients may omit fingerprint while retaining guarded eligibility, versioned fees and stable fee/period business key. Same-request retry after a genuinely committed201 lost at transport reuses the same key and creates no duplicate. Uncertain outcome locks input/re-preview until retry resolves it. Thirty fresh operations per actor/tenant/15minutes, committed replay before generation counter; no separate async-job acceptance claim.
- Confirmed issue and meaningful-reason void show actual server outcomes and focus. Existing active-payment guard, immutable prices/items and no-hard-delete remain. Forward024 adds same-tenant invoice/run/reversal actor FKs, trimmed reasons and counter scope; actual legacy rehearsal preserves original >2^53 values/time and rejects orphan/blank records without fabricating data. Applied001..023 unchanged. New audit names are snapshots, legacy names remain unknown.
- Local matrix PASS on Node24.22.2:74 PostgreSQL/Redis integration,44 browser E2E with0skip/flaky,49 unit,15 mobile Jest,8 build tasks and final Web rebuild, lint/typecheck/tools/format, actual mobile API smoke, Expo alignment, stable156-operation contract, frozen offline install, audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked), secret screen with values withheld. Reports/source hashes: evidence/invoices/verification.json. Initial diagnostic failures retained separately, no timeout/retry/assertion relaxation.
- Three skill sources/five IDs verified; existing framed-sheet design and accessible reduced-motion-safe form feedback applied. Four viewport axe/Taste, keyboard/focus and eight final images inspected. Any43px section gap WARN retained without waiver. Earlier-module visual output archived and original commit evidence restored.
- Invoice remote commit/exact-SHA CI NOT_VERIFIED until observed. Payment/Receivables/print receipts, dashboard/reports/audit/privacy/notifications, broader class/schedule/auth and external M4 staging/legal/device/push/store evidence remain. Overall release BLOCKED.


### Invoice CI navigation repair local PASS (2026-11-06)
- CI42238649247 at416378f passed43/44 browser cases; its artifact proves the visual scenario captured the directory URL before the client-side detail route completed. Added an assertion of the actual detail URL before capturing it; no timeout/retry/assertion relaxation and no production source change. Failure evidence retained in evidence/ci-416378f-failure-2026-11-06.json.
- Fresh full verification PASS:44 E2E (0skip/flaky),74 PostgreSQL/Redis integration,49 unit,15 mobile Jest,8 uncached builds,8 uncached typecheck tasks plus tools, lint/format, actual mobile API smoke, Expo alignment, stable156-operation generated contract, frozen offline install and0HIGH/0CRITICAL audit. Source hash and reports in evidence/invoices/ci-repair-verification.json. Initial local setup/command diagnostics are recorded there.
- Repair commit/exact-SHA remote CI NOT_VERIFIED until observed. Payment/W15 work is preserved separately. All unfinished P0 and external M4 gates remain; release BLOCKED.


### Payment/W15 local acceptance gate PASS (2026-11-06)
- Operational cash/bank entry, paused-student capable real picker, exact VND/time/reference and multi-invoice same-student installments, separately tracked unallocated credit, confirmation and actual committed outcomes. Invalid allocation displays an unknown total rather than a false zero. Ambiguous payment response locks input and reuses the same key/body; a truly committed201 lost on the network creates one receipt. An uncertain reversal resolves by a fresh status read, without a second POST.
- Real paged receipt list/filter/detail/current balances/audit history, immutable original allocations and reasoned full reversal. Recorded receiver names remain historical audit snapshots; missing legacy names stay unknown. Current centre/student names are labeled. Verified Guardian views redact internal references/receiver/reversal fields and cannot open staff history; actual manager read-only and teaching-role denial are tested. Forward025 adds only the list index; applied001..024 and financial invariants stay intact.
- Full local matrix PASS:76 PostgreSQL/Redis integration,49 browser E2E with0skip/flaky,49 unit,15 mobile Jest,8 uncached builds plus final Web rebuild, strict types/tools/lint/format, actual mobile API smoke, Expo alignment, stable157-operation contract, frozen offline install and0HIGH/0CRITICAL audit (1LOW/4MODERATE tracked). Source hashes and final reports: evidence/payments/verification.json. Earlier full browser output is retained as superseded because its bundle preceded the final feedback edit; clean rebuild/full rerun supplies acceptance evidence.
- All three skill sources/five IDs verified/applied. Four viewport axe/Taste/keyboard/reduced motion, eight final screen images and internal794x1123 print image inspected. Print uses actual confirmed receipt data and hides navigation/mutations; no VAT, bank, physical printer, device or legal approval claim. Previous-module regression visuals archived locally and original commit evidence restored.
- Payment commit/exact-SHA CI remains NOT_VERIFIED until observed. Invoice43e68bd exact CI42241955407 SUCCESS proof is recorded. Receivables, remaining reports/dashboard/audit/privacy/notifications/business/M4 work and external release gates remain; overall release BLOCKED.


### Receivables bounded local acceptance gate PASS (2026-11-06)
- Operational owner/accountant finance.report.read report with real class/search/due-day/overdue filters, exact totals/positive-debt rows and actual invoice navigation. One repeatable snapshot/asOf and shared parameterized valued-invoice scope prevent summary/list drift. Aggregate numeric strings exceed bigint safely; individual amounts/immutable history remain constrained. Zero/paid invoices contribute to matching issued totals, VOID/reversed allocations are excluded, and unallocated receipts are not silently netted.
- Explicit current-state/denominator labels, readonly/empty/forbidden/error/retry and out-of-range page recovery. Actual browser reversal and void update the report; invoice/payment mutations invalidate report cache. Calendar extremes/unsafe offsets return422; first bad subscribed-plan fixture was corrected using independent immutable plans/tenants and real sessions, without relaxing any constraint/assertion.
- Full local matrix PASS:79 PostgreSQL/Redis integration,54 browser with0skip/flaky,49 unit,15 mobile Jest,8 uncached builds plus final Web rebuild, strict types/tools/lint/format, actual mobile API smoke, Expo alignment, stable158-operation contract, frozen offline install and0HIGH/0CRITICAL audit (1LOW/4MODERATE tracked). Source hashes/reports: evidence/receivables/verification.json. Applied001..025/schema unchanged. All three skill sources/five IDs applied/verified, four viewport overview/overdue axe/Taste, keyboard/reduced motion and all8 final images inspected. Previous-module regression visuals archived locally and original commit evidence restored.
- Payment08b18f1 exact CI42247248730 SUCCESS (all30 steps) recorded. Receivables commit/exact-SHA CI remains NOT_VERIFIED. This gate covers explicit Vietnam financial calendar semantics; arbitrary configured IANA tenant-zone alignment is next, before full P0 acceptance. W16 dashboard/attendance/revenue and audit/privacy/notifications/business/M4 gaps remain. Overall release BLOCKED; no external approval or device claim.


### Financial tenant IANA timezone local acceptance PASS (2026-11-07)
- All financial date reads use actual scoped tenant zone within repeatable snapshots. GET metadata and Web centre clock/UTC offset agree; original POST/idempotency responses and UTC ledger values preserved. Due dates use actual last instant; skipped payment clocks rejected before intent, DST fold requires explicit actual occurrence and resets confirmation. Scheduling remains strict.
- Calendar boundary evidence: Vietnam, NY23/25h, Kathmandu fractional offset, Lord Howe half-hour DST, Sao Paulo midnight gap, Apia skipped day and supported/extreme ISO limits. Fee current/future terms use tenant date in API and forward026 SQL guard. Applied001..025 unchanged; upgrade preserves previous fee terms/issued prices, with actor/append-only/monthly/course/interval guards retained.
- Full local gate PASS:81 integration,56 browser0skip/flaky,60 unit,15 mobile Jest, actual mobile API smoke, Expo alignment,8 uncached builds/types and final frozen-source Web rebuild, tools/lint/format, stable158-operation contract, frozen offline install, audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked). Additional final tooling/E2E lint/types pass. Reports/source hashes: evidence/financial-timezone/verification.json. All three skill sources/five IDs applied/verified; four viewport fold/receipt axe/Taste, reduced motion/focus and all8 images manually inspected. Prior regression screenshots archived locally and historical commit artifacts restored.
- Receivables15f4034 exact CI42256020437 SUCCESS (all30 steps), proof committed with this slice. Timezone commit/exact-SHA CI pending; overall release BLOCKED. Dashboard/report/audit/privacy/notifications/operational/M4 work and external staging/legal/UAT/signed-device/real-push gates remain.


### Operational dashboard/report slice IN_PROGRESS (2026-11-07)
- Base mainf96f6f8056c9751dac1f371633c592680be42c1d exact CI42260529296 SUCCESS, all30 steps; proof evidence/ci-f96f6f8-success-2026-11-07.json. Prior Receivables15f4034 exact CI42256020437 SUCCESS.
- Implemented draft seven report REST operations165 total: dashboard, published attendance, effective-date enrollment/class overview, core-finance collections and three named/audited CSV exports. RepeatableRead/asOf, actual tenant calendar, max366 days, safe pagination/export5000, scoped SQL joins, actual headcounts, ended-session denominator, null unavailable/zero-denominator groups. Owner/accountant-only financial metrics, live-role checks for audited READ_ONLY exports. Class financial scope attributes only actual allocations and exposes unallocated money as unavailable for a class; whole-centre receipts remain distinct from current due balances. No historical balance-sheet claim.
- API/client and actual Web dashboard/report modes implemented with date/class filters, real line trend plus exact visible table/day keyboard selector, role/readonly/error/empty states and actual CSV downloads. Existing single framed-sheet/blue/Arial16/seed1920114305 direction retained. ProMax verified chart-domain query recommends time-series line plus visible table; no new external chart dependency or monetary animation.
- Confirmed actual interoperability bug: Intl accepts+07:00 while PostgreSQL reverses raw offset sign. Shared named-IANA policy now used by API/Platform inline field validation; database-supported names checked before tenant creation. Forward027 rejects invalid legacy zones for explicit review, never rewrites settings/history, adds a tenant-zone trigger and bounded report indexes.001..026 unchanged. Only new dependency is Platform -> existing contracts workspace; lock diff3 added lines, no external package download.
- Initial focused integration4PASS/3FAIL retained in integration-2026-11-07-report-focused.json: enrollment CTE used reserved OVERLAPS keyword. Real diagnostic SQL42601 captured in.cache; renamed enrollment_overlap, preserving all assertions/constraints. Second focused7PASS0FAIL in integration-2026-11-07-report-second.json. Calendar series explicitly timestamp without timezone; real query with DB session Pacific/Apia confirms NY calendar labels unaffected by DB's skipped day. Added027 upgrade rehearsal and API/SQL invalid-zone, financial class allocation/reversal, >2^53 money, literal search, feature independence, readonly/export limits/revocation tests.
- Eight uncached build tasks PASS including Web/Platform/mobile bundles; strict8-task types PASS before last shared-IANA addition. New8 focused browser cases and upgrade/full88 integration/full63 browser gate remain pending. Current browser command session5504 runs reports.spec.ts and tenancy.spec.ts after frozen built sources. Do not mark DONE from these draft counts. No .env edits/secret values printed. Overall release BLOCKED; audit/privacy/notifications/operational/M4 and external gates remain.


### Operational dashboard / scoped reports local acceptance PASS (2026-11-07)
- W03/W16 real dashboard, published attendance, effective-date enrollment/class overview and core finance collections:165 operations, generated client, explicit actual tenant dates/class filters, one snapshot/asOf, real trend/exact table and bounded CSV. Current headcounts distinct from period counts. Ended noncancelled completion denominator; future sessions separate; zero denominator null. Draft/reopened/unfinalized rows excluded. Presence denominator explained with excused absence.
- Owner/accountant financial groups only, even with multi-role user; optional analytics and core finance flags independent. Current valid issue/received/due axes and class matched allocations vs centre receipts/unallocated amounts are explicit. Exact BigInt/numeric sums; reversal/readonly/actual CSV outcomes verified. Export5000 cap, formula-neutralized aggregate cells, live actor/session/role checks, actual filter/count/trace audit, no learner notes.
- Confirmed Intl/PostgreSQL offset-sign mismatch fixed by shared named-IANA runtime/Platform validation plus database support and forward027 preflight/trigger. No silent setting/history rewrite;001..026 unchanged. Upgrade rehearsal preserves valid calendars/historical money, rejects invalid legacy values for explicit review. Report indexes additive; EXPLAIN is query-shape evidence only.
- Full local matrix PASS:88 integration,63 browser0skip/flaky,60 unit,15 mobile Jest, actual mobile API smoke, Expo alignment,8 uncached builds/types/tools, lint/format, stable165 contract, frozen offline install, audit0HIGH/0CRITICAL (1LOW/4MODERATE tracked), frozen source/.env and changed-file secret screen.16 final browser images across four modes/four widths manually reviewed; axe/Taste/keyboard/reduced motion and long-label/large-money cases pass. All three skill sources/five IDs applied/verified; existing framed-sheet direction retained with compact metric grouping and accessible line/exact table.
- Failure reports retained: reserved OVERLAPS CTE corrected; last-owner fixture fixed with an independent owner; worker fault now uses a real isolated PostgreSQL connection failure rather than prohibited invalid tenant data. All original security assertions/constraints retained. Final evidence/source hashes: evidence/reports/verification.json. Timezonef96f6f8 exact CI42260529296 SUCCESS(all30 steps). Reporting commit/exact CI pending. Tenant audit/privacy/notification/operational/auth/M4 work and external staging/legal/UAT/signed-device/real-push gates remain; release BLOCKED.


### Reporting CI navigation repair — local PASS (2026-11-07)
- Commit acb5aa8 CI42273235663:62 browser PASS/1FAIL. Old and new pages share due-date controls; an unawaited receivables transition left both list and issuance-status invoice links visible. Actual CI error retained in evidence/ci-acb5aa8-failure-2026-11-07.json.
- Test now awaits the actual receivables URL and debt-list heading before filtering. Both invoice-number assertions target the actual record list. Exact identity/date/SQL expectations retained; no assertion removed, first(), sleeps, retry increase or production changes.
- Frozen-source complete local gate PASS:88 integration/63 browser0skip/flaky,60unit/15mobile,actual API mobile smoke,Expo alignment,8 uncached builds/types/tools,lint/format,Prisma,stable165 contract,frozen install,audit0HIGH/CRITICAL. Prior migration bytes and.env unchanged. Evidence:report-ci-repair-verification.json; exact repair SHA/CI pending. Tenant audit work saved separately and remains IN_PROGRESS/UNVERIFIED; release BLOCKED.


### W19 tenant audit — local acceptance PASS (2026-11-07)
- Real GET/audit-logs and /export, generated167-operation contract and /app/audit: exact actor/action/resource/trace and tenant calendar date filters, stable server pages and actual CSV. One repeatable snapshot/asOf, inclusive<=366-day range; actual NewYork25-hour-day boundaries tested. Tenant/global isolation and all7 roles covered.
- Owner all events; manager explicit operations only (no finance/grades/staff/security), accountant explicit finance only; unknown events fail closed for restricted roles, current selected role not union. Named audit.read/export; owner/accountant export, manager denied. Core audit independent optional reports/finance flags. Decision follows master default limited/finance scopes.
- Deliberate allowlist never fetches metadata/reasons/before-after payload: no tokens/scores/private notes/PII leaks. Recorded actor UUID/null, action/resource/trace/time only; UI clearly explains full masking. Existing historical payload and append-only protections unchanged, no new migration/schema edit.
- Actual CSV <=5000/formula-safe; verifies current actor/session/member/role and mode under share lock, permits readonly audited GET, records actor/date/identifier filter/count/trace. Real Web downloaded-file and audit checks, same-person role narrowing, network retry/invalid/empty states and live revocation clearing.
- Final frozen-source local matrix PASS:93 integration/67 browser0skip/flaky,60unit/15mobileJest,actual mobile API smoke/Expo alignment,8 uncached builds/types/tools,lint/format,Prisma,stable167 contract,frozen install,audit0HIGH/CRITICAL.4 final responsive images manually viewed, axe/Taste/keyboard/reduced motion pass. Three skill sources/five IDs verified and applied; same framed-sheet direction. .env unchanged/secret screen PASS. Failed setup report retained; strict fixture calendar fields corrected, no production guards/assertions weakened.
- Evidence:evidence/tenant-audit/verification.json. Audit commit/exact CI pending; remaining notifications/privacy/operational/auth/M4 and external gates BLOCKED.


### Web session coordination — local acceptance PASS (2026-11-07)
- Real multi-tab logout bug reproduced before implementation. New validation-only GET/auth/web-session binds current HttpOnly cookie to bearer SID/user/WEB transport/exact context, without rotating or issuing credentials. Foreign-family candidates, removed roles, suspended tenant, expired JWT and MOBILE cookie transport rejected. Existing activation-required SQL invariant positively verified; no schema/migration changes.
- Same-origin Web Locks coordinate full refresh/verification/login/context/logout; BroadcastChannel candidates remain ephemeral and cookie-verified. Same-scope drafts/cache retained; changed identity/context cancels/clears cache, discards delayed old-scope bytes and replaces old deep links. Monotonic four-minute renewal tolerates client wall-clock changes. Native SecureStore/platform audience/MFA and real reuse family revocation unchanged.
- Safe GET at most one same-scope retry; financial/mutation requests never auto-replayed. Actual paymentPOST401 creates no receipt until explicit user retry; truly lost committed context response verified without repeatingPOST. Accessible network retry/loading and honest logout-error handling.
- Final frozen-source matrix PASS:98 integration/75 browser0skip/flaky,60unit/15mobileJest,actual mobileAPI smoke,Expo alignment,8 uncached builds/types/tools,lint/format,Prisma,stable168-operation contract,frozen offlineinstall,audit0HIGH/CRITICAL. Four revised responsive screenshots manually reviewed; axe/Taste/keyboard/reduced motion pass. Three source repos/five skill IDs verified/applied; same design direction. .env unchanged, secret values withheld.
- Retained fixture failures: required financial allocation missing, then deferred invoice/item invariant rejected separate transactions. Corrected synthetic fixture with atomic real invoice/item creation and valid allocation; guards/assertions retained. Evidence:evidence/web-session/verification.json. Exact Auth commit CI pending; release BLOCKED, remaining P0/M4 work continues.


### Auth CI cross-tenant navigation repair — local PASS (2026-11-07)
- Auth commit28d673f CI42293230154:74browserPASS/1FAIL; all earlier CI gates passed. Actual artifact showed the student test still in centreA after it interrupted asynchronous centreB selection with immediate page.goto. This did not demonstrate cross-tenant access under a centreB session.
- Await actual contextPOST200, student-list URL and centreB topbar before old-centre detail navigation. Original404 and private-field absence assertions retained. No retries/timeouts/assertion/guard waiver; production source unchanged.
- Complete frozen-source local gate PASS:98 integration/75browser0skip/flaky,60unit/15mobileJest,actual mobileAPI smoke,Expo alignment,8uncachedbuilds/types/tools,lint/format,Prisma,stable168contract,frozen offlineinstall,audit0HIGH/CRITICAL. .env and applied001..027 unchanged. Evidence:evidence/auth-navigation-verification.json; exact repair commit/SHA CI pending. Remaining P0/M4 work continues; overall release BLOCKED.


### Notifications N1 — local PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Notifications N1 passes the complete local frozen-source gate:109 integration,78 browser0skip/flaky,60unit/20mobile,8uncached builds/types, real mobile API smoke, stable168-operation contract, offline frozen install,0HIGH/CRITICAL audit and verified skills. Current-resource inbox/legacy sibling scope, multi-role event/device dedupe, actual device generations, bounded retries/receipts/Redis recovery, committed finance during provider failure and Web/Mobile controls are verified. N1 commit/exact-SHA CI pending. Auth4bccaa7 exact CI42296909065 is successful. Fee reminders under approved policy, Privacy/remaining operations/M4 and external staging/legal/UAT/signed-device/real-push remain; release BLOCKED.

Evidence: `docs/release/evidence/notifications/verification.json`; full integration/browser reports and eight responsive normal/reduced-motion images in the same evidence family. Actual failures retained with root causes/repairs; no assertions weakened. Additive028 retains9 legacy rows/3 duplicate groups in migration regression, unknown generation staysNULL, foreign legacy event binding fails23503, new cross-audience unique index23505 and immutable/retry guards23514. New inbox materialization requires current configured purpose/version consent; retained history still requires current role/resource authorization. Generic push has opaque notification ID only. Provider facts/application safety choice: `notifications/provider-policy.json`. Physical push/legal approval not claimed.


### Privacy workflow — IN_PROGRESS (2026-11-07)
- Notifications main9a80fa265898c34f16782bef5956df81545bcde8 exact CI42309663652 SUCCESS all30 steps; proof evidence/ci-9a80fa2-success-2026-11-07.json.
- New additive029 and actual API implement live scoped consent locking, immutable evidence/history, versioned requester tracking and owner-only review; actual encrypted temporary exports, narrow student correction, notification consent withdrawal, conservative configured profile redaction and worker expiry purge.001..028 unchanged. No legal approval or global-identity deletion claim.
- Focused third report8PASS/0FAIL (7actual API/PG cases+legacy migration regression); crypto6PASS. Fourth report9PASS/1FAIL: exact result field order assertion expected input order but canonical profile helper returns another stable order; retained failure, fix compares exact sorted field set. Added own-student and actual session/membership/tenant revocation tests passed.
- Web requester/owner forms and Native tracking/private cache file sharing are implemented drafts, generated contract updated. SDK58 expo-file-system/sharing installed via vendor expo install; no inbound sharing extension. Native Jest initial dynamic-import VM limitation repaired with normal supported Expo imports; mock class instanceof harness failure under investigation, not acceptance. Web full real browser/4width axe/Taste and full frozen gates pending.
- Same single framed-sheet/blue/Arial16 direction; all3 sources/5skill IDs verified. ProMax confirmation-dialog/message rules applied, existing reduced-motion/focus controls retained. .env not modified. Module uncommitted, overall release BLOCKED; remaining executable P0/M4 work continues.


### Privacy workflow local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Privacy now passes the complete frozen-source local gate:119 integration,82 browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools, actual mobileAPI smoke, SDK alignment, stable179-operation contract, offline frozen install and0HIGH/CRITICAL audit. Versioned self tracking and owner-only review execute real encrypted temporary exports, narrow tenant profile corrections, notification consent withdrawal and conservatively configured profile redaction; current session/role/relationship authorization and legacy history are retained. All eight final responsive normal/reduced images inspected. Notifications main9a80fa2 exactCI42309663652 SUCCESS(all30 steps). Privacy commit/exact-SHA CI pending. Fee reminders/remaining operational/M4 work and actual staging/legal/UAT/signed-device/real-push gates remain; overall release BLOCKED.

- Additive029 preserves original001..028 bytes, consent/request identities/status/times and unknown reviewer/method fields. Migration-time LEGACY_OBSERVED events have actual observation time and actorNULL. RECEIVED legacy scope can be confirmed now; unknown-scope legacy VERIFIED/APPROVED requests require reasoned rejection and a new verified request, never fabricated past review. Actual legacy upgrade/FK/transition/append-only tests pass.
- Canonical tenant/actor/session locks precede subject authorization, closing the reproduced consent-after-revocation race. Named privacy.manage is owner-only; existing seven privacy.self roles retain only their own tracking. Current requester role/member/verified relation is rechecked before verification, approval, actual fulfillment and download. Safe owned tracking metadata remains after relation removal; child content does not.
- ACCESS/EXPORT use allowlisted one-statement snapshots, exact financial strings and published own education data. Real draft/other-student scores stay excluded. Dedicated key/AAD tenant/request/key-bound AES256GCM, verified digest/size,2MiB limit, expiry default30min/max24h, authenticated no-store downloads and actual bounded worker expiry purge. API410/purge preserves immutable digest/history metadata. No public URLs or client persistent data cache.
- CORRECT applies only validated local fullName/dateOfBirth/contactEmail/contactPhone with explicit student and request versions, null clearing and meaningful reason; no-op/conflict/invalid date/private field edits rejected. WITHDRAW revokes only supported NOTIFICATIONS grants without changing original boolean/capture history. ERASE stays defaultblocked; scoped approved policy, INACTIVE/no active-upcoming enrollment and explicit retained-record confirmation are required. Actual redaction of five current profile fields, child consent revocation and temporary export content removal retain finance/audit/global identity/attendance/published grades. No global deletion or legal-anonymization claim. Account-only correction/erasure remains explicitly unfulfilled pending the approved identity-custodian process.
- Web real requester/owner transitions, server-confirmed outcomes, nullable corrections, blocked erasure, stale/error/READ_ONLY states and authenticated actual JSON download pass. Native scoped tracking/history, old-alert/delayed-response isolation and app-private file checksum/share/finally+startup cleanup pass; all30 native tests run with original timeouts. OS sharing completion does not prove recipient delivery; signed physical file-sharing/push/legal/staging remain BLOCKED.
- Retained failures: canonical correction field list order (fixed exact sorted-set assertion); initial browser implicit-select locator and consumed bootstrap WEB token (accessible combobox and independent current MOBILE policy probe); initial dynamic-import Jest VM limitation (normal supported Expo imports); mock Symbol.hasInstance rejected its own constructor (prototype-aware test double); async RN render was initially unawaited (await real renderer). Slow sandbox first-render run29/30 retained privately, normal native runtime then30/30 with no warmup, timeout or old assertion changes. Cached Turbopack PostCSS child initialization failed twice; only generated .next archived, clean standard build and final uncached pipeline pass. Full preflight formatter-only failure repaired; full strict native callback type failure repaired with a callable wrapper, no suppression.
- Skill source SHAs/five IDs and actual browser evidence: evidence/privacy/design-direction.json. Expo file APIs based on official SDK58 installed declarations and https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/ and https://docs.expo.dev/versions/latest/sdk/sharing/. expo-file-system~58.0.13/expo-sharing~58.0.22 installed with vendor expo install; no inbound share extension. .env unchanged; secret values and private hash withheld.


### Automatic fee reminder policy — PROPOSED, not operational approval (2026-11-07)
User confirmed an automatic schedule is desired, then asked for a suitable recommendation rather than supplying the previous schedule. Proposed09:00 in the actual centre timezone at due-date offsets-3,+1,+7, at most3reminders/invoice, group same-child reminders in a day, then accountant follow-up. Only outstanding issued invoices; stop paid/void/paused/revoked relation/no valid notification consent or preference, with accountant reconciliation hold. These numeric choices are our proposal, not a claim of existing centre approval. Record a reviewed policy version before enabling real operation. Due-relative reminders and withholding while payment is processing are supported by the primary reference https://docs.stripe.com/invoicing/automatic-collection; no Stripe integration, autocharge or late fee is included. Other operational/M4 work continues independently.


### Operations follow-up — IN_PROGRESS, baseline reproduced (2026-11-07)
Privacy e85260b44941a8ecac3c8212e79e467dab4b9558 has been pushed to main after the complete119integration/82browser/66unit/30mobile frozen local gate. Exact CI42330434479 is running,21steps already successful, E2E pending; not yet marked remotePASS. New isolated actual API/PG diagnostic reproduces missing owner GET/tenant/settings and GET/tenant/usage404 and a queued manager roomPOST201 committing after actual owner staff suspension200; fresh request correctly403. It observes two transactions through the actual transitive PG blocking graph before releasing the controlled tenant lock. No cross-tenant access claim. Evidence: evidence/operations-baseline-diagnostic.json. Room/create post-lock actor recheck is the first next fix. Other TeachingService lockTenant call sites are review candidates, not yet separately reproduced. Two earlier diagnostic attempts used an incomplete direct-only blocker count; failed private traces retained, source checks were not disabled. Global release remainsBLOCKED; no operations source accepted yet.


### Teaching post-lock authorization — IN_PROGRESS (2026-11-07)
Privacy e85260b exact CI42330434479 SUCCESS(all30steps), proof evidence/ci-e85260b-success-2026-11-07.json. Next bounded security slice changes only TeachingService actor locking and actual integration tests; no migration/DTO/client/UI change. Four new regression cases initially failed: room/class/finalization actually committed201 after suspension; schedule fixture correctly409 due its conflicting slot. The fixture now uses a separate still-authorized scheduled teacher and a nonconflicting slot; original403/no-business-write/positive-owner assertions retained. Canonical post-lock tenant/selected session/active membership/user/held role/named-permission checks now cover interactive teaching writes; attendance/privileged reopen permissions remain distinct. Identity-free trusted rolling jobs retain actorNULL/subscription checks. Focused5PASS includes all4race cases and realRedis rolling generation. API/worker builds and stricttoolsPASS. Full123integration/82browser/66unit/30mobile and uncached all-app gate pending; no new module acceptance or commit.001..029 immutable.


### Teaching browser recovery — IN_PROGRESS (2026-11-07)

- First full frozen gate:123 integration/66unit/30mobile, all8 uncached builds/types/tools, actual mobileAPI smoke, SDK,179-operation regeneration, offline install, audit0HIGH/CRITICAL and skill/AI-pack checks passed. Browser report retains81PASS/1FAIL, not PASS: the old single teaching case exceeded its unchanged30-second aggregate while already checking locked attendance at the third width.
- Actual private Playwright trace shows the original business assertions, recurring-rule revision and all four rule visual reviews had completed; the second four-width surface review consumed the remaining aggregate budget. Split into two independently selectable browser cases, each executing every original business assertion against its own synthetic centre, then retaining all four original axe/Taste/screenshot assertions for its surface. No old assertion, timeout, retry, guard or a11y check removed. Source now includes tests/e2e/teaching.spec.ts; strict tools check passes.
- Attempted pnpm filtered invocation forwarded the separator and selected the entire83-case suite; count/report are treated as the actual full suite, never as three focused passes. Source frozen for that full rerun. After successful completion, all remaining build/backend/native/security checks run sequentially on identical source, validating the browser source snapshot again; no heavy concurrent suites. Current result NOT_VERIFIED until both finish.
- Next W18 settings/quota source and tests are only private drafts in.cache/w18-prepared, not implemented or accepted; no application/schema/client changes from those drafts are present in this security slice. Do not apply them before its verified modular commit and push.


### Teaching browser recovery third gate — IN_PROGRESS (2026-11-07)

- Correct direct command `pnpm exec tsx tooling/e2e-runner.ts teaching.spec.ts fee-plans.spec.ts` completed8/8 actual cases,0skip/flaky, unchanged30-second defaults. Split fee directory17.6s/detail14.2s; split complete teaching journey+rule reviews25.0s/complete journey+locked-session reviews26.3s. All original business, four-width axe/Taste/screenshot and detail reduced-motion keyboard assertions retained.
- Earlier attempted pnpm filtering selected all83 and was stopped after31 observed passes and a fee-plan aggregate timeout, not accepted. Diagnostic explicitly ABORTED/NOT_VERIFIED. Its error context was read, but raw screenshot/trace were lost when the next Playwright run cleaned test-results before archival; no retention/hash claim is made. The first full81PASS/1teaching-timeout report and teaching trace remain actually retained separately.
- Current complete third gate uses fresh owned fluivixedu_teaching_actor_third_full_test, all8 uncached builds/types/tools,123integration,84browser,66unit/30mobile, actual mobileAPI smoke/SDK,179contract,offlineinstall/audit/AIpack/skills/env. Source FROZEN again. PASS/commit/exact-SHA CI still pending; overall release BLOCKED. W18 cache drafts are not applied.


### Teaching post-lock actor local acceptance — PASS; remote NOT_VERIFIED; release BLOCKED (2026-11-07)

Teaching post-lock authorization now passes the complete frozen-source local gate:123 integration,84 browser0skip/flaky,66unit/30mobile,8uncached builds/types/tools, real mobileAPI smoke,SDK alignment, stable179-operation contract,offline frozen install and0HIGH/CRITICAL dependency audit. Actual queued room/class creation and attendance finalization can no longer commit after owner suspension; API schedule generation also rechecks the interactive actor. Trusted system rolling jobs retain actorNULL and real subscription checks. Privacy e85260b exactCI42330434479 SUCCESS all30steps. This security commit/exact-SHA CI is pending. W05/W18, proposed automatic fee reminders, local ops/M4 and actual staging/legal/UAT/signed-device/real-push gates remain; overall release BLOCKED.

- Reproduced before repair with actual PostgreSQL, native sessions and owner PATCH/staff suspension: guard-authorized writes wait behind the real revocation in a controlled transitive PG lock queue. Room/class/finalization returned201 after SUSPENDED, violating the post-lock actor invariant. The baseline regression report retains those three actual failures; the fourth schedule fixture correctly returned409 for its conflicting slot, not an authorization reproduction.
- Schedule fixture now uses a separate still-authorized scheduled teacher and a nonconflicting10:00..11:00 slot, so the same valid command can still succeed for the current owner. No conflict guard, production check or403 assertion was removed. Focused5PASS: four actual queued-write rejections with exact unchanged business rows/outbox/actor audit, followed by the same owner command201, plus realRedis rolling generation/dedup/subscription recheck.
- TeachingService now recognizes an interactive actor only with complete actual SID/user/selected role and calls canonical lockTenantActor after waiting for the tenant lock. Current session, user, ACTIVE nonpending membership, held role, named action and subscription are required. Class/enrollment/session/rule/room commands use teaching.manage; attendance draft/finalization/lesson use attendance.write or attendance.write.assigned; privileged reopen keeps attendance.reopen. Resource/assignment/version/roster/conflict checks remain.
- Only the internal rolling worker supplies an identity-free tenant scope. It retains the tenant/subscription lock and actorNULL audit, without a fabricated user token. Partial identity fields fail closed. No schema, migration, DTO, generated payload, dependency or UI change. Applied001..029 and.env bytes unchanged. Full84browser checks cover existing actual UIs and responsive/a11y/reduced-motion regressions; new renders archived privately and committed historical images restored exactly.
- New operations diagnostic also observes missing owner GET/tenant/settings and GET/tenant/usage404; these are next executable gaps, not a tenant authorization bypass. Two earlier private baseline attempts incorrectly counted only direct PG blockers; actual recursive blocking graph repair observes both API transactions. Current baseline report records actual owner suspension200, queued room201 and correctly denied fresh403 without changing production source.
- Browser first run retained81PASS/1FAIL: the former combined teaching journey + eight responsive axe/Taste reviews reached the original30-second total while already checking locked attendance. Private Playwright trace confirms business assertions and all four rule reviews completed. Split into two independently selectable cases, each with a fresh synthetic centre, complete original business journey/assertions and four original surface reviews. No timeout, retry, domain guard, axe/Taste or assertion removed. The attempted filtered pnpm command selected the entire83-case suite; it was aborted after another old two-surface fee-plan visual case hit the same unchanged30-second aggregate, with31 observed passes and1 failure before the next incomplete case. Host free RAM959MiB/15556MiB and45%CPU were observed, not asserted as the sole cause. Exact owned CLI tree was verified before stopping; parent disposed its synthetic PostgreSQL. Its diagnostic is retained as ABORTED/NOT_VERIFIED, never a pass. Fee-plan surfaces now have independent fresh fixtures and all original four-width axe/Taste/screenshot checks; detail retains the original reduced-motion keyboard assertions. Correct direct tsx filtering runs8 actual focused cases before the entire84-browser/build/backend/native/security gate on newly frozen source. No test-timeout, retry or assertion setting changed.
- Evidence: evidence/teaching-actor/verification.json; actual full and baseline/focused integration reports. All three skill sources/five IDs reverified; no new UI direction or motion introduced. No external approval, physical push/device or production readiness claim.


### ACTIVE: exact484283c CI FAIL; input-preservation fix IN_PROGRESS (2026-11-07)

- CI42336824150/job128295504397 completedFAIL:27success/1failed/2skipped30steps, failed test:e2e83PASS/1FAIL; audit step skipped afterfailure, not remotePASS. New public docs/release/evidence/ci-484283c-failure-2026-11-07.json actualproof uncommitted. Failed assessment history expected8.25 but actual input8.2, PUT requested8.20, server/history faithfully8.20; NOT backend decimal-rounding. Exact protected artifact13560217014 digestsha256:f58f931f346de32015794bb3e2c35c3ccab4505a9668ba545f099eabf38123b8 downloaded.cache/ci-484283c/reports.zip and hashverified. Extracted actual error-context/screenshot/trace under.cache/ci-484283c/assessment-failure. Keep raw traces private(tokens/cookies). Temporary URL expired; do not print/reuse. Screenshot manuallyviewed confirmedpublishedversion7/score8.20/history8.20.
- Actual cause reproduced locally with controlled real callback timing: queue actual main-world requestAnimationFrame callbacks, release during native beforeinput while input selection is being replaced; old success focus truncates8.25→8.2, old genericerror focus truncates10,00→10. Isolated pureHTML browser diagnostic .cache/isolated-grade-input.mjs confirms plain/empty-beforeinput8.25, focus-beforeinput8.2, guardedfocus8.25. No validators or maxlength removed. Initial after-input hypothesis1PASS didnotreproduce because editing already clears outcome; preservedprivately.cache/grade-focus-after-input-hypothesis*. Beforeinputsuccess actualRED e2e-2026-11-07-grade-focus-baseline.json1FAIL and.cache/grade-focus-before-input-red/artifacts; sharedformerrorRED e2e-2026-11-07-grade-error-focus-baseline.json1FAIL and.cache/grade-error-focus-before-input-red/artifacts.
- Current production edits are only3files: newapps/web/lib/focus-after-action.ts, assessment-workspace.tsx, operation-form.tsx. Helper records whether beforeinput/keydown/pointerdown occurs before queuedframe, removes listeners when frame runs, and focuses feedback only if no newinteraction AND focus stilloriginalelement/body. Captures actual origin beforeasyncwork; GradeSheet run/loadLatest + shared OperationForm error call helper. This protects Enter-from-same-input (identity alone insufficient) and new-field focus, preserving idle error feedback/role announcements. No CSS/UIlayout/schema/API/client/dependency/validation/timeouts/retries change.
- Modifiedtests/e2e/assessments.spec.ts: reusable real-frame test timing helpers; originalfullzero/MAX/reopen/correct/publish/historyflowassertionskept, invalidsubmission usesEnter+nativevalue/focusassertions, corrected8.25mustnottruncate. Added2 normal/reduce realAPI entry tests, each4widths360/768/1024/1440 keyboard/overflow/axe/Taste/screenshots+actualDBscore8.25aftercommit. Fullbrowsercountnow86, focusedassessment6. New8images family docs/release/evidence/grade-focus (notcreateduntilsuccessfulrun); mustmanualreviewall8 andrecordhashes. Sameexistingframed-sheet/blue/Arial16/seed1920114305, no redraw/newmotiondep.
- An avoidable stale-build run .cache/currentproof: e2e-2026-11-07-grade-focus-stale-build.json3PASS/1FAIL used oldcompiledWeb because tooling/e2e-server.ts uses nextstart (notdev), actualAPI/worker dist too. Candidate had NOT been rebuilt, so this is not verification ofnewsource. Rawstale-run artifacts.cache/grade-focus-stale-build/artifacts retained. Userinformedexplicitly. ALL futurefocusedtests rebuildchangedappsfirst. No source helper failure orPASS invented fromstale bundle.


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
