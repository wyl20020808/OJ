# OJPlatform Phase 2C.6 Verdict Publication & Submission Integration V1

## Decision

**PHASE 2C.6 STATUS: PARTIAL**

The authoritative Submission evaluation model, immutable history boundary,
safe projection, Contest `SubmissionOutcome` adapter, retry/rejudge identity,
and publication integration are implemented. The full required real runtime
qualification matrix was not rerun in this Goal, so PASS is not claimed.

**PRODUCTION READY: NO**
**READY FOR NEXT JUDGE GOAL: NO**

## Provenance

- Branch: `codex/phase2c5-deterministic-verdict-foundation`
- Starting HEAD: `632109c7ab1d3f8098a9eb3467b9a2d44705fbfb`
- Final HEAD: `9c5673882c807a45dad717f77da354edc4dc728e`
- Commit: `9c56738` (`feat: integrate phase 2c6 submission verdict publication`)
- Phase 2C.5 baseline ancestor: `73537b6`
- Existing Phase 2C.5 report was read before implementation.
- `Docs/PROJECT_STATUS.md` was intentionally not modified.
- Existing untracked specification and qualification artifacts were preserved.

## Implemented Contract

Submission identity remains stable and separate from execution. Judge jobs now
carry `evaluationGeneration`; attempt/result generation remains distinct. A
Submission can retain immutable evaluation history while only one generation is
current. Retry stays within a generation; rejudge creates a new generation and
new queue idempotency identity.

`submission_evaluations` is introduced by migration `0006`; migration `0007`
expands the legacy Submission status constraint to the existing intake
lifecycle states required for authoritative publication. The repository
supports initial evaluation, terminal publication, current-pointer history,
safe history reads, rejudge creation, cancellation, duplicate idempotency, and
conflicting/stale publication rejection. PostgreSQL publication updates the
evaluation row and Submission status in one CTE statement. The in-memory
repository mirrors the same authority rules for tests.

Only `COMPLETED_WITH_VERDICT` may expose `AC`, `WA`, `CE`, `RE`, `TLE`, or
`MLE`. `CANCELLED`, `INFRA_FAILED`, `NO_VERDICT`, `INCOMPLETE`, stale, and
integrity failures remain non-verdict states. Publication consumes only a
Judge job already validated by the Phase 2C.5 repository and binds the
submission, generation, attempt, testcase-set/manifest metadata, verdict
digest, and evaluation digest.

## API and Product Boundary

Existing submission routes now project the authoritative safe evaluation.
`POST /api/submissions/:id/rejudge` uses the existing submission authorization
path and does not accept a client verdict or generation. `GET
/api/submissions/:id/evaluations` exposes safe history only. Public fields omit
source, expected output, stdout/stderr, lease or worker secrets, paths, queue
internals, cgroup facts, and raw infrastructure.

The versioned internal `SubmissionOutcome` adapter exposes only submission and
problem binding, language, current evaluation generation, terminal status,
optional authoritative verdict, and completion time. It does not calculate or
expose score, rank, penalty, solved count, or raw execution facts.

## SUBPUB Matrix Evidence

The focused Phase 2C.6 contract suite covers identity, all six verdict values,
non-verdict states, duplicate/conflicting publication, stale attempt and
generation rejection, retry generation behavior, rejudge history/current
projection, cancellation, authorization, safe projection, and outcome
boundary. Result: **5 tests passed**.

The required SUBPUB-01..100 matrix was not fully rerun as a real runtime
qualification in this Goal. Rows requiring fresh Redis, Worker crash/recovery,
API/repository restart, concurrent real races, and all real E2E scenarios are
therefore **NOT VERIFIED**, not converted to PASS.

## Regression and Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 340 passed / 4 opt-in skips
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- `pnpm integration`: PASS, 5/5 (real PostgreSQL/Redis/MinIO infrastructure)
- Judge Worker `go test ./...`: PASS
- Judge Worker `go vet ./...`: PASS
- Supervisor Linux WSL `GOFLAGS=-buildvcs=false go test ./...`: PASS
- Supervisor Linux WSL `GOFLAGS=-buildvcs=false go vet ./...`: PASS
- `git diff --check`: PASS

The migration runner includes `0006_submission_evaluation_history` and
`0007_submission_status_lifecycle`; both were applied successfully against the
local PostgreSQL instance. The Windows Supervisor invocation is not applicable to Linux syscall/cgroup
tests and failed at the expected platform boundary; the same gates passed in
Ubuntu WSL. Existing Phase 2B, 2C.4, and 2C.5 tests remain green through the
full TypeScript suite. Legacy cgroupfs-only diagnostics were not used as
evidence for this Goal.

## Security and Durability Limits

Client users cannot choose an evaluation generation or forge a verdict through
the public routes; rejudge/history use the existing owner authorization path.
The Contest adapter cannot consume Judge raw facts. No source execution path
was added by this Goal.

Qualified claims remain limited to the existing local development runtime and
the tests listed above. Production HA, Redis cluster failover, multi-machine
failover, disaster recovery, backup restore, multi-region durability, scoring,
ranking, contests, SPJ, interactive checking, OLE, subtasks, and Phase 2D are
not implemented or qualified.

## Residue and Final State

No Goal-owned Worker/Supervisor qualification process was started; the existing
shared PostgreSQL, Redis, and MinIO services were left running. The local
database migration, integration, and opt-in Redis tests completed without
teardown. Existing untracked artifacts remain untouched. The final tracked
worktree is verified after the scoped commit; `Docs/PROJECT_STATUS.md` remains
unchanged.

**CODE EXISTS: YES**
**FEATURE IMPLEMENTED: YES**
**FEATURE TESTED: YES (focused and regression tests)**
**FEATURE RUNTIME QUALIFIED: NOT VERIFIED for the full Phase 2C.6 matrix**
**PHASE 2C.6 STATUS: PARTIAL**
