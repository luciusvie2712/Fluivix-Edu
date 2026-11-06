# Security report — current assessment

Date: 2026-10-24. Verdict: **BLOCKED**. This is a scoped engineering assessment,
not a penetration-test or legal certification.

## Open high finding

`pnpm.cmd audit --json` was executed with registry access. Result: 1 high,
0 critical. `node-forge@1.4.0` is introduced by `expo > @expo/cli`, advisory
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
CVE-2026-85393. The advisory currently reports no patched version. The proposed
[upstream fix](https://github.com/digitalbazaar/forge/pull/1152) remains open.
Do not suppress audit, downgrade severity, or treat an unmerged patch as an
approved release. Build tooling is part of the supply chain even if the Nest
API does not call forge. Re-evaluate a maintained patched package or reviewed
replacement and run crypto exploit/regression + Expo builds before closure.

## Fresh verification and boundaries

- Unit and isolated PostgreSQL reports: `evidence/unit.json`,
  `evidence/integration.json`. Exact scenario names are inside the JSON.
- New imports bind both tenant and creating actor. Commit revalidates every row,
  subscription/quota and duplicate code under tenant lock. Raw preview PII is
  removed on commit and expires after 24 hours; worker purge executes each minute.
- CSV has strict UTF-8/control-character, header, quoting, byte and row bounds;
  report downloads contain trusted row numbers/error codes, not submitted cells.
- New schedule/lifecycle routes use named permissions and tenant-scoped lookups;
  rule FK binds tenant + class. Runtime A/B negative additions require the next
  complete integration report, rather than an inherited verdict.
- Platform identity/audience/MFA separation, mobile SecureStore, short-lived
  memory access tokens, browser cookie+CSRF, immutable finance/roster history
  remain mandatory regression targets. No auth fallback or assertion weakening.
- No production secret/PII scan, deployed CORS/TLS verification, external DAST,
  managed-secret rotation drill or independent security sign-off is claimed.

## Required closure evidence

Run dependency audit to zero high/critical, secret scan with reviewed exclusions,
tenant-negative tests for each resource, revocation/context/child-switch tests,
financial allocation races, upload abuse and log-redaction tests. Save tool
version, exact commit, command, exit status and findings. Assign a named security
owner before final approval; none is invented in this record.
