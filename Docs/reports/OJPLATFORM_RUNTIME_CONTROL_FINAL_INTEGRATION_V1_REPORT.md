# OJPlatform Runtime Control Final Integration V1

Status: PASS

## Scope

This report records the controlled integration of Cross-Worktree Runtime
Control into `codex/final-feature-integration-v1`. It does not re-qualify
Product, Editor, Judge verdicts, SSE, or the existing
`REAL_EXECUTION_SET_INFRA_FAILURE`.

## Merge

`codex/cross-worktree-runtime-control-v1` was merged in full at `c529fc5`.
Its history includes `f4e2311`, `49a7a42`, and `ae57aa8`. The merge introduced
the checkout-independent registry at
`%LOCALAPPDATA%\OJPlatform\runtime\ojplatform-local` while retaining Final
Integration's `ojplatform-local` Compose project and infrastructure port
reconciliation.

## Focused validation

| Check | Evidence | Result |
| --- | --- | --- |
| PowerShell parse | Windows PowerShell 5.1 and pwsh parsers accepted `scripts/dev-runtime.ps1`. | PASS |
| Diff check | `git diff --check` passed. | PASS |
| Authoritative status | Final Integration status used Docker/container/host probes plus HTTP, listener, systemd, and Judge registry probes. | PASS |
| Normal stop | Final Integration stopped a Runtime created by another checkout; app ports were down and PostgreSQL, Redis, and MinIO remained healthy. | PASS |
| Cross-worktree status | Detached same-commit peer reported Final Integration processes as `RUNNING_OJPLATFORM_OTHER_CHECKOUT`. | PASS |
| Cross-worktree stop | Detached peer removed all Final Integration application listeners while preserving infrastructure. | PASS |
| Restart | Final Integration restart restored API, Web, Judge Service, Host Agent, Supervisor, and a `REAL_SANDBOXED_EXECUTION` Worker. | PASS |
| Stop -All | App listeners disappeared and the three Compose containers were `exited`. | PASS |
| Volume preservation | `ojplatform-postgres-data`, `ojplatform-redis-data`, and `ojplatform-minio-data` remained present. | PASS |
| Start after Stop -All | A stale Redis mapping was detected and targeted Redis recreation restored the canonical mapping; final Web, API, and Judge readiness checks returned HTTP 200. | PASS |

## Regression correction

The merged listener ownership path initially performed CIM command-line lookup
before checking the recorded PID, listener port, and process start time. A
transient unavailable CIM command line therefore caused a false ownership
refusal. The final Runtime Manager now accepts the recorded PID/port/start-time
triple first, and `stop -All` refuses infrastructure shutdown if application
ports remain listening. This preserves fail-closed behavior for unproven
listeners while preventing infrastructure from being stopped beneath retained
application processes.

## Final state

The final Runtime uses shared identity `ojplatform-local`. PostgreSQL, Redis,
MinIO, Product API, Web, Judge Service, Host Agent, Supervisor, and Worker are
running. Web `http://127.0.0.1:5173`, API
`http://127.0.0.1:3010/health`, and Judge readiness
`http://127.0.0.1:3100/ready` returned HTTP 200. No unrelated process, Docker
resource, named volume, or user artifact was altered.
