# OJPlatform Phase 2A Real Judge Worker Runtime Report

## 1. Status

`PARTIAL`: the independent Go Worker, frozen 2A.1 protocol, existing Phase 1E Redis queue adapter, safe fixtures, lifecycle, real Redis qualification, and real process-level tests are implemented and pass. Shared API/control composition, heartbeat registry, authoritative cancellation control, and Lead-owned full runtime rows remain integration work. No submitted source was executed.

## 2. Worktree / branch

Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
Branch: `codex/phase2a-worker-runtime`

## 3. Baseline / provenance

Common baseline: `6cd4b7c72767714b7c31864ecea87b657a9dba77`. The worktree was clean before edits; current HEAD was exactly the approved baseline, so ancestry is PASS. No intermediate commits existed at start.

## 4. Starting HEAD

`6cd4b7c72767714b7c31864ecea87b657a9dba77`

## 5. Final HEAD

Recorded after the scoped implementation commit in the final response.

## 6. Commits

One scoped commit is created for this Worker implementation and report. No merge, history rewrite, or Lead Integration was started.

## 7. Files changed

Only `apps/judge-worker/**` and this report are changed. The Go module has no third-party dependency. Root package manifests, lockfiles, shared contracts, migrations, Auth, Web, API composition, and `PROJECT_STATUS` are unchanged.

## 8. Existing repo reuse

