# P0 implementation and release hardening

## Latest checkpoint — 2026-11-06

Remote main d345764 has verified successful CI42194322533. Staff/W17 and
Guardian/W06 are technically verified locally and on exact-SHA CI. See
evidence/guardians/verification.json and evidence/ci-d345764-success-2026-11-06.json.
Teacher/W07 is locally verified:61 integration,32 browser,49 unit,15 mobile;
module commit and exact-SHA CI remain pending. See evidence/teachers/verification.json.
Remaining Assessment, Finance, Dashboard/Reports/Audit, Privacy/Notifications and
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
