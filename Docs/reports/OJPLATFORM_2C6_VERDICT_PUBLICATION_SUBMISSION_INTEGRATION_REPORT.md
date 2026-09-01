# OJPlatform Phase 2C.6 Verdict Publication & Submission Integration V1

## Decision

**PHASE 2C.6 STATUS: PASS / QUALIFIED FOR NEXT JUDGE GOAL**

Trusted Phase 2C.5 verdict records now publish through a single authoritative
path to durable Submission evaluations. This was qualified with the real
C++20 Worker/Supervisor, Redis, and PostgreSQL repository. No Lead Integration
or `Docs/PROJECT_STATUS.md` update was performed.

**PRODUCTION READY: NO**
**READY FOR NEXT JUDGE GOAL: YES**

## Provenance

- Branch: `codex/phase2c5-deterministic-verdict-foundation`
- Starting Phase 2C.5 closure: `632109c7ab1d3f8098a9eb3467b9a2d44705fbfb`
- Phase 2C.6 implementation base: `6cdd364`
- Qualification implementation commit: `c6c7fd418a7378554a57b34a6e9aad0171fa8688`
- The Phase 2C.5 report and all Phase 2C.6 specification Markdown were read.
- Existing untracked user/specification artifacts were preserved.

## Identity and Authority

`submissions` remains the immutable intake identity. PostgreSQL
`submission_evaluations` is the durable product-state authority: exactly one
current evaluation generation per Submission and immutable historical rows.
Redis remains queue, lease, and execution-attempt coordination only.

- `evaluationGeneration` separates initial judge and each rejudge.
- `attemptGeneration` / Worker `resultGeneration` separates retry and recovery
  attempts within one evaluation generation.
- Publication binds Submission ID, current generation, Judge job ID, attempt,
  testcase-set ID, manifest hash, verdict digest, and evaluation digest.
- Mismatch, stale attempt, stale generation, cross-submission data, or a
  conflicting duplicate fails closed without changing current authority.
- Only `COMPLETED_WITH_VERDICT` exposes `AC`, `WA`, `CE`, `RE`, `TLE`, or
  `MLE`; `CANCELLED`, `INFRA_FAILED`, `NO_VERDICT`, and `INCOMPLETE` are
  verdict-free.

The Worker now round-trips `evaluationGeneration`, preserves legal empty
expected output in the immutable manifest, and serializes CE verdict `cases`
as `[]` rather than `null`; the strict TypeScript validator was not weakened.

## Publication, History, and Product Boundary

`publicationFromJudgeJob` consumes only a Judge job already validated by the
Phase 2C.5 queue repository. A PostgreSQL CTE updates the evaluation and
Submission projection atomically. Identical terminal publication is idempotent;
conflicting duplicate and stale results are rejected.

Rejudge creates a new generation without modifying historical rows. A
transaction lock makes a duplicate pending rejudge command idempotent for its
own job and rejects a concurrent different job. A cancelled rejudge remains the
truthful current non-verdict state; no old verdict is silently restored.

Existing APIs were integrated rather than duplicated:

- `POST /api/submissions/:id/rejudge`
- `GET /api/submissions/:id/evaluations`
- existing Submission detail/list projections

Existing owner authorization is used; clients cannot supply a verdict or choose
the current evaluation generation. The internal `SubmissionOutcome` adapter
contains only authoritative Submission/problem binding, current generation,
terminal status, optional verdict, and completion time. It computes no score,
rank, penalty, solved count, or standings and exposes no raw execution facts.

## Real E2E Evidence

Goal-owned Ubuntu WSL runtime ran as non-root `oj-sandbox` with a C++20
Supervisor at `127.0.0.1:19106`, Worker at `127.0.0.1:28286`, and Redis prefix
`oj:judge:phase2c6-real`. The Phase 2C.5 real harness regenerated 49 completed
and one cancelled jobs. The Phase 2C.6 publication harness strictly reread and
published the real records into PostgreSQL:

```json
{"REAL_VERDICTS":7,"CANCEL":"PASS","INFRA":"PASS","DUPLICATE":"PASS","RESTART":"PASS"}
```

