# Security report — current assessment

Assessment/W12 local security evidence (2026-11-06): creator, grader and history
actor are bound to the same tenant membership in forward migration022; existing
append-only history and published-score SQL guards are retained. All four score
mutations recheck live membership/role/session/subscription after the tenant lock;
four real suspended-while-waiting operations commit no revoked changes. Teacher
list and editor/history scope use actual assignment dates. Student/Guardian
publication reads use one repeatable snapshot and return only the authorized
student's published result. Drafts and reopened corrections produce no readable
published scores; publication remains explicit and versioned. New staff student
results require grade.write; unauthorized roles and foreign resources are denied.
Full66 integration passes, including legacy migration and concurrent200/409.
Browser/exact-commit CI gates are recorded separately. Legacy orphan/duplicate
data stops upgrade for review; no actor/name/history is fabricated or deleted.

Teacher/W07 local verification (2026-11-06): eligible-account lookup requires ACTIVE membership, ACTIVE global user, accepted activation, teacher role and no existing profile in the selected tenant. Academic staff receives only the minimal name/email/user ID needed to create a teacher profile, without general Staff administration access. Profile, directory and assigned-class reads remain tenant-scoped; teacher/accountant roles cannot enter the management surface. Create/update/assignment now recheck live actor membership/role/session/subscription after the tenant lock. Three real PostgreSQL cases exercise suspension while each operation waits; no write commits. Inactive profile or account cannot receive new teaching assignments/sessions; historical assignments remain. Full61 integration passes locally; full browser and exact-commit CI gates are tracked separately.

Guardian/W06 local security verification (2026-11-06): contact provisioning grants no guardian role to an active staff identity. Pending tenant memberships remain activation-gated even for globally active users; invitation acceptance requires credential proof. Relationship verification is independent of privacy consent. Tenant/profile/student/verifier/history foreign keys, unique open pairs and immutable history are exercised against PostgreSQL. Mutations recheck current membership, selected session/role and subscription after acquiring the canonical tenant lock. Six new guardian cases pass, including a waiting verifier suspended before commit and an actual native client rejecting delayed genuine profile bytes after revocation. Full58 integration passes; signed-device UAT and external security/legal approval remain open. Bodyless Web invitation calls send the existing required JSON header; the CSRF policy is preserved.

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


## Reassessment 2026-11-06

The prior no-patch finding above is historical. The official forge release
https://github.com/digitalbazaar/forge/releases/tag/v1.4.3 is now available.
Expo CLI58.1.19 accepts node-forge ^1.4.0; the workspace pins the compatible
official1.4.3 with a pnpm override, without a fork or advisory suppression.
The actual resolved CLI dependency passes Node RSA signature interoperability
and rejects a correctly encoded signature containing extra nested DigestAlgorithm
elements (tests/unit/forge-signature.test.ts). Frozen lockfile updated.

Fresh audit evidence: dependency-audit-2026-11-06-baseline.json reports6HIGH;
dependency-audit-2026-11-06-final.json reports0HIGH/0CRITICAL,1LOW/4MODERATE.
No moderate/low findings are suppressed. They concern deepmerge, glob and
minimatch in the toolchain and remain tracked for compatible upstream remediation.
Expo install --check passes after official SDK58/RN0.88.1 patch alignment.
Full build produces Web/Platform outputs and Android/iOS Hermes bundles only;
signed device verification, deployed security review and legal approval remain
BLOCKED_EXTERNAL. This dependency result does not approve a production release.
