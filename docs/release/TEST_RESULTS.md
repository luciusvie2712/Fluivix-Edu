# Current-session test results

## Current checkpoint — 2026-11-07

Remote main732de75 has exact successful Audit CI42281736732(all30 steps). Web-session hardening now passes the complete local gate:98 integration/75 browser0skip/flaky,60unit/15mobile and all automated checks, stable168-operation contract. Real cookie-bound validation, coordinated multi-tab refresh/context/logout, old-scope data removal and financialPOST no-replay are verified. Four revised responsive images inspected. Auth commit/exact-SHA CI pending. Notifications/privacy/remaining operational/M4 and external staging/legal/UAT/signed-device/real-push gates remain; release BLOCKED.

## Historical checkpoints and detailed evidence

## Current checkpoint — 2026-11-07

Remote main82cac35 has exact successful CI42276412806(all30 steps) for operational reporting plus navigation synchronization. Tenant audit W19 now passes the full local gate:93 integration/67 browser0skip/flaky,60unit/15mobile and all automated checks, stable167-operation contract. Real role-limited/redacted event history, exact filters/calendar/server pages and audited CSV are verified; four final responsive images inspected. Audit commit/exact-SHA CI pending. Notifications/privacy/remaining operational/auth/M4 and external staging/legal/UAT/signed-device/real-push gates remain; release BLOCKED.

## Historical checkpoints and detailed evidence

Historical reports are separate from this 2026-10-24 continuation.

| Check | Observed result | Evidence / limits |
|---|---|---|
| AI pack validator | PASS | 33 P0 FR, 30 TC, 19/9/21 manifest; inventory only |
| Baseline unit | 24/24 | Before new implementation |
| New unit | 38/38 | `evidence/unit.json`; strict time, capacity, CSV cases |
| PostgreSQL integration | 42/42 | `evidence/integration.json`; includes rule replacement/immutable origin and real rolling Redis jobs/policy/error sanitization |
| Mobile Jest | 15/15, 4 suites | Repeated after shared contract/client changes |
| Mobile real API smoke | PASS | Teacher20, Student publication, Guardian2/finance/revoke, tenant switch; no device UI |
| Lint | exit 0 | Includes new Web workspace and worker code |
| Uncached typecheck | 8 tasks, 0 cache, exit 0 | New API/Web/Mobile/shared contract types; tools tsc also exit0 |
| New Web + tools typecheck | exit 0 | Corrected typed query parameters, strict attendance enum and ref-free field props |
| Full monorepo build | 8 successful, 1 cache hit | Web/Platform optimized builds and Android/iOS Hermes exports; no APK/IPA/deployment |
| First browser regression | 17/18 | New CSV scroll-region keyboard focus failed; fixed in product, assertion retained |
| Second full browser regression | 19/19 | CSV and class/schedule/attendance flow pass; real API/PG/Mailpit/Edge |
| Post-visual-polish browser regression | 3/3 | `evidence/e2e.json`; follow-up guard1/1 in teaching-followup.json |
| First delayed-response regression | 3/4 | `evidence/e2e-stale-first-failure.json`; exposed homework reset during refresh, assertion preserved |
| Current teaching/CSV regression | 4/4 | `evidence/teaching-csv-final-e2e.json`; actual two-session delayed response, nonpersisting preview, rule edits/history and CSV downloads |
| Dependency audit | FAIL: 1 high | `SECURITY_REPORT.md` |
| Native APK/IPA, push device E2E | NOT_VERIFIED | No signed-device execution in this continuation |
| Staging/load/backup/legal/UAT | NOT_VERIFIED | Separate release gates |

Current tested worktree was materialized as scheduling commit `ced5dca` (after
API `3a06a7b` and Web `9c5b816`). Full20-case browser regression and full native
export/type suite will run again after remaining slices; do not equate the current
focused4/4 to all20. All current Web builds, lint and tools typecheck exited0.

The corrected mobile command is `pnpm.cmd --filter @fluivix/mobile test`.
An earlier command with an extra `--` found zero tests and is not evidence.

## Reproduction

```powershell
pnpm.cmd lint
pnpm.cmd exec turbo run typecheck --force
pnpm.cmd exec tsc -p tsconfig.tools.json
pnpm.cmd test
pnpm.cmd --filter @fluivix/mobile test
pnpm.cmd --filter @fluivix/api build
pnpm.cmd --filter @fluivix/worker build
```

For isolated integration on Windows, `TEST_DATABASE_URL` must be an explicitly
disposable local `_test` database or empty so the helper creates a fresh database.
Use the dedicated Redis port (here 6385), not another project's Redis6379.
Browser test origins are configurable with E2E_WEB_PORT/E2E_PLATFORM_PORT/
E2E_API_PORT; build NEXT_PUBLIC_API_URL with the same API origin before testing.
Do not point test runners at production or reset a customer's development DB.


## 2026-11-06 fresh baseline hardening

| Check | Result | Evidence / boundaries |
|---|---|---|
| AI pack | PASS | python scripts/validate_ai_pack.py; inventory only |
| Frozen install / Prisma generate | PASS | pnpm10.34.7 / Prisma6.19.3 |
| Lint / complete typecheck / formatting | PASS | Repeated after Expo patch alignment; tools tsc included |
| Unit |49 passed,0 failed/skipped | Redis defaults/ACL/TLS/db/invalid/offline, actual Expo forge valid/invalid RSA |
| PostgreSQL/Redis/Mailpit integration |42 passed,0 failed/skipped | integration-2026-11-06-isolated.json; dedicated synthetic Docker PostgreSQL55435, Redis6385 |
| Mobile Jest |15 passed,0 failed/skipped |4 suites after official Expo/RN patches |
| Mobile API |PASS | Actual Teacher20/finalize/report, Student publication, Guardian2/partial finance/revocation/context switch; no device UI |
| Complete build |PASS |8 tasks,5 cached; Next optimized outputs, Expo Android/iOS/Web exports; not signed apps |
| OpenAPI/client |PASS / no drift | Regenerated both; git diff --exit-code for generated artifacts exit0 |
| Expo compatibility |PASS | expo install --check: Dependencies are up to date |
| Dependency audit |PASS at high threshold |0HIGH/0CRITICAL;1LOW/4MODERATE remain; dependency-audit-2026-11-06-final.json |
| First E2E |19/20 | e2e-2026-11-06.json; real shared-IP rate-limit exhaustion, production limit unchanged |
| Rate isolation follow-up |20/21 | e2e-2026-11-06-rate-limit-fixed.json; onboarding and real11th-request429 pass; one script-fetch500 caused by an overlapping build |
| Runner failure propagation |PASS | Deliberate no-matching-scenario CLI probe exits1; embedded-postgres beforeExit hook no longer hides failed Playwright status |
| Final sequential E2E |21 passed,0 failed/skipped | e2e-2026-11-06-final.json; builds finished before launching; runner exits0 |
| Remote CI on changes |NOT_VERIFIED | Baseline SHA bec1a06 run42156495368 failed at integration; new commit not yet pushed |

All prior failure reports are retained. An initial readiness implementation used
a removed BullMQ API; fixed to waitUntilReady and offline closure tested. Local
.env test DB was unavailable; replaced only the test command connection with a
new disposable synthetic database. No customer/development data was reset.

These checks do not complete all33FR or all30 full business scenarios. Staging
restore, signed physical devices, push receipts, legal and business UAT remain
BLOCKED_EXTERNAL/NOT_VERIFIED. Production release remains BLOCKED.


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
