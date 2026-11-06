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
  US: "apps/api/src/students.ts; guardian-links.ts; teaching.service.ts; tests/integration/identity.test.ts; teaching-cases.ts",
  CL: "apps/api/src/teaching.*; infra/prisma/migrations/202610240016_schedule_rules; tests/integration/teaching-cases.ts",
  AT: "apps/api/src/teaching.*; apps/mobile/app; tests/integration/teaching-cases.ts",
  GR: "apps/api/src/grades.ts; apps/mobile/app; tests/integration/teaching-cases.ts",
  FI: "apps/api/src/finance.*; apps/mobile/app; tests/integration/teaching-cases.ts",
  NT: "apps/api/src/notifications.ts; mobile-dashboard.ts; apps/worker/src/notifications.ts; tests/integration/teaching-cases.ts",
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
    "integration + mobile smoke revoke next request; physical open-screen/cache UAT missing",
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
    "integration exact8/10 publish + native API; assessment Web workflow missing",
  ],
  "TC-014": [
    "DONE_VERIFIED",
    "integration TC013/014/025: out-of-range score422 and no invalid result persisted",
  ],
  "TC-015": [
    "PARTIAL",
    "integration repeated invoice-run idempotency; Web generation/preview absent",
  ],
  "TC-016": [
    "PARTIAL",
    "integration same-key payment race/replay; Web payment workflow absent",
  ],
  "TC-017": [
    "PARTIAL",
    "integration over-allocation rollback; operational Web flow absent",
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
    "MISSING",
    "Tenant Web reporting/dashboard timezone month aggregation not implemented",
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