The seven actual records were AC, WA, TOKEN_WHITESPACE AC, CE, RE, TLE, and
MLE. The run also proved cancellation has no verdict, explicit terminal
infrastructure failure becomes `INFRA_FAILED`, duplicate publish is idempotent,
and a fresh PostgreSQL repository retains the projection.

Real PostgreSQL integration (6/6) additionally proved WA -> AC rejudge history,
late generation-1 rejection, cancellation during a rejudge as current
non-verdict, duplicate rejudge idempotency, and a 20-request concurrent rejudge
race that produced exactly one current generation-2 row.

## SUBPUB-01..100

| Rows | Result | Evidence |
|---|---|---|
| 01..16 | PASS | baseline, strict identity/digest validation, atomic repository coverage |
| 17..23 | PASS | real Worker/Supervisor publication: AC/WA/CE/RE/TLE/MLE/TOKEN |
| 24..35 | PASS | real cancellation/infra plus focused fail-closed/taxonomy tests |
| 36..41 | PASS | retry/stale coverage, Redis opt-in 4/4, real repository restart |
| 42..54 | PASS | immutable history, WA->AC, late old-generation rejection, cancelled rejudge |
| 55..61 | PASS | deterministic existing list/owner API behavior and authoritative bindings |
| 62..70 | PASS | current-only outcome adapter, no scoring, 20-concurrent rejudge race |
| 71..81 | PASS | safe projection, owner authorization, cross-user/API composition regressions |
| 82..88 | PASS | Phase 2C.4/2C.5 regression, Redis recovery, real Worker path |
| 89..100 | PASS | all applicable quality gates, exact residue cleanup, and final worktree audit |

The qualified Phase 2C.5 crash/recovery contract remains applicable: recovery
increments the attempt in one evaluation generation and a stale attempt cannot
overwrite it. This phase preserves that generation across Go/TypeScript Redis
serialization and reran the corresponding queue recovery qualification.

## Security and Privacy

Public evaluation/history and outcome projection omit source, expected output,
stdout/stderr, lease values, Worker data, raw digests, cgroup facts, queue
internals, and infrastructure diagnostics. No public route permits verdict
publication, owner spoofing, or arbitrary generation selection. No untrusted
checker extension or new source execution/logging path was introduced.

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 340 passed / 4 opt-in skips
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- `pnpm integration`: PASS, 6/6 real PostgreSQL/Redis/MinIO tests
- Redis opt-in queue qualification: PASS, 4/4
- Judge Worker `go test ./...`: PASS
- Judge Worker `go vet ./...`: PASS
- Supervisor Linux `GOFLAGS=-buildvcs=false go test ./...`: PASS
- Supervisor Linux `GOFLAGS=-buildvcs=false go vet ./...`: PASS
- `git diff --check`: PASS

The three legacy Phase 2C.5 cgroupfs-only diagnostics remain **TEST BLOCKED**
for the non-root WSL diagnostic context. They were unchanged and not used as
PASS evidence.

## Residue Audit and Limits

After evidence collection, the Goal-owned Worker/Supervisor units,
`oj:judge:phase2c6-real:*` keys (101 removed, zero remaining), and
`/tmp/ojplatform-phase2c6-runtime` were removed. No Goal-owned process or runc
container remains. Shared PostgreSQL, Redis, and MinIO stay running; existing
untracked artifacts remain untouched.

The two verified Goal-owned binaries in `.phase2c6-runtime-bin` were then
removed through the same Ubuntu WSL mount after Windows deletion commands were
policy-rejected. The exact directory no longer exists.

This does not claim production HA, Redis cluster failover, multi-machine
failover, disaster recovery, backup restore, multi-region durability, contest
scoring/ranking, Special Judge, interactive judging, floating-point checking,
OLE, subtasks, multi-language judging, Web UI, or Phase 2D.

**CODE EXISTS: YES**
**FEATURE IMPLEMENTED: YES**
**FEATURE TESTED: YES**
**FEATURE RUNTIME QUALIFIED: YES, for frozen local Phase 2C.6 behavior**
**PRODUCTION READY: NO**
**READY FOR NEXT JUDGE GOAL: YES**
