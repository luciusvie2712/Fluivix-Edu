# Incident response

Status: procedure prepared; drill and named on-call contacts **NOT_VERIFIED**.

On suspected cross-tenant exposure, credential compromise or ledger corruption:
freeze affected mutations and queue delivery through approved operations controls;
preserve immutable database/log evidence and correlation IDs; do not paste tokens,
PII or SQL credentials into tickets. Record discovery time, affected scope,
customer impact and each containment action. Escalate to the designated incident,
security and privacy owners; the responsible people must be named before release.

Revoke affected session families/device registrations; rotate only compromised
managed keys with a tested rollout plan. Separate tenant suspension from global
outage response. Never erase audit, allocation, attendance or invoice history.
Ambiguous mail/push outcomes require investigation before resending, to avoid
duplicate external effects. Keep tenant-facing updates factual and privacy-safe.

Recovery: reproduce in isolated staging, implement/verify a scoped correction,
check tenant A/B boundaries and relevant financial/attendance invariants, obtain
operations approval, restore service gradually and monitor queue/error rates.
Use approved backup recovery with payment reconciliation if needed. Privacy
owner/legal counsel determines notification duties/deadlines; no legal conclusion
or notification deadline is invented here. Retain incident timeline, recovery
evidence, root cause and assigned preventive work; rehearse before launch.
