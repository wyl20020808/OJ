# PHASE 1E-R Judge Authz Recovery Report

## 1. Executive Status

GOAL: `OJPLATFORM-1E-R-JUDGE-AUTHZ-RECOVERY`
STATUS: PASS CANDIDATE (worker scope)
REASON: The integrated policy had two real defects: owner decisions trusted the client-visible `ownerUserId`, and runtime unknown states were accepted by truthiness. Both were fixed in the public Authz policy and qualified with the complete A01-A24 matrix. Queue/persistence/runtime qualification remains Lead-owned.

## 2. Worktree / Branch / Git

WORKTREE: `D:\OJPlatform-worktrees\phase1b-authz`
BRANCH: `codex/phase1er-judge-authz-recovery`
STARTING HEAD: `38fdbc4`
FINAL HEAD: recorded by the commit containing this report
COMMIT: `feat: recover phase 1E Judge authorization qualification`
FINAL GIT STATUS: clean after commit; no protected or unrelated files modified.

## 3. Files Changed

- `apps/api/src/modules/authz/judge.ts`: authoritative linkage, runtime state validation, exact operation dispatch, state-aware privileged decisions.
- `tests/judge-authz.test.ts`: independently named A01-A24 recovery tests.
- `Docs/reports/OJPLATFORM_1E_R_WORKSTREAM_JUDGE_AUTHZ_RECOVERY_REPORT.md`: this permanent evidence report.

No queue, persistence, migration, Web, Backend, shared contract, central composition, root manifest, `PROJECT_STATUS`, or source-execution file changed.

## 4. Existing Implementation Audit

KEPT: public boolean decision methods, owner view/inspect distinction, operator capability map, terminal states, inactive-account checks, metadata-only audit.
FIXED: owner authorization now requires `Judge Job -> Submission -> authoritative owner` resolution; forged/mismatched linkage fails closed. Runtime state is checked against the frozen six-state set. Retry is restricted to `FAILED_RETRYABLE`; cancel is restricted to `QUEUED`, `LEASED_FAKE`, or `FAILED_RETRYABLE`; terminal states deny both. Unknown operations dispatch to deny.
EXTENDED: `canJudgeJobOperation` provides an explicit fail-closed operation boundary; enqueue accepts a linked job reference and exact enqueue capability without queue side effects.

## 5. Authorization Model

Actors: U0 unauthenticated; U1 submission owner; U2 unrelated authenticated user; U3 privileged operator; U4 disabled/deactivated account; U5 malformed/incomplete context.
Operations: view, inspect, enqueue, retry, cancel. Diagnostics is not exposed by the frozen contract; an unknown diagnostics string is tested as deny.
Ownership trust boundary: the policy calls injected `resolveSubmissionOwner(submissionId)` and requires its result to equal the job linkage owner. The browser/client cannot supply an owner that bypasses this resolver.
Capability source: exact action membership in the injected role-to-capability map; no substring, case folding, arbitrary user capability, or broad role allow.
Account state: only `active` plus non-empty session id and `password` strength qualifies. Disabled/deactivated/stale or malformed contexts deny before ownership/capability checks.
Deny-by-default: invalid job, unknown state, unknown operation, missing resolver, missing role, terminal misuse, and missing context all return `false` without queue interaction.

## 6. Full State-Aware Authorization Matrix

`owner` means U1 with authoritative linkage; `operator` means U3 with the exact action capability; `-` means denied/N/A.

| Job state | Owner view | Owner inspect | Operator view | Operator inspect | Operator retry | Operator cancel | Operator enqueue |
|---|---:|---:|---:|---:|---:|---:|---:|
| `QUEUED` | allow | allow | allow | allow | - | allow | allow when linked |
| `LEASED_FAKE` | allow | allow | allow | allow | - | allow | allow when linked |
| `FAILED_RETRYABLE` | allow | allow | allow | allow | allow | allow | allow when linked |
| `FAILED_TERMINAL` | allow | allow | allow | allow | - | - | allow when linked |
| `SUCCEEDED_FAKE` | allow | allow | allow | allow | - | - | allow when linked |
| `CANCELLED` | allow | allow | allow | allow | - | - | allow when linked |
| unknown/unrecognized | - | - | - | - | - | - | - |

