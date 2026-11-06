# Current-session test results

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
