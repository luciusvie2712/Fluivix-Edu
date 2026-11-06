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