The Worker reuses the frozen Phase 1E Redis key vocabulary (`oj:judge:job:<id>`, submission index, queue list, `LEASED_FAKE`, `SUCCEEDED_FAKE`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`, `CANCELLED`) and its lease/token semantics. It does not create a second queue or access the application database.

## 9. Go Worker architecture

`cmd/judge-worker` is a real independent process. `internal/config` validates environment; `internal/protocol` validates 2A.1 requests/results and capabilities; `internal/queueadapter` is a minimal RESP client plus Phase 1E Queue adapter; `internal/fixture` is the bounded in-process qualification executor; `internal/worker` owns lifecycle, claim loop, bounded active count, health/readiness, heartbeat, cancellation observation, drain, and result mapping.

## 10. Config

Validated values are `REDIS_URL`, `QUEUE_PREFIX` (default `oj:judge`), stable `WORKER_ID`, `BUILD_VERSION`, `MAX_CONCURRENCY` (1..64), `HEARTBEAT_INTERVAL_MS`, `LEASE_MS` (50..300000), `SHUTDOWN_TIMEOUT_MS`, and localhost `HEALTH_ADDR`. No `DATABASE_URL`, DB driver, credential, arbitrary environment map, command, or executable path exists in Worker config.

## 11. Identity / instance model

`worker_id` is stable configured identity. `worker_instance_id` is a fresh cryptographically random 128-bit hex identifier per process. The real process harness starts separate binaries and verifies distinct instance IDs; a restarted process never inherits an old token.

## 12. Capability manifest

The manifest reports protocol `2A.1`, build version, worker/instance IDs, `SAFE_FIXTURE_QUALIFICATION` only, `safe_fixture=true`, `REAL_SANDBOXED_EXECUTION=false`, `sandbox_qualified=false`, empty language capabilities, and bounded max concurrency. Capability mismatch fails closed.

## 13. Protocol versioning

Requests and results require exact `2A.1`. `DecodeRequest` uses `DisallowUnknownFields`; malformed, missing, future, or incompatible fields reject. REAL mode and unknown fixture selectors reject before fixture execution.

## 14. Execution Request implementation

The validator checks identity, positive attempt, immutable revision/testdata/language references, opaque source snapshot reference, SHA-256 format, positive limits, future deadline, non-negative cancellation generation, exact safe mode, allowlisted fixture, and capabilities. Source body is not an accepted request field. Unknown fields such as command, executable path, arbitrary environment, DB/Redis credentials, or session token are rejected.

## 15. Execution Result implementation

`ExecutionResult` contains the required 2A.1 correlation, worker identity, attempt, timestamps, execution stage, synthetic marker, allowed outcome, diagnostic code/message, and correlation ID. Only `SAFE_FIXTURE_SUCCEEDED`, `SAFE_FIXTURE_FAILED_RETRYABLE`, `SAFE_FIXTURE_FAILED_TERMINAL`, `CANCELLED`, `WORKER_PROTOCOL_ERROR`, and `WORKER_CAPABILITY_MISMATCH` are accepted. Real verdict names and non-synthetic results are rejected. Raw lease tokens are never in results/logs.

## 16. Queue claim loop

The real process claims from the existing Redis list only while ready and below `MAX_CONCURRENCY`. Polling is bounded with backoff; Redis errors transition to `DEGRADED`, suppress new claims, and reconnect before returning to `READY`/`CLAIMING`. Claim invokes stale lease recovery under the same mutation lock.

## 17. Lease handling

Claim records `worker_instance_id`, random token, expiry, and increments attempt once. Complete/retry/terminal/cancel require the current unexpired token. Stale recovery clears lease identity and requeues or terminalizes at the cap. Restarted Workers do not reuse old leases.

## 18. Heartbeat / liveness

The Worker emits an immediate safe heartbeat and periodic heartbeat (default five seconds) containing only identity, protocol/build, lifecycle state, capability, max concurrency, active count, and safe metadata. Heartbeat stops on shutdown. A shared server-side registry is not present in the frozen public contract; registry visibility is an Integration Request, not a direct DB/API workaround.

## 19. Bounded concurrency

The claim loop checks the atomic active count before claiming, and decrements only after terminal/retry/cancel handling. DRAINING closes the claim gate immediately. Config rejects non-positive or >64 concurrency. Unit config/lifecycle tests and the real two-process harness cover the bound at the process boundary.

## 20. Safe fixture executor

`FX-SUCCESS`, `FX-RETRYABLE`, `FX-TERMINAL`, `FX-SLOW`, and `FX-CANCEL` are deterministic, bounded, in-process operations. Fixture selection comes only from validated control metadata and never from source contents. There is no compiler, interpreter, shell, dynamic loader, filesystem mutation, arbitrary network, or Sandbox adapter.

## 21. Cancellation

Worker-local cancellation observation is implemented with per-job contexts and cooperative fixture checkpoints; cancellation maps to queue `CANCELLED` and repeated terminal cancellation is idempotent. The authoritative public cancel signal/control endpoint is absent from the Worker-owned contract, so before-claim and coordinator race qualification require the Auth/Lead integration request below.

## 22. Graceful drain

SIGINT/SIGTERM stops claims, enters `DRAINING`, allows bounded active fixtures to complete or cooperatively cancel within `SHUTDOWN_TIMEOUT_MS`, then stops heartbeat/health and closes only the Worker Redis connection. It never stops shared Redis/PostgreSQL/MinIO. `stopOnce` prevents duplicate shutdown close.

## 23. Crash / restart

The process harness sends SIGKILL to a Worker after a real lease, starts a new Worker with a new instance ID, waits for lease expiry, and verifies the second process recovers and completes the job. No cleanup is assumed for SIGKILL. Graceful restart uses bounded drain and does not inherit old authority.

## 24. Multi-worker behavior

Two independent real binaries use separate health ports and identities against the same Redis queue. A single job has one authoritative lease winner; after the first process dies, the second continues. Instance IDs are asserted distinct and no duplicate terminal state is produced.

## 25. No-source-execution instrumentation

Static audit found `os/exec` only in `process_test.go`, where it launches the Worker binary and `go build`; submitted source is never included in command, executable, or args. Production Worker code has no process-launch API, compiler, interpreter, shell, dynamic import, DB client, or Sandbox path. Protocol tests use inert strings such as `system`, `os.system`, `eval`, and `<script>` only as data.

## 26. JW01-JW10

| IDs | Evidence | Result |
|---|---|---|
| JW01-JW02 | config tests; real binary startup/readiness | PASS |
| JW03-JW04 | degraded startup behavior and reconnect loop; real Redis process run | PASS |
| JW05 | cryptographic instance IDs; two-process test | PASS |
| JW06-JW07 | immediate/periodic safe heartbeat and shutdown stop path | PASS (Worker-local) |
| JW08 | drain closes claim gate | PASS |
| JW09-JW10 | SIGKILL lease recovery and new instance process test | PASS |

## 27. JP01-JP08

All eight protocol rows PASS: exact `2A.1`, unsupported/malformed rejection, REAL mode/capability rejection, validated result envelope, duplicate-safe Queue authority, and unknown fixture rejection.

## 28. JQ01-JQ12

| IDs | Evidence | Result |
|---|---|---|
| JQ01-JQ08 | real Redis claim, fixture success/retry/terminal, stale lease, two-process restart | PASS |
| JQ09 | no claim for a pre-cancelled Queue record is not end-to-end available | READY_FOR_LEAD |
| JQ10-JQ11 | local cooperative cancellation and queue current-token rules; authoritative signal missing | READY_FOR_LEAD |
| JQ12 | process SIGTERM drain path and bounded active handling | PASS (Worker-owned) |

## 29. JH01-JH05

JH01, JH02 (no lease renewal invented), JH04, and JH05 pass at Worker-local payload/reconnect scope. JH03 stale timeout is explicit in lease expiry and liveness intervals. Shared heartbeat registry visibility remains READY_FOR_LEAD.

## 30. JS01-JS10

All ten security rows PASS: source marker does not affect fixture, no compiler/interpreter/shell/dynamic user import, REAL mode rejected, logs omit source, arbitrary executable path and unknown fields reject, no app DB config/connection exists, and fixtures are deterministic.

## 31. JR01-JR08 Worker-owned results

JR02, JR04, JR05, JR06, and JR08 have Worker/process or local runtime evidence. JR01, JR03, and JR07 require Lead API/Web/WSL orchestration and are `READY_FOR_LEAD`, not mock PASS. The Worker itself does not stop shared services.

## 32. Tests / commands / counts

Go: `gofmt`, `go test ./...` PASS; `go vet ./...` PASS; real process qualification with `OJPLATFORM_WORKER_PROCESS_TEST=true` PASS for independent startup/claim/shutdown and two-worker SIGKILL recovery. Repository: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (13 files, 114 passed, 3 intentionally skipped), `pnpm test:architecture`, `pnpm build`, and `git diff --check` PASS.

## 33. Real Redis / process evidence

Redis ran as Compose `redis:7.4.1-alpine` with named volume `ojplatform-redis-data`, reached healthy state through WSL Docker Engine, and was accessed by the Go RESP adapter at `127.0.0.1:56379`. Process tests built and launched real independent Go binaries, checked local `/ready`, observed Redis terminal state, sent SIGTERM/SIGKILL, and verified recovery. No mock-only claim is used for Redis reconnect, multi-worker race, process restart, or crash recovery.

## 34. Logs / security evidence

Heartbeat/state logs are JSON-safe metadata only. No source body, lease token, Redis URL, DB credential, session material, arbitrary environment, or real verdict is emitted. Static search confirms App DB access and production execution primitives are absent from production Worker code.

## 35. Integration Requests

| ID | Blocker / evidence | Lead-owned change | Blocked rows |
|---|---|---|---|
| IR-2A-01 | No public heartbeat registry/control contract; Worker heartbeat is local log only | Add authenticated Worker registration/heartbeat visibility contract or adapter | JH visibility, JR01/JR03/JR07 |
| IR-2A-02 | Queue/API has no authoritative cancellation signal and central cancel composition | Expose current-generation cancel query/event and current-lease cancel transition | JQ09-JQ11, JU cancellation rows |
| IR-2A-03 | API composition currently owns Submission->Queue request construction and status projection | Supply 2A.1 request/result bridge and frozen Worker capability/status mapping | JR01/JR03, end-to-end JQ |
| IR-2A-04 | Lead runtime owns WSL keepalive and full service lifecycle | Run API+Redis+Worker lifecycle and browser/runtime qualification with tracked PIDs | JR01/JR03/JR07/JR08 |

## 36. Dependency Requests

None. Go standard library only; no root dependency, queue framework, migration, compiler, runtime, or Sandbox dependency was added.

## 37. Limitations

No real sandboxed execution, compiler/interpreter, real verdict, App DB access, HA Redis, lease renewal (not frozen), server heartbeat registry, authoritative public cancellation, or full Lead orchestration is claimed. The RESP adapter is intentionally minimal and should remain behind the Lead-approved queue boundary. Local RDB/process evidence is qualification evidence, not production durability qualification.

## 38. Git status

Final tracked worktree is clean after the scoped commit. No merge, Lead Integration, Sandbox, compiler/runtime, Phase 2B, or `PROJECT_STATUS` change was started.

## 39. READY FOR LEAD INTEGRATION

`READY FOR LEAD INTEGRATION = NO` pending IR-2A-01 through IR-2A-04 and Lead-owned JR/JQ cancellation qualification.
