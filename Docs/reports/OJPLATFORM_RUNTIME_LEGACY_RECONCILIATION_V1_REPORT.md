# OJPlatform Runtime Legacy Reconciliation V1 Report

## Result

`PASS`

The local Runtime Manager now reconciles OJPlatform application listeners that
are absent from, or stale in, the shared runtime registry. It still refuses to
stop listeners whose ownership cannot be proved.

## Root Cause

Legacy runtime state was imported only when the shared registry did not exist.
Once a shared registry existed, a live process missing from that registry could
not be recovered from registered worktrees, legacy `.runtime/state.json`
records, or an exact OJPlatform service command. `stop` skipped the process and
the next `start` reported the occupied port as unknown.

## Implementation

- Discover known checkout roots through `git worktree list --porcelain`, plus
  the canonical `D:\OJPlatform` root. Paths are normalized before comparison.
- Resolve Windows application listener ownership with this precedence:
  shared PID + expected port + process start time; legacy PID + expected port +
  process start time + Node service identity; registered worktree + exact Node
  service command identity.
- Return explicit `PROVEN_OWNED`, `EXTERNAL`, `UNKNOWN`, `STALE_RECORD`, or
  `NOT_RUNNING` classifications.
- Reuse healthy proven listeners, stop unhealthy proven listeners before a
  canonical start, and refuse external or unknown listeners.
- Show unregistered proven listeners as `RUNNING_LEGACY_OJPLATFORM`.
- Require all application ports to be released before reporting stop success or
  stopping infrastructure with `-All`.

## Runtime Evidence

- Initial port 3180 owner: PID `39708`, `node.exe`, command
  `node --import tsx apps/judge-host-agent/src/server.ts`.
- Shared PID, port, and process start time matched; owner checkout was
  `D:\OJPlatform-worktrees\final-feature-integration`.
- Before the normal stop, all Judge nodes reported `activeJobs = 0`.
- Normal stop released ports 5173, 3010, 3100, 3180, and 19092 while PostgreSQL
  55432, Redis 56379, and MinIO 59000 remained reachable.
- A temporary Node listener with an exact registered OJPlatform Host Agent
  command identity and no shared entry was reported as
  `RUNNING_LEGACY_OJPLATFORM`; normal stop removed only its PID.
- A temporary unrelated Node listener was reported as
  `BLOCKED_BY_EXTERNAL_OWNER` / `EXTERNAL`; stop refused it and the final port
  guard failed closed. The test listener was then stopped through its own test
  process session.
- Runtime `start` passed after installing the task worktree's lockfile-pinned
  dependencies. A second `start` reused infrastructure, Supervisor, Judge
  Service, Product API, Host Agent, Worker, and Web without duplicates.

## Validation

- Focused ownership tests: PASS on Windows PowerShell 5.1 and PowerShell 7.
- PowerShell parser: PASS on Windows PowerShell 5.1 and PowerShell 7.
- Legacy status and exact stop scenario: PASS.
- External listener preservation and fail-closed stop guard: PASS.
- Idempotent runtime start: PASS.
- Root BAT entrypoint wiring for Start, Stop, Restart, and Status: PASS.
- `git diff --check`: PASS.
- PostgreSQL, Redis, and MinIO data volumes were preserved.
- No unrelated process or user artifact was modified.

## Scope

Only Runtime Manager ownership/reconciliation logic, its focused regression
test, this report, and the project status entry changed. Product, Web, Editor,
Judge behavior, database data, Docker volumes, and unrelated artifacts were not
changed.