For all rows, U0/U2/U4/U5 are denied. Owner has no retry/cancel/enqueue capability merely by ownership. Operator inspect does not imply retry/cancel. Enqueue is an authorization decision only; it never mutates queue state.

## 7. A01-A24 Qualification Results

| ID | Test | Setup | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| A01 | unauthenticated view | U0, valid job | deny | false | test `A01 unauthenticated view denied` | PASS |
| A02 | owner view | U1 + resolver owner | allow | true | test `A02 owner view allowed` | PASS |
| A03 | unrelated view | U2 | deny | false | test `A03 unrelated user view denied` | PASS |
| A04 | operator inspect | U3 + inspect capability | allow | true | test `A04 operator inspect allowed` | PASS |
| A05 | ordinary inspect | U2, no capability | deny | false | test `A05 ordinary user inspect denied for unrelated job` | PASS |
| A06 | retryable retry | U3 + retry capability, `FAILED_RETRYABLE` | allow | true | test `A06 operator retry allowed only in retryable state` | PASS |
| A07 | ordinary retry | U1, no retry capability | deny | false | test `A07 ordinary retry denied` | PASS |
| A08 | terminal retry | U3, every terminal state | deny | false for all 3 | test `A08 terminal retry denied across terminal states` | PASS |
| A09 | cancel semantics | U3 active vs terminal; U1 no capability | state-aware | true/false/false | test `A09 cancel semantics are state-aware and capability-controlled` | PASS |
| A10 | inactive accounts | disabled and deactivated U3 | deny all ops | false all | test `A10 inactive, disabled, and deactivated users denied for all operations` | PASS |
| A11 | forged owner | job submission not resolved to claimed owner | deny | false | test `A11 forged ownership identifiers denied` | PASS |
| A12 | source marker | inert source marker on job-shaped input | absent from audit | absent | test `A12 audit metadata contains no source marker` | PASS |
| A13 | secret marker | controlled session secret | absent from audit | absent | test `A13 audit metadata contains no credential/session-secret marker` | PASS |
| A14 | unknown operation | operation `diagnostics` | deny | false | test `A14 unknown operation deny-by-default` | PASS |
| A15 | malformed context | empty user id/no session | safe deny | false | test `A15 malformed auth context denied safely` | PASS |
| A16 | unknown state | runtime `UNKNOWN` state | fail closed | false | test `A16 unknown Judge state fails closed` | PASS |
| A17 | job/submission mismatch | resolver returns no owner for submission | deny | false | test `A17 job/submission mismatch denied by authoritative linkage` | PASS |
| A18 | horizontal escalation | U2 targets U1 job | deny all cross-user ops | false all | test `A18 horizontal privilege escalation denied` | PASS |
| A19 | role spoofing | case-variant/injected role strings | deny | false | test `A19 role/capability spoofing denied` | PASS |
| A20 | no queue side effect | decision with resolver counter only | no queue mutation | one resolver call, no queue API | test `A20 Authz decision causes no queue mutation side effect` | PASS |
| A21 | old session after deactivation | same session id, deactivated status | deny | false | test `A21 previously-valid session after account deactivation denied` | PASS |
| A22 | inspect != mutation | inspect-only role | inspect allow, retry/cancel deny | true/false/false | test `A22 inspect privilege does not imply mutation privilege` | PASS |
| A23 | audit consistency | operator cancel on `j1`, request `req-23` | actor/target match | matched | test `A23 audit actor and target are consistent` | PASS |
| A24 | repeated denial | terminal retry twice | safe/idempotent denial | false/false, two safe audits | test `A24 repeated denied request is safe and idempotent` | PASS |

