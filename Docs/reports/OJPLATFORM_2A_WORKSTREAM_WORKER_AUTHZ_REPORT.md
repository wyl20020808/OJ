# OJPlatform Phase 2A Worker Authz Report

## 1. Status

**PASS (Auth-owned worker authorization scope; READY FOR LEAD INTEGRATION = YES)**

Implemented policy/types, safe projections, capability honesty, cancellation authorization, minimal audit events, and focused tests. Runtime Worker, Redis, persistence, Web, and central API wiring remain outside this workstream and are not claimed.

## 2. Worktree / Branch

- Worktree: `D:\OJPlatform-worktrees\phase1b-authz`
- Branch: `codex/phase2a-worker-authz`
- Starting HEAD: `6cd4b7c72767714b7c31864ecea87b657a9dba77`
- Starting worktree was clean and HEAD was a descendant of the Goal-required base.

## 3. Files and Commit

Changed files:

- `apps/api/src/modules/authz/worker.ts`
- `apps/api/src/modules/authz/index.ts`
- `tests/worker-authz.test.ts`
- `Docs/reports/OJPLATFORM_2A_WORKSTREAM_WORKER_AUTHZ_REPORT.md`

Commit: `feat: implement phase 2A worker authorization` (final HEAD recorded below).

## 4. Existing Model Audit

Authz is additive and public-contract based. The implementation has no Queue, Redis, PostgreSQL, Worker process, source execution, compiler, shell, interpreter, dynamic import, or sandbox dependency. It uses server-side resolvers for worker identity, judge-job linkage, submission ownership, and actor roles.

## 5. Resource Visibility

| Field | Owner linked worker | Operator capability | Denied/unrelated |
|---|---|---|---|
| workerId | yes | yes | no |
| lifecycleState | yes | yes | no |
| heartbeat/protocol/build | yes | yes | no |
| degraded/offline | yes | yes | no |
| activeJobCount/activeJobIds | no | yes | no |
| diagnosticCode | no | yes | no |
| capability manifest | via capability action only | yes | no |
| processId, lease token, Redis endpoint, stack, source | never | never | never |

Owner visibility requires canonical job ownership and worker linkage. Operator visibility requires exact server-resolved capability membership.

## 6. Operation Policy

| Operation | Required actor/resource rule | Result |
|---|---|---|
| worker status | active actor; operator capability or canonical linked owner | implemented |
| diagnostics | active actor + exact diagnostics capability + authoritative worker | implemented |
| capabilities | active actor + exact capability-view capability + authoritative worker | implemented |
| cancel judge job | active actor + exact cancel capability + authoritative worker/job/submission linkage + non-terminal state | implemented |
| restart/drain/unknown | no public authorization | denied by default |

## 7. Cancellation Authorization

Cancellation is an authorization decision only; it performs no queue or worker mutation. Canonical job and submission owner are resolved server-side; forged owner, worker, job, submission, state, command, or path fields cannot grant access. Allowed states are `QUEUED`, `LEASED`, `WORKER_ACCEPTED`, `SAFE_FIXTURE_RUNNING`, and `SAFE_FIXTURE_FAILED_RETRYABLE`. `SAFE_FIXTURE_SUCCEEDED`, terminal failure, and `CANCELLED` are denied/no-op. Account, session strength, role, and resource state are rechecked on every call.

## 8. Capability Honesty

Every safe projection advertises protocol `2A.1`, execution mode `SAFE_FIXTURE_QUALIFICATION`, `safeFixture: true`, `realSandboxedExecution: false`, `sandboxCapability: false`, and an empty language list. No real execution claim is derived from worker input.

## 9. Account State / Deny by Default

Only active password-authenticated contexts with non-empty user and session IDs are eligible. Disabled, deactivated, malformed, unauthenticated, unknown operations, unknown lifecycle/job states, missing authoritative resolvers, and mismatched linkage fail closed. Roles are resolved through `resolveUserRoles` when integrated; client-injected role strings are not trusted.

## 10. Audit Design

Audit events are constructed field-by-field with actor, action, safe IDs, outcome, request ID, bounded reason code, and timestamp. Source, credentials, session material, raw lease tokens, Redis/DB data, stack traces, process commands, and arbitrary request fields are excluded.

## 11. N2A Matrix

All 15 rows PASS in individually named tests in `tests/worker-authz.test.ts`:

| ID | Setup / expected | Actual / evidence | Result |
|---|---|---|---|
| N2A-01 | unauthenticated inspect denied | false | PASS |
| N2A-02 | ordinary global inspect denied | false | PASS |
| N2A-03 | cross-user cancel denied | false | PASS |
| N2A-04 | forged worker denied | false | PASS |
| N2A-05 | forged submission owner denied | false | PASS |
| N2A-06 | spoofed capability denied | false | PASS |
| N2A-07 | inactive operator denied | false | PASS |
| N2A-08 | unknown operation denied | false | PASS |
| N2A-09 | unknown lifecycle fails closed | false | PASS |
| N2A-10 | terminal cancellation denied/no-op | false | PASS |
| N2A-11 | inspect does not imply restart/drain | false | PASS |
| N2A-12 | arbitrary control payload denied | false | PASS |
| N2A-13 | unrelated diagnostics enumeration denied | false | PASS |
| N2A-14 | no Queue/Worker side effect | resolver-call assertion | PASS |
| N2A-15 | replay rechecks actor/account/resource | second call denied | PASS |

