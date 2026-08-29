# Phase 2A Worker Lifecycle State Machine

Status: FROZEN FOR PHASE 2A IMPLEMENTATION

## Process States

`STARTING -> READY -> CLAIMING -> BUSY -> CLAIMING` is the healthy path. `BUSY` means one or more bounded `EXECUTING_SAFE_FIXTURE` jobs are active. Dependency failure transitions `READY`, `CLAIMING`, or `BUSY` to `DEGRADED`; no new jobs are claimed there. A successful reconnect and manifest/heartbeat publication transitions `DEGRADED -> READY`.

Shutdown transitions `READY|CLAIMING|BUSY|DEGRADED -> DRAINING -> STOPPING -> STOPPED`. `DRAINING` stops new claims immediately, continues bounded active safe-fixture work until completion/cancellation or its shutdown deadline, then stops heartbeat and exits. It never stops Redis, PostgreSQL, MinIO, API, Web, or another Worker. A forced crash is not a shutdown path and assumes no cleanup.

Invalid config, protocol incompatibility, disabled qualification mode, unavailable required Redis, non-positive concurrency, or missing Worker identity cause startup fail-closed: `STARTING -> STOPPED`, never `READY`.

## Per-Job States

`QUEUED -> LEASED -> WORKER_ACCEPTED -> SAFE_FIXTURE_RUNNING -> {SAFE_FIXTURE_SUCCEEDED | SAFE_FIXTURE_FAILED_RETRYABLE | SAFE_FIXTURE_FAILED_TERMINAL | CANCELLED}`. Queue storage continues to expose its Phase 1E state vocabulary; these are Worker protocol stages, not new database state.

Worker acceptance requires the current job, current attempt, unexpired lease, supported protocol, supported safe mode, compatible capability manifest, and a known control-owned fixture. Completion/retry/cancel uses the current lease proof only. A late result after recovery is rejected and cannot overwrite a newer attempt.

## Cancellation Resolution

| Situation | Resolution |
|---|---|
| Cancel before claim | Queue records `CANCELLED`; Worker never claims it. |
| Cancel after claim, before fixture start | Worker observes cancellation and submits `CANCELLED` with the current attempt. |
| Cancel during `FX-SLOW` or `FX-CANCEL` | Cooperative fixture checks cancellation at bounded checkpoints and submits `CANCELLED`. |
| Cancel races completion | Coordinator atomically resolves one current-lease transition; the loser is stale/duplicate and has no effect. |
| Cancel after terminal | Idempotent no-op/rejection; no requeue. |

## Crash and Restart

Crash assumes heartbeat stops and no result/cleanup is guaranteed. Lease expiry plus Phase 1E stale recovery returns an eligible job to retry/terminal according to its cap. A new process creates a new `worker_instance_id`, does not inherit old lease tokens, and may only claim a newly queue-authorized attempt.
