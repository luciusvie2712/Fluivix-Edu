# Baseline P0 gap analysis

Receivables current bounded delta: real exact summary/positive-debt rows with
shared SQL/snapshot/asOf, filters, real reversal/void refresh and responsive Web
pass full79 integration/54 browser plus remaining local checks. Its commit/CI
is pending. Payment08b18f1 exact CI42247248730 SUCCESS is verified. The current
financial date contract is explicit Vietnam; arbitrary configured IANA zone
alignment is next, before full P0 acceptance. W16/dashboard/attendance/revenue,
audit/privacy/notifications and broader business/M4 work remain. Release BLOCKED.

Latest delta: Invoice/W14 at43e68bd has exact successful CI42241955407 after
an asserted-navigation repair. Payment/W15 now implements operational payment
entry/list/detail, internal print, recorded receiver names and reversal history;
full76 real integration/49 browser cases pass. Its commit/CI and receivables,
reports/dashboard/audit/privacy/notifications and remaining M4 work are pending.

Latest checkpoint (2026-11-06): Fee-plan ea8fb17 exact CI42232459218 SUCCESS
is observed. Invoice/W14 now implements paged exact previews, confirmed/stale-safe
issuance, list/detail/items/history and void administration. Forward024 legacy
rehearsal and full74 integration/44 browser cases pass with no skips/flakiness;
49 unit,15 mobile Jest and the complete local verification matrix pass. Exact
invoice commit/remote CI remain pending. W15 payments/receivables/internal print
receipts, remaining business modules and external M4 gates remain incomplete;
overall release BLOCKED. Older checkpoint paragraphs below are historical.

Fee plans/W13 current delta (2026-11-06): real operational list/detail/create,
minimal class picker, future price/name terms/history, exact VND, confirmation,
optimistic conflicts and readonly/role states implemented. Forward023 keeps
original issued terms and stable fee/period obligations; local legacy rehearsal
and full71 integration plus40-browser regression pass on Node24.22.2.
Fee-plan commit/exact-SHA CI remain pending.
Windows native Node24.15 failures prompted a checksum-verified portable24.22.2
runtime and CI/.node-version pin; failed diagnostics remain separate. W14/W15
invoice preview/list/detail, payments/receivables/receipts and remaining business
modules still require implementation. Assessment7215008 exact CI42227073662
SUCCESS is verified; overall release remains BLOCKED.

Assessment/W12 current delta (2026-11-06): class-scoped list/create and Web
draft editor, explicit publication/correction, published student-detail panel,
paged before/after/lifecycle history, exact decimal validation and optimistic
conflict input preservation implemented. Local66 integration and focused4 E2E
pass. Final full36-browser regression passes with no skipped/flaky cases; the
earlier login1440 Windows worker exit and successful recheck are retained in
separate reports. Module commit/exact-SHA CI remain pending. Migration022
legacy/actor/history invariants pass locally; staging upgrade is not verified.
Teacher4093b08 has exact-SHA CI42218621304 SUCCESS. Finance/report/dashboard/audit/
privacy/notifications and remaining P0/M4 work remain open; release BLOCKED.

Teacher/W07 current delta (2026-11-06): directory/code/status search, active teacher-account picker, profile create/edit/deactivate, assigned-class history and actual class assignment Web are implemented. Actor rechecks close post-lock revocation gaps in those writes; overlapping assignments now return409 instead of500, retaining the SQL exclusion. Local61 integration and full32-browser cases pass. Teacher module commit/exact-SHA CI remain pending. Guardian commitd345764 has exact-SHA CI42194322533 SUCCESS. Assessment/finance/report/dashboard/audit/privacy/notification and broader class/schedule details still require completion; release remains BLOCKED.

Current delta 2026-11-06: Staff/W17 commitdb88cbb has exact-SHA successful CI42182941288. Guardian/W06 now has production contact/profile and relationship/history APIs, tenant-scoped Web list/detail/student panel, confirmation-based verification/revocation, and invitation activation through the real mail worker. Local58 integration,49 unit,15 mobile Jest, mobile API smoke, generated142-operation contract and full29-browser regression pass. Exact Guardian commit/CI remains NOT_VERIFIED until observed. This is scoped technical evidence, not full FR/P0 acceptance. Teacher/assessment/finance/report/dashboard/audit/privacy work and external release gates remain open.

