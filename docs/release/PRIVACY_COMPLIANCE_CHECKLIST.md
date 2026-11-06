# Privacy and compliance review

Verdict: **BLOCKED** for real data; no legal approval is claimed. Official source
checked: [Law91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=),
effective2026-01-01. Applicability, implementing instruments and all obligations
must be reviewed by qualified Vietnamese legal/privacy owners; this engineering
checklist does not certify compliance.

| Required decision/evidence | Current state |
|---|---|
| Identify controller/processor, schools/tenant responsibilities and contracts | BLOCKED: legal/organization approval absent |
| Approved notice URL/version, purposes and child/guardian consent authority | BLOCKED: code has configurable notice/consent; approval absent |
| Data inventory/classification, lawful grounds and minimum fields | PARTIAL: profile/attendance/grades/finance/relationship/push data identified; owner review pending |
| DSR identity verification, authorized fulfillment, secure export and SLA | PARTIAL: requester registration/tracking exists; operational fulfillment incomplete |
| Retention, erasure restrictions and legal holds for finance/audit/minors | BLOCKED: approved policy absent; never erase immutable financial history on an unverified request |
| Temporary CSV upload minimization | PARTIAL: 24h expiry, commit purges raw rows, worker purge and scope tests; this does not define customer-record retention |
| Hosting/processor locations and international transfers | NOT_VERIFIED: actual infrastructure/provider agreements absent |
| Incident/privacy escalation and statutory reporting process | NOT_VERIFIED: named owner and legal determination required |
| Store privacy labels/Data Safety and push consent wording | BLOCKED: release owner/store review required |
| Privacy training and access review | NOT_VERIFIED |

Keep real student/guardian data out of test fixtures and release evidence. Do not
publish policy text or claim legal sign-off on behalf of the user.