## 12. A2A Matrix

All rows are individually named tests in `tests/worker-authz.test.ts` (24/24 PASS).

| ID | Setup | Expected | Actual / evidence | Result |
|---|---|---|---|---|
| A2A-01 | unauthenticated diagnostics | deny | false, focused test | PASS |
| A2A-02 | active operator status | allow | true, focused test | PASS |
| A2A-03 | ordinary user global inspect | deny | false, focused test | PASS |
| A2A-04 | disabled operator | deny | false, focused test | PASS |
| A2A-05 | malformed auth context | deny | false, focused test | PASS |
| A2A-06 | unknown operation | deny | false, focused test | PASS |
| A2A-07 | unknown job state | deny | false, focused test | PASS |
| A2A-08 | spoofed capability/role | deny | false, server-role resolver test | PASS |
| A2A-09 | forged owner linkage | deny | false, authoritative resolver test | PASS |
| A2A-10 | cross-user actor | deny | false, focused test | PASS |
| A2A-11 | terminal canonical job | deny/no-op | false, canonical-state test | PASS |
| A2A-12 | inspect-only role attempts cancel | deny cancel, allow inspect | true/false, focused test | PASS |
| A2A-13 | drain operation | deny | false, focused test | PASS |
| A2A-14 | worker advertises real mode | safe-only projection | real flags forced false | PASS |
| A2A-15 | source marker in request | absent from audit | marker scan passes | PASS |
| A2A-16 | session secret in actor | absent from audit | marker scan passes | PASS |
| A2A-17 | raw lease token in worker | absent from audit | marker scan passes | PASS |
| A2A-18 | arbitrary command/path metadata | not copied | marker scan passes | PASS |
| A2A-19 | diagnostics decision | no mutation | resolver called once | PASS |
| A2A-20 | repeated denied cancel | stable denial | false twice | PASS |
| A2A-21 | deactivated account | deny | false, focused test | PASS |
| A2A-22 | worker/job mismatch | deny | false, focused test | PASS |
| A2A-23 | empty worker identity | deny | false, focused test | PASS |
| A2A-24 | unknown operation with secret-like data | bounded reason/no leak | `DENIED`, scan passes | PASS |

## 13. JU Auth-Owned Rows

| ID | Auth-owned evidence | Result |
|---|---|---|
| JU01 | owner status projection API implemented | PASS (unit) |
| JU02 | unrelated user denial | PASS (unit) |
| JU03 | operator diagnostics policy | PASS (unit) |
| JU04 | server-backed degraded/offline fields | PASS (projection) |
| JU05 | safe-fixture-only honesty | PASS (unit) |
| JU06 | secret/lease fields excluded | PASS (marker tests) |
| JU07 | refresh consistency requires Lead/API integration | NOT VERIFIED |
| JU08 | browser console | PENDING Web |
| JU09 | responsive baseline | PENDING Web |
| JU10 | keyboard/focus accessibility | PENDING Web |

## 14. Marker Evidence

Source marker, session secret, raw lease token, Redis endpoint, stack, command/path, and secret/token reason-code scans all pass negative assertions.

## 15. Architecture / Ownership Proof

No shared contract, migration, root manifest, lockfile, central API composition, Web, Backend runtime, Queue, Redis, or Worker file was modified. Authz depends only on explicit public types/resolvers and an audit hook. Architecture dependency gate passed.

## 16. Test Evidence

- `pnpm exec vitest run tests/worker-authz.test.ts`: 1 file, 40 passed.
- `pnpm test`: 14 files passed, 1 skipped; 154 passed, 3 skipped.
- `pnpm format:check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test:architecture`: PASS.
- `pnpm build`: PASS.
- `git diff --check`: PASS.

## 17. Integration Request

Lead should wire the policy into central API/Auth composition, provide authoritative role/worker/job/submission resolvers, connect the approved audit sink, and expose only the public projections. Lead must preserve safe-fixture-only capability semantics and keep Worker/Queue mutation outside this policy.

## 18. Dependency Requests

None.

## 19. Limitations

No real Worker runtime, Redis, PostgreSQL, browser journey, or production sandbox qualification was performed. These are explicitly pending in the frozen Phase 2A qualification matrix and remain outside Auth ownership.

## 20. Final Git State

Implementation commit / starting point for final verification: `39a4705` (`feat: implement phase 2A worker authorization`).

The report metadata update is committed immediately after this implementation commit; `git log -1` is the authoritative final HEAD.

`git status` must be clean after the scoped commit.

## 21. Readiness

READY FOR LEAD INTEGRATION = YES