## 8. Abuse / Negative Paths

NEG-01 forged owner: PASS via authoritative resolver (A11).
NEG-02 job/submission mismatch: PASS (A17).
NEG-03 hidden enumeration/horizontal access: PASS (A03, A18).
NEG-04 role spoofing: PASS (A19).
NEG-05 inactive old session: PASS (A10, A21).
NEG-06 terminal misuse: PASS (A08, A09).
NEG-07 unknown state: PASS (A16).
NEG-08 unknown operation: PASS (A14).
NEG-09 null/undefined identifiers: PASS through malformed job/context checks (A01, A15, A16).
NEG-10 horizontal escalation: PASS (A03, A18).
NEG-11 operator scope: PASS; only exact action capability permits privileged operations (A04, A06, A09, A19, A22).
NEG-12 no Authz side effects: PASS (A20, A24); policy has no queue/persistence dependency or mutation API.

## 9. Audit and Data Minimization Proof

Representative sanitized event shape:

```json
{
  "actorUserId": "op",
  "action": "judge:job:cancel",
  "resource": "judge_job",
  "resourceId": "j1",
  "outcome": "allowed",
  "requestId": "req-23",
  "occurredAt": "2026-08-29T00:00:00.000Z"
}
```

AUD-01/source marker: `AUTHZ_SOURCE_SHOULD_NOT_APPEAR_9f1` searched in captured audit JSON; absent (A12 PASS).
AUD-02/session secret marker: `CONTROLLED_SESSION_SECRET_7a2` searched in captured audit JSON; absent (A13 PASS).
AUD-03 arbitrary request metadata: audit event is explicitly constructed field-by-field; no request/body/query spread (A12/A13/A23).
AUD-04 denied operation: denied retry is recorded with safe action/outcome and no secret fields (A07, A08, A24).

## 10. Architecture / Ownership Proof

Only `apps/api/src/modules/authz/**`, its tests, and this worker report changed. No Redis/queue import, database access, migration, Web/Backend change, central composition change, shared contract change, root manifest change, `PROJECT_STATUS` change, source execution, or Sandbox behavior exists in the diff. The public boundary receives server-provided job metadata and an owner resolver; it does not query queue state.

## 11. Validation

- TESTED: `pnpm test -- tests/judge-authz.test.ts` (24 A-tests; full suite reported 70 total tests across 11 files).
- TESTED: `pnpm test` (11 files, 70 tests passed).
- TESTED: `pnpm format:check`.
- TESTED: `pnpm lint`.
- TESTED: `pnpm typecheck`.
- TESTED: `pnpm test:architecture`.
- TESTED: `pnpm build`.
- TESTED: `git diff --check`.
- NOT VERIFIED: Lead-owned queue/persistence, real API composition, PostgreSQL/Redis runtime, and operator provisioning.
- NOT VERIFIED: production security qualification and real Judge Worker behavior.

## 12. Integration Request

INTEGRATION REQUEST:
- requested change: wire the public `JudgeAuthorizationPolicy` into central Judge Job routes and provide authoritative `resolveSubmissionOwner` from the server-side Submission linkage.
- reason: owner decisions must never trust browser-controlled owner ids; queue operations must consume policy decisions without importing Auth internals.
- affected file: Lead-owned central composition and Queue/API adapter.
- expected contract impact: none; use the frozen PHASE 1E Judge Protocol & Queue Contract.
- tests required: composed owner/unrelated/operator/inactive/malformed/state/terminal/unknown-state and no-side-effect checks.
- decision: pending Lead Requalification.

## 13. Dependencies and Known Limitations

DEPENDENCY REQUESTS: none. No package, lockfile, migration, Redis, or database dependency was added. Durable role provisioning, audit storage, queue effects, and runtime qualification remain outside this worker scope.

READY FOR LEAD REQUALIFICATION = YES