Base: `d43b338`, branch `feat/p0-release-hardening`, inspected 2026-10-24.
Status refers to end-to-end requirements, not manifest membership.

| Area | Status | Concrete evidence / remaining work |
|---|---|---|
| Identity / tenant context / platform MFA | PARTIAL | Auth, mobile-auth, platform modules and real integration/browser tests exist; cross-surface release regression still required |
| Student lifecycle | PARTIAL | `apps/api/src/students.ts`, Web student list/form/detail; CSV absent at baseline |
| Teacher/staff management | PARTIAL | Teacher creation/assignment API, invitations exist; list/edit/deactivate and staff administration UI incomplete |
| Guardian relationship | PARTIAL | Invite/verify/revoke, linked student scope; dedicated operational Web flow missing |
| Classes/enrollment | PARTIAL | Create/list/detail/enroll, seat lock, SQL constraints; edit/close/withdraw workflow missing |
| Recurring schedule | MISSING at baseline | No schedule_rules model/API; current slice adds migration 016 + strict timezone preview/generation |
| Session conflicts/changes | PARTIAL | Teacher/class/room exclusions, student service checks, cancellation/reschedule audit; recurring and Web coverage incomplete |
| Attendance / lessons / grades | PARTIAL | Real APIs and mobile, immutable roster/history and optimistic locking; Web workflows absent |
| Finance | PARTIAL | Bigint ledger, invoice/payment idempotency and locking exist; inspect plan maintenance, preview, reporting and printable Web receipts |
| Notifications | PARTIAL | Inbox, preferences, device revocation, outbox, Expo ticket/receipt logic; multi-role dedupe and fee reminders need review, live push blocked |
| Dashboard / reports / tenant audit | MISSING or PARTIAL | Mobile role summaries exist; tenant Web aggregate/report range/timezone and audit operations incomplete |
| Privacy operations | PARTIAL | Consent + requester DSR registration/tracking exist; verification/fulfillment/retention controls and legal approval incomplete |
| Web | PARTIAL | Source currently has identity/context/basic dashboard/settings/student pages; operational W-06..W-19 coverage must be reconciled individually |
| Platform | PARTIAL | 9 routes implemented, metadata-only boundaries; worker health/alerts and external operations evidence pending |
| Mobile | PARTIAL | 21 screen IDs and 15 current Jest tests; no signed Android/iOS release builds or complete physical UAT evidence |
| Supply chain | BLOCKED | Current npm audit: high node-forge <=1.4.0 via Expo CLI, no patch reported; do not suppress |
| Infrastructure / release | NOT_VERIFIED | Staging restore, load, monitoring, signing, store and legal evidence required |

Baseline checks: AI pack inventory passed; unit 24/24; mobile Jest 15/15; lint
exit 0; cached typecheck exit 0. Full current-session integration/browser/build
regression is pending and must not inherit historical PASS labels.

## Current delta after ced5dca

Recurring rules, unsaved preview, atomic generation, future replacements/history
and rolling jobs now exist; TC027 has fresh API/Web evidence. Classes now have
versioned edit/close/withdraw and real Web workflows; CSV preview/atomic commit
and downloads are also connected. Current focused Web4/4, integration42/42,
unit38/38 are recorded. This does not complete W08..W11: room/course controls,
calendar variants and other operational details still need reconciliation.
W06/W07/W12..W19 and the full student-detail tabs remain unfinished. Staff,
reporting, finance public/operational flows, notification dedupe/reminders and
privacy fulfillment remain executable work. No global FR completion or release
approval is inferred from these local slices.

Forward migrations only; no production data reseeding. The newly tracked
`docs/release/` directory is deliberately exempted from the root documentation
ignore rule so release findings can be reviewed in Git. Local AI packs, skill
vendors, secrets and raw runtime artifacts remain excluded.


2026-11-06 current delta: P0-A exact main1a86b2b CI42168349871SUCCESS; dependency audit0HIGH/0CRITICAL,1LOW/4MODERATE tracked. Staff/RBAC slice now implemented with51 local integration cases and generated135-operation inventory; final browser/remote Staff verification in progress. Teacher operational screens, Guardian administration, assessments, finance/report/dashboard/audit/privacy and external release gates remain executable or explicitly external gaps. Do not infer FR completion from operation/test counts.
