import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// This is an inventory, never an automated acceptance verdict.
const sourcePath = "docs/FLUIVIXEDU_MASTER_SPEC.md";
const spec = readFileSync(sourcePath, "utf8");
const api = JSON.parse(readFileSync("apps/api/openapi.json", "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};
const normalize = (path: string) =>
  path.replace(/^\/api\/v1/, "").replace(/\{[^}]+\}/g, "{}");
const methods = ["GET", "POST", "PATCH", "PUT", "DELETE"];
const implemented = new Set(
  Object.entries(api.paths).flatMap(([path, value]) =>
    methods
      .filter((method) => value[method.toLowerCase()])
      .map((method) => `${method} ${normalize(path)}`),
  ),
);
const rows = spec.split(/\r?\n/);
const fr = rows
  .filter((row) => /^\| FR-/.test(row) && /\| P0 \|/.test(row))
  .map((row) =>
    row
      .split("|")
      .slice(1, -1)
      .map((v) => v.trim()),
  );
const tc = rows
  .filter((row) => /^\| TC-\d{3} \|/.test(row))
  .map((row) =>
    row
      .split("|")
      .slice(1, -1)
      .map((v) => v.trim()),
  );
if (fr.length !== 33 || tc.length !== 30)
  throw new Error("Spec inventory drift: reconcile before releasing");
const evidence: Record<string, string> = {
  PL: "apps/api/src/platform*; tests/integration/platform-cases.ts; tests/e2e/platform*",
  AU: "apps/api/src/auth*; staff.ts; staff-policy.ts; mobile-auth.ts; tests/integration/identity.test.ts; staff-cases.ts; native-cases.ts; tests/e2e/staff.spec.ts",
  US: "apps/api/src/students.ts; guardian-links.ts; guardian.service.ts; teaching.service.ts; apps/web/components/guardian-workspace.tsx; teacher-workspace.tsx; tests/integration/identity.test.ts; guardian-cases.ts; teacher-cases.ts; teaching-cases.ts; tests/e2e/guardians.spec.ts; teachers.spec.ts",
  CL: "apps/api/src/teaching.*; infra/prisma/migrations/202610240016_schedule_rules; tests/integration/teaching-cases.ts",
  AT: "apps/api/src/teaching.*; apps/mobile/app; tests/integration/teaching-cases.ts",
  GR: "apps/api/src/grades.ts; grade-history.dto.ts; migration022; apps/web/components/assessment-workspace.tsx; apps/mobile/app; tests/integration/assessment-cases.ts; migration-cases.ts; teaching-cases.ts; tests/e2e/assessments.spec.ts",
  FI: "apps/api/src/finance.*; finance-query.ts; invoice.dto.ts; invoice-query.ts; payment.dto.ts; payment-query.ts; receivables.dto.ts; migrations023/024/025/026; packages/contracts/src/calendar-time.ts; schedule-time.ts; apps/web/components/fee-plan-workspace.tsx; invoice-workspace.tsx; payment-workspace.tsx; receivables-workspace.tsx; apps/mobile/app; tests/integration/fee-plan-cases.ts; receivable-cases.ts; migration-cases.ts; teaching-cases.ts; tests/e2e/fee-plans.spec.ts; invoices.spec.ts; payments.spec.ts; receivables.spec.ts; financial-timezone.spec.ts; tests/unit/calendar-time.test.ts",
  NT: "apps/api/src/reports.controller.ts; reports.service.ts; reports.dto.ts; report-queries.ts; tenant-audit.ts; tenant-audit.dto.ts; migration027; apps/web/components/reports-workspace.tsx; tenant-audit-workspace.tsx; apps/api/src/notifications.ts; mobile-dashboard.ts; apps/worker/src/notifications.ts; tests/integration/report-cases.ts; report-migration-case.ts; tenant-audit-cases.ts; teaching-cases.ts; tests/e2e/reports.spec.ts; tenant-audit.spec.ts",
};
const acceptance: Record<string, [string, string]> = {
  "TC-001": [
    "PARTIAL",
    "Full Edge19 onboarding/mail/owner activation; operator approval separate",
  ],
  "TC-002": [
    "PARTIAL",
    "Edge A/B switch + native API smoke; signed-device cache/deep-link UAT missing",
  ],
  "TC-003": [
    "DONE_VERIFIED",
    "evidence/e2e.json CSV100/five errors/error report/clean atomic commit; integration TC003",
  ],
  "TC-004": [
    "PARTIAL",
    "integration TC004/005 + native verified-child scope; signed UI forbidden-state UAT missing",
  ],
  "TC-005": [
    "PARTIAL",
    "guardian real PostgreSQL + Web email activation/revocation; actual native client rejects delayed genuine bytes and clears child cache; physical open-screen/cache UAT missing",
  ],
  "TC-006": [
    "DONE_VERIFIED",
    "integration final-seat race201/409, one enrollment, foreign nested FK rejected",
  ],
  "TC-007": [
    "PARTIAL",
    "integration recurring conflict/late race/atomic retry; room-specific recurring UI case missing",
  ],
  "TC-008": [
    "PARTIAL",
    "integration versioned reschedule/cancel history; multi-role event/channel dedupe under review",
  ],
  "TC-009": [
    "PARTIAL",
    "integration20 + Teacher20 API smoke + Web finalize; signed native20 UAT missing",
  ],
  "TC-010": [
    "PARTIAL",
    "integration stale-version rejection; full two-device simultaneous workflow missing",
  ],
  "TC-011": [
    "PARTIAL",
    "integration hides drafts + Student API smoke; signed-device visibility UAT missing",
  ],
  "TC-012": [
    "PARTIAL",
    "integration privileged reopen/reason/audit; business Web/device UAT missing",
  ],
  "TC-013": [
    "PARTIAL",
    "Assessment Web draft0/max, publish/correct/history/concurrent editors; real native publication API; physical-device business acceptance missing",
  ],
  "TC-014": [
    "DONE_VERIFIED",
    "integration TC013/014/025: out-of-range score422 and no invalid result persisted",
  ],
  "TC-015": [
    "PARTIAL",
    "real invoice Web preview/confirmed issue, lost committed response same-key retry, stale eligibility409 and unique run; physical business acceptance missing",
  ],
  "TC-016": [
    "PARTIAL",
    "integration same-key payment race/replay and unallocated balance; verified operational multi-invoice Web, truly committed lost-response retry and internal print receipt; physical business acceptance pending",
  ],
  "TC-017": [
    "PARTIAL",
    "integration over-allocation rollback; verified Web exact allocation validation, partial/final receipt and reasoned reversal; physical business acceptance pending",
  ],
  "TC-018": [
    "PARTIAL",
    "integration scoped linked invoices/receipts; signed Guardian device UAT missing",
  ],
  "TC-019": [
    "BLOCKED",
    "Injected provider invalid-token behavior verified; real push credentials/device receipts absent",
  ],
  "TC-020": [
    "PARTIAL",
    "integration READ_ONLY/suspended + Web banner; full surface UAT pending",
  ],
  "TC-021": [
    "DONE_VERIFIED",
    "integration web/native rotation/reuse family revoke and concurrent native winner",
  ],
  "TC-022": [
    "PARTIAL",
    "integration event materialization replay; multi-role/channel dedupe gap remains",
  ],
  "TC-023": [
    "PARTIAL",
    "real November Vietnam scoped API/Web and role/CSV focused cases pass; final full reporting gate and exact-SHA CI pending",
  ],
  "TC-024": [
    "PARTIAL",
    "integration accountless enrollment/roster/finance; complete staff Web journey pending",
  ],
  "TC-025": [
    "PARTIAL",
    "integration unassigned teacher grade denial; suspicious-access audit review pending",
  ],
  "TC-026": [
    "PARTIAL",
    "integration money/derived states; Web two-payment/overdue journey pending",
  ],
  "TC-027": [
    "DONE_VERIFIED",
    "integration TC027 preserves manual/roster/completed/prepared lessons and rollback; teaching-csv-final-e2e.json edits rule/history and retains published session",
  ],
  "TC-028": [
    "PARTIAL",
    "staff integration expiry/resend/old-token/reuse; Web real mail resend/activation; remaining Student/Guardian flows and external UAT separate",
  ],
  "TC-029": [
    "PARTIAL",
    "Fresh negative student/nested FK/teaching/import/platform scopes; full inventory remaining",
  ],
  "TC-030": [
    "BLOCKED",
    "Approved staging backup/restore target, credentials and recovery evidence absent",
  ],
};
const hash = createHash("sha256").update(spec).digest("hex");
mkdirSync("docs/release", { recursive: true });
writeFileSync(
  "docs/release/TRACEABILITY_P0.md",
  `# P0 traceability inventory

Source: ${sourcePath}, SHA-256 \`${hash}\`.
Generated by \`pnpm.cmd exec tsx tooling/release-inventory.ts\`.
All 33 requirements are **PARTIAL** until complete UI/API/security/E2E and external
gates are evidenced. File references identify code to review, not proof of PASS.

| Requirement | Business behavior | Status | Code/test review targets |
|---|---|---|---|
${fr.map(([id, , title]) => `| ${id} | ${title} | PARTIAL | ${evidence[id!.split("-")[1]!] ?? "Manual review required"} |`).join("\n")}

## Acceptance scenarios

Current-session results are in TEST_RESULTS.md. Reviewed scenario statuses below
are never inferred from route counts. DONE_VERIFIED means the stated local
scenario executed; it does not authorize release. API assertions can pass while
the cross-surface scenario stays PARTIAL.

| Test | Requirements | Scenario | Expected | Status | Evidence and limit |
|---|---|---|---|---|---|
${tc.map(([id, req, scenario, expected]) => `| ${id} | ${req} | ${scenario} | ${expected} | ${acceptance[id!]?.[0] ?? "NOT_VERIFIED"} | ${acceptance[id!]?.[1] ?? "Not mapped"} |`).join("\n")}
`,
);
const desired = rows.flatMap((row) => {
  const match = row.match(
    /^\| ((?:GET|POST|PATCH|PUT|DELETE)(?:\/(?:GET|POST|PATCH|PUT|DELETE))*) \| \x60([^\x60]+)\x60/,
  );
  return match
    ? match[1]!.split("/").map((method) => ({ method, path: match[2]! }))
    : [];
});
writeFileSync(
  "docs/release/API_COVERAGE.md",
  `# API contract coverage

Generated inventory: ${implemented.size} actual OpenAPI operations; ${desired.length}
method/path intents in the master specification (includes non-P0 design intent).
Path parameter names are normalized when comparing. MATCH means route metadata
exists; it does not verify DTOs, permission, object scope or runtime behavior.
ABSENT requires review for a documented equivalent, P1 exclusion or implementation.

| Method | Spec path | Metadata coverage |
|---|---|---|
${desired.map(({ method, path }) => `| ${method} | \`${path}\` | ${implemented.has(`${method} ${normalize(path)}`) ? "MATCH" : "ABSENT / REVIEW"} |`).join("\n")}

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
`,
);
console.log(
  JSON.stringify({
    p0Requirements: fr.length,
    acceptanceTests: tc.length,
    specOperations: desired.length,
    actualOperations: implemented.size,
    verdict: "INVENTORY_ONLY",
  }),
);
