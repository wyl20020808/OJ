# OJPlatform 1E-R Judge Queue Recovery Report

## 1. Executive status

Status: PARTIAL. Queue-owned recovery behavior, security gates, and real Redis adapter qualification pass. R05/R06 remain Lead-owned because the composed Submission/API lifecycle cannot be exercised or corrected by this worker. No real Judge, verdict, Sandbox, or submitted-source execution was introduced.

## 2. Worktree/branch

`D:\OJPlatform-worktrees\phase1b-problem-authoring` / `codex/phase1er-judge-queue-recovery`.

## 3. Starting HEAD

Recovery ancestor: `38fdbc48695f8851df47d7ae433eb551b9b340a4`. This continuation started at `08793f00392b2863f96fc87d988f39ebc7c8c726`.

## 4. Final HEAD

The final HEAD is the scoped commit containing this report; its exact hash is in the final task response and Git history.

## 5. Commits

Prior recovery commits: `88a32cc feat: harden phase 1E judge queue recovery`; `08793f0 docs: record judge queue recovery commit`. This continuation adds one scoped Queue commit.

## 6. Files/modules changed

`apps/api/src/modules/judge/{repository,service,safety}.ts`, `tests/judge-queue.test.ts`, `tests/judge-queue-redis.test.ts`, and this report. No Auth, Web, central API composition, contract, migration, root manifest, lockfile, or `PROJECT_STATUS` change.

## 7. Previous implementation audit

Redis complete/retry/recovery were read/write sequences without cross-instance serialization. This continuation applies a token-checked Redis mutation lock to every mutable path and an optional namespace constructor argument for isolated qualification, retaining production `oj:judge` defaults.

## 8. Persistence/durability model

Redis is authoritative for serialized job data, submission idempotency indexes, and queue list. Jobs contain immutable linkage, state, attempts, lease metadata, failure/synthetic metadata, timestamps, and idempotency key. Source is neither a job field nor transported. No TTL/retention policy is configured.

## 9. Redis structures/atomicity

Keys are `oj:judge:job:<id>`, `oj:judge:submission:<submissionId>`, `oj:judge:queue`, and `oj:judge:mutation-lock`. `SET NX PX` serializes enqueue, claim, complete, retry, terminalization, and recovery; release verifies lock ownership. Real Redis concurrency passed. Separate Redis commands are not claimed to be crash-atomic distributed transactions.

## 10. State-machine table

| From | Event | To | Preconditions/effect |
|---|---|---|---|
| none | enqueue | QUEUED | immutable linkage; job/index/list |
| QUEUED/FAILED_RETRYABLE | claim | LEASED_FAKE | one owner/token/expiry; attempt +1 |
| LEASED_FAKE | complete | SUCCEEDED_FAKE | current unexpired token; clear lease |
| LEASED_FAKE | retry/recover | FAILED_RETRYABLE | current token/expiry; one requeue |
| LEASED_FAKE | retry/recover/fail | FAILED_TERMINAL | cap or terminal event; no requeue |

Terminal `SUCCEEDED_FAKE`, `FAILED_TERMINAL`, and `CANCELLED` jobs are not claimable/requeueable.

## 11. Lease/token invariants

One valid owner/token/future expiry per job. Completion/retry/fail-terminal require the exact unexpired token. Recovery clears lease identity; the next claim has a new token.

## 12. Attempt semantics

Attempt starts at 0, increments only on successful claim, never decrements, and terminalizes at the configured cap.

## 13. Retry/requeue

Only an active matching lease may retry. Retry records its reason and publishes one future claim path under the mutation lock.

## 14. Terminalization

Completion and terminal failure clear lease metadata and never republish. Duplicate completion preserves the first terminal record; wrong/stale tokens reject.

## 15. Stale lease recovery

Expired leases become retryable or terminal by cap. Repeated recovery is idempotent; a new claim has a new token and increments attempt.

## 16. Late stale completion

Old completion/retry after expiry, recovery, or a new claim throws `JudgeJobConflictError`. Memory and real Redis races cover this.

## 17. Idempotency/concurrency

Twenty duplicate enqueues yield one job; twenty distinct inputs remain distinct. One queued job has one concurrent claim winner. Duplicate completion returns the first fixture/terminal record. Real Redis tests use isolated namespaces.

## 18. Redis interruption/reconnect

R01/R02/R03/Q27 PASS to Queue ownership limit: an unavailable client rejects enqueue; disconnect before claim rejects without fabricated success; a fresh real adapter reconnects, dedupes original enqueue, and resumes claim. This is explicit new-adapter reconnect, not a claim about central client auto-reconnect policy.

## 19. Redis restart

R04 PASS. With `wsl.exe -d Ubuntu-24.04 -- sleep infinity`, local Compose Redis was restarted. Namespaced `FAILED_RETRYABLE` and `FAILED_TERMINAL` records, each attempt 1, were recovered from `ojplatform-redis-data` RDB. This proves local configured restart persistence only.

## 20. API restart

Two API runtime smoke rounds passed (`health`, `ready`, `404`, request-id, shutdown, port reuse). R05/R06 are BLOCKED: composed Submission creation, auth fixture, lifecycle harness, and status projection are Lead-owned. The central projection still recognizes legacy state names rather than the frozen Queue names.

## 21. Fake worker crash recovery

