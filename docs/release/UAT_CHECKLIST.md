# UAT checklist

Status: **NOT_VERIFIED** by business users. Use isolated approved synthetic data;
record tester, device/browser version, Git SHA, date and evidence for each result.
The master spec TC-001..030 matrix is in TRACEABILITY_P0.md; no blanket PASS.

| Role | Required journey | Result |
|---|---|---|
| Platform operator | MFA enrollment/login/recovery, create tenant/plan/owner invite, subscription expiry, audit/health without learner content | NOT_VERIFIED by operator |
| Owner/manager | Invite staff/teacher; manage class20, recurring T2/T4, enrollment/withdrawal, guardian verify/revoke; role restrictions | NOT_VERIFIED by business tester |
| Academic staff | Import100 with5 invalid rows; resolve/re-preview; class/room/teacher/student conflicts, reschedule/cancel, version recovery | NOT_VERIFIED by business tester |
| Accountant | Fee plan; invoice preview/generation retry; 1.200.000VND paid500.000+700.000; receipt, overdue, reverse/void permissions | NOT_VERIFIED by finance tester |
| Teacher | Assigned20 roster, draft/finalize, stale concurrent device, notes and8/10 grade publish, denied reopen/unassigned class | NOT_VERIFIED on signed Android/iOS |
| Student | Published-only schedule/attendance/grade, finance denied, account session/privacy/revocation | NOT_VERIFIED on signed Android/iOS |
| Guardian | Two children, active verified links, publish visibility, financial scope, revoke while open, inbox/push/open correct child | NOT_VERIFIED on signed Android/iOS |
| Operations | Staging upgrade, rollback/restore, alert/worker outage drill, load and support escalation | NOT_VERIFIED |

Also test no active tenant, READ_ONLY/SUSPENDED, zero data, slow/offline/reconnect,
screen reader, keyboard, font scaling and reduced motion. Automated browser/API
passes complement business UAT; they do not sign on behalf of real role owners.
