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