R07/R08 PASS at abstraction level. A fake worker claims with a 1 ms lease, constructs its deterministic result, throws via the pre-ack hook, then a recovered worker completes the same fixture exactly once. No OS-process termination is claimed.

## 22. Runtime container lifecycle diagnosis

R09 diagnosis PASS / SHARED-OWNED. No Queue script/test stops Compose. Without a WSL keepalive, Redis received SIGTERM, saved RDB, and exited 0; the documented non-privileged keepalive retained the service and Windows localhost bridge. This is WSL/runtime orchestration, not Queue teardown.

## 23. No-source-execution instrumentation

`NoSourceExecutionGuard` fails closed for compile, execute, eval, shell, dynamic import, compiler/interpreter launch, and Sandbox operations. Fake worker checks the injected guard before and after acknowledgement and accepts fixture IDs only.

## 24. Source logging proof

Inert shell/eval/Python/HTML-shaped text and marker `QUEUE_SOURCE_MUST_NOT_BE_LOGGED_unique` are ignored by job normalization and absent from serialized job/log metadata. `safeJudgeLog` excludes source, lease tokens, credentials, and secrets.

## 25. Malformed payload

`assertPayload` rejects malformed JSON/state/linkage/attempt/timestamp/lease metadata with `JudgeJobPayloadError`; no malformed input fabricates success.

## 26. Immutable linkage

Submission owner/problem/revision/testdata/language are snapshotted and no queue mutation API changes them. Unknown fixtures reject safely.

## 27. Q01-Q30 matrix

| IDs | Evidence | Result |
|---|---|---|
| Q01-Q02 | normal and sequential duplicate enqueue | PASS |
| Q03-Q04 | `Promise.all(20)` duplicate/distinct; real Redis equivalent | PASS |
| Q05-Q06 | single/concurrent claim; real Redis ten-claimer race | PASS |
| Q07-Q08 | expiry, stale recovery, new attempt | PASS |
| Q09-Q10 | valid/concurrent duplicate completion | PASS |
| Q11-Q12 | wrong/old token rejection | PASS |
| Q13-Q16 | retry/requeue, cap, terminal failure | PASS |
| Q17-Q19 | late completion and two stale races | PASS |
| Q20-Q25 | attempt monotonicity, terminal and token invariants | PASS |
| Q26-Q27 | idempotency/reconnect with new real adapter | PASS (adapter scope) |
| Q28-Q30 | unknown fixture, immutable linkage, cross-job isolation | PASS |

## 28. R01-R10 matrix

| ID | Evidence | Result |
|---|---|---|
| R01 | unavailable client controlled rejection | PASS |
| R02 | disconnect before claim controlled rejection | PASS |
| R03 | new adapter reconnect, dedupe, claim | PASS |
| R04 | actual Compose Redis restart/RDB readback | PASS |
| R05 | API restart after composed enqueue | BLOCKED (Lead harness) |
| R06 | API restart during composed lease | BLOCKED (Lead harness) |
| R07 | pre-ack fake-worker abort and recovery | PASS (abstraction level) |
| R08 | result-before-ack abort; one later terminal effect | PASS (abstraction level) |
| R09 | SIGTERM/keepalive root-cause diagnosis | PASS / SHARED-OWNED |
| R10 | malformed payload rejection | PASS |

## 29. S01-S10 matrix

| IDs | Evidence | Result |
|---|---|---|
| S01-S06 | guard and no compiler/process/eval/shell/import execution path | PASS |
| S07-S08 | source-shaped input ignored; no source filesystem/network path | PASS |
| S09 | unique marker and lease token absent from job/log output | PASS |
| S10 | only synthetic qualification kind/fixture outcomes | PASS |

## 30. Test commands/counts

Targeted Queue unit: 13 PASS. Opt-in real Redis: 3 PASS. `pnpm infra:wait`, `pnpm db:migrate`, `pnpm integration` (4 PASS), and `pnpm runtime:smoke` (two PASS rounds) passed. Final regression: `pnpm format:check` PASS; `pnpm lint` PASS; `pnpm typecheck` PASS; `pnpm test` 12 files/63 tests PASS; `pnpm test:architecture` PASS; `pnpm build` PASS; `pnpm integration` 1 file/4 tests PASS; explicit Redis suite 1 file/3 tests PASS; `git diff --check` PASS.

## 31. Integration Requests

1. Lead: add an authorized composed Submission/API restart harness for R05/R06, testing one job after restart and lease persistence. Affected scope: Lead-owned composition/routes/auth fixtures.
2. Lead: update central projection for `LEASED_FAKE`, `SUCCEEDED_FAKE`, `FAILED_RETRYABLE`, `FAILED_TERMINAL` without displaying real verdicts.
3. Runtime owner: maintain documented WSL keepalive during lifecycle qualification; Queue has no premature teardown.

## 32. Dependency Requests

None. Existing `ioredis` is retained; no framework or migration added.

## 33. Known limitations

Local RDB persistence is not HA/crash-consistency evidence. No retention policy, relational queue migration, OS-level worker crash, or full composed API restart evidence exists. Mutation locking does not claim distributed transaction semantics.

## 34. Git status

Clean after the scoped commit. No merge or Lead requalification is started.

## 35. READY FOR LEAD REQUALIFICATION

READY FOR LEAD REQUALIFICATION = NO, pending the Integration Requests, especially R05/R06.
