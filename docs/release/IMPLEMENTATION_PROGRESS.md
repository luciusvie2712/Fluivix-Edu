# P0 implementation and release hardening

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
