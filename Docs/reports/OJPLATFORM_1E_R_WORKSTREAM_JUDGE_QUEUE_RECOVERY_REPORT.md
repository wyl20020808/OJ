# OJPlatform 1E-R Judge Queue Recovery Report

## 1. Executive status

Status: PARTIAL. Queue-owned implementation defects were fixed and the Q/S qualification suite passes. Real Redis interruption/reconnect/restart, API restart, and container lifecycle qualification are BLOCKED by missing local runtime tools and Lead-owned orchestration. No real Judge, verdict, Sandbox, or user-source execution was introduced.

## 2. Worktree/branch

Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase1er-judge-queue-recovery`  
Starting HEAD: `38fdbc48695f8851df47d7ae433eb551b9b340a4`  
Final implementation commit: `88a32cc96d4dab9245d6abc68a61a54db2fafe75` (`feat: harden phase 1E judge queue recovery`).

## 3. Commits and files

Previous queue implementation was audited and corrected in `apps/api/src/modules/judge/{model,repository,service}.ts`; fail-closed logging/execution guard is in `safety.ts`; the recovery matrix is in `tests/judge-queue.test.ts`; this report is the only new report. No migration was created: Redis remains the frozen queue backend and no relational durability requirement was approved.

## 4. Previous implementation audit

Found and fixed: legacy state names as primary state semantics, completion accepting an expired lease before recovery, unsafe generic payload handling, insufficient concurrent in-memory serialization, and missing malformed-payload validation. Redis transitions remain limited by the existing minimal ioredis abstraction; runtime atomicity requires Lead Redis qualification.

## 5. Persistence/durability model

Redis is authoritative for job JSON and the submission idempotency index. Job key: `oj:judge:job:<jobId>`; idempotency/index key: `oj:judge:submission:<submissionId>`; queue list: `oj:judge:queue`; claim coordination key: `oj:judge:claim-lock`. Job fields include immutable submission/owner/problem/revision/testdata/language linkage, state, attempt/maxAttempts, lease owner/token/expiry, failure and synthetic metadata, and timestamps. No source body is persisted or transported by this queue module. No TTL/retention policy is configured; terminal jobs and idempotency indexes remain until explicit operational cleanup. Redis restart durability is NOT VERIFIED in this environment; the compose file declares volume `ojplatform-redis-data`, but runtime persistence was not inspected.

## 6. State machine / lease / attempts

Primary states: `QUEUED -> LEASED_FAKE -> SUCCEEDED_FAKE`, or `FAILED_RETRYABLE -> LEASED_FAKE`, or `FAILED_TERMINAL`; `CANCELLED` is reserved terminal. Claim increments `attempt` exactly once. A valid lease has owner, token, and future expiry. Completion/retry/terminal failure require the current token and unexpired lease. Expiry clears lease identity and requeues only retryable work; repeated recovery is idempotent. Compatibility aliases remain in the TypeScript union for existing Lead composition, but new queue writes use frozen names.

## 7. Recovery and races

In-memory mutations use a serialized critical section. Q03/Q06/Q10/Q18/Q19 use `Promise.all` concurrent calls and prove one logical job, one lease winner, one terminal effect, stale-token rejection, and cross-attempt isolation. Redis uses enqueue-before-index ordering, NX idempotency, and a claim lock; cross-process atomic transition qualification remains a Lead/runtime requirement.

## 8. Redis/API/runtime recovery

R01-R04 are BLOCKED: `docker` and `redis-cli` are unavailable on this host, so no real Redis interruption/reconnect/restart evidence is claimed. R05-R06 are BLOCKED at worker scope because API process lifecycle/composition is Lead-owned; the Redis repository is process-stateless and preserves state when Redis remains available. R07-R08 PASS only as `ABSTRACTION-LEVEL CRASH ONLY`: the lease can expire and recover, but no OS-process termination was executed. R09 is SHARED-OWNED/BLOCKED: inspected worker tests close clients they create and contain no compose down/stop/remove; the missing runtime prevents reproducing prior container exits.

## 9. No-source-execution and logging hard gate

`NoSourceExecutionGuard` is fail-closed for compile, execute, eval, shell, dynamic import, compiler/interpreter launch, and Sandbox operations. The fake worker accepts only named control fixtures and returns `SYNTHETIC_QUALIFICATION_ONLY`; it has no source parameter or execution primitive. `safeJudgeLog` emits only job id, submission id, state, attempt, and event, excluding source, lease tokens, credentials, and secrets. Tests use inert marker/syntax text and assert it is absent from serialized job/log output. No filesystem/network/source runtime APIs are imported by this module.

## 10. Malformed payload and immutable linkage

`assertPayload` rejects malformed JSON, unknown state, invalid attempts/timestamps, missing linkage, and missing lease metadata with `JudgeJobPayloadError`; it never defaults to success. Queue methods expose no update operation for immutable linkage. Q24-Q30 prove wrong job/token rejection and cross-job isolation in the in-memory repository.

## 11. Q01-Q30 matrix

| ID | TEST | SETUP / EXPECTED | ACTUAL / EVIDENCE | RESULT |
|---|---|---|---|---|
| Q01 | normal enqueue | valid submission -> one queued job | `judge-queue.test.ts` | PASS |
| Q02 | sequential duplicate | same key twice -> one id | same | PASS |
| Q03 | 20 concurrent duplicate enqueue | >=20 calls -> one id | `Promise.all(20)` | PASS |
| Q04 | 20 distinct enqueue | 20 ids, no cross-link | `Promise.all(20)` | PASS |
| Q05 | single claim | queued -> one lease | same | PASS |
| Q06 | concurrent claim race | 2 claimers -> one winner | `Promise.all` | PASS |
| Q07 | lease expiry | expired lease recoverable | timed lease | PASS |
| Q08 | stale recovery | stale token invalid, attempt 2 new lease | same | PASS |
| Q09 | valid completion | current token -> synthetic terminal | same | PASS |
| Q10 | duplicate completion race | one terminal effect | concurrent completion | PASS |
| Q11 | wrong token | reject | conflict assertion | PASS |
| Q12 | old token after recovery | reject | stale completion assertion | PASS |
| Q13 | retryable failure | requeue state | retry test | PASS |
| Q14 | retry increment | next claim attempt +1 | retry test | PASS |
| Q15 | retry cap | exhausted -> terminal | maxAttempts test | PASS |
| Q16 | terminal failure | no future claim | terminal assertion | PASS |
| Q17 | late stale completion | old worker cannot overwrite | stale test | PASS |
| Q18 | completion/expiry race | one convergent outcome | concurrent recovery/completion | PASS |
| Q19 | stale worker/new attempt | old retry rejected | concurrent race test | PASS |
| Q20 | attempt nondecreasing | no decrement | repository assertion | PASS |
| Q21 | terminal claim | terminal not claimable | assertion | PASS |
| Q22 | terminal requeue | no implicit requeue | assertion | PASS |
| Q23 | repeated recovery | second recovery no effect | count 1 then 0 | PASS |
| Q24 | stale retry | reject | conflict assertion | PASS |
| Q25 | wrong job/token pair | reject | cross-job assertion | PASS |
| Q26 | idempotency restart model | external index is authoritative | repository state test; Redis runtime blocked | PARTIAL |
| Q27 | post-reconnect operation | resume consistently | Redis runtime unavailable | BLOCKED |
| Q28 | unknown fixture | safe failure | fixture catalog guard | PASS |
| Q29 | immutable linkage | no mutation API | model/repository surface | PASS |
| Q30 | cross-job contamination | A cannot affect B | cross-job test | PASS |

## 12. R01-R10 matrix

| ID | TEST | EXPECTED | ACTUAL / EVIDENCE | RESULT |
|---|---|---|---|---|
| R01 | Redis unavailable before enqueue | controlled error/no success | no docker/redis-cli; real runtime unavailable | BLOCKED |
| R02 | disconnect during operation | controlled non-contradictory error | no runtime | BLOCKED |
| R03 | reconnect | resume/no duplicate | no runtime | BLOCKED |
| R04 | Redis restart | configured persistence fact + state | compose volume read; restart not executable | BLOCKED |
| R05 | API restart after enqueue | one job after restart | Lead-owned harness not available | BLOCKED |
| R06 | API restart during lease | lease semantics persist | Lead-owned harness not available | BLOCKED |
| R07 | worker crash after lease | recovery | abstraction-level lease expiry test | PASS (ABSTRACTION-LEVEL CRASH ONLY) |
| R08 | crash before ack | one terminal effect | abstraction-level fake worker test | PASS (ABSTRACTION-LEVEL CRASH ONLY) |
| R09 | container lifecycle | no premature teardown | no worker compose teardown found; runtime unavailable | BLOCKED / SHARED-OWNED |
| R10 | malformed payload | safe reject/no fabricated success | `assertPayload` test | PASS |

## 13. S01-S10 matrix

| ID | TEST | EXPECTED | ACTUAL / EVIDENCE | RESULT |
|---|---|---|---|---|
| S01 | no compile | zero compiler calls | no primitive/import; guard test | PASS |
| S02 | no execute | zero execution | no source input/primitive | PASS |
| S03 | no eval | zero eval | static guard/source scan | PASS |
| S04 | no shell | zero shell | static guard/source scan | PASS |
| S05 | no executable dynamic import | zero executable import | module imports only types/UUID | PASS |
| S06 | no process launch | zero launch | no child process API | PASS |
| S07 | no source filesystem side effect | none | source-free queue and guard test | PASS |
| S08 | no source network side effect | none | source-free queue and guard test | PASS |
| S09 | source body not logged | marker absent | `safeJudgeLog` marker assertion | PASS |
| S10 | synthetic labeling | never real verdict | explicit synthetic result kind/outcome | PASS |

## 14. Tests and integration requests

Executed: `pnpm lint` PASS; `pnpm typecheck` PASS; `pnpm test -- --run` PASS (11 files, 60 tests); `pnpm exec tsx tests/architecture/check.mjs` PASS; `pnpm build` PASS; `git diff --check` PASS.

INTEGRATION REQUEST: Lead must provide a real Redis-backed harness for R01-R04/R27, API process restart harness for R05-R06, and OS-process fake-worker termination for R07-R08; capture container names/status/exit codes/timestamps before and after lifecycle tests. Lead must also update the existing central status mapping from legacy `LEASED`/`COMPLETED`/`RETRYABLE_FAILURE` names to frozen `LEASED_FAKE`/`SUCCEEDED_FAKE`/`FAILED_RETRYABLE` names, without exposing real verdicts.

Dependency requests: none. No `0006` migration or queue framework was added.

## 15. Known limitations / final status

Redis operations still require runtime atomicity qualification beyond the existing minimal abstraction; no TTL/retention policy is configured; API/OS crash and Redis durability are not runtime verified. Final git status is expected clean after commit.

READY FOR LEAD REQUALIFICATION = NO
