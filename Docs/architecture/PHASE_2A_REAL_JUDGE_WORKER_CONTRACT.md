# Phase 2A Real Judge Worker Contract

Status: FROZEN FOR PHASE 2A IMPLEMENTATION

## Boundary

The Judge Worker is an independently built and run Go process/service. It is never embedded in the Node.js API, Web process, PostgreSQL, Redis, or Plugin Host. It consumes the existing Phase 1E Redis Judge Queue; it does not introduce a second queue or queue framework.

`APP_DB_ACCESS = FORBIDDEN`. Worker configuration and source must not contain an Application PostgreSQL connection string, credential, driver, or repository. Immutable execution data reaches the Worker only in a validated Execution Request through the public Judge Protocol and, in a future approved phase, approved object references.

## Protocol and Queue

Phase 2A supports protocol version `2A.1` exactly. An unknown, missing, or incompatible version is rejected before claim acceptance or fixture execution. The existing queue remains authoritative for idempotency, current lease token/attempt validation, retry, terminalization, cancellation, and stale lease recovery. Delivery remains at-least-once.

The Worker claims with `worker_instance_id`, processes only a matching current lease, and submits one Result per `(judge_job_id, attempt)`. Stale, duplicate, wrong-job, wrong-attempt, or expired-lease results are rejected or converge safely at the coordinator. A restarted Worker never resumes ownership of an old lease; expiry and Phase 1E stale recovery decide recovery.

## Identity and Capabilities

`worker_id` is stable logical operator configuration (for example `local-judge-worker`). `worker_instance_id` is a fresh random UUID generated at every process start. The pair must be unique among live instances.

Startup publishes a safe capability manifest:

| Field | Phase 2A value |
|---|---|
| protocol_version | `2A.1` |
| worker_id / worker_instance_id | required |
| build_version | required build identifier |
| execution_modes | `SAFE_FIXTURE_QUALIFICATION` only |
| safe_fixture | `true` |
| max_concurrency | configured positive bounded integer |
| language_capabilities | empty; C++, Python, Java NOT QUALIFIED |
| sandbox_capability | `false` / unqualified |

Capability mismatch is a fail-closed `WORKER_CAPABILITY_MISMATCH`; `REAL_SANDBOXED_EXECUTION` is disabled and rejected.

## Concurrency, Heartbeat, and Logs

Default max concurrency is `1`; configuration may select a positive bounded value up to a Lead-frozen deployment maximum. The claim loop does not claim while active work equals the bound or while draining. Each accepted job counts as active until one terminal/retry/cancel result is submitted or its lease is deliberately left for recovery.

The Worker emits a safe worker heartbeat every 5 seconds. Liveness is stale after 15 seconds without a heartbeat. Payload is limited to worker/instance identity, protocol/build, capability summary, process state, active count, timestamp, and correlation identifiers. It must not include source, session material, Redis credential, database credential, arbitrary environment values, or raw lease tokens. Reconnect changes state to `DEGRADED`; successful validated reconnect returns it to `READY` and resumes claiming only after heartbeat publication.

Logs are structured and may contain IDs, state, fixture ID, outcome category, and safe diagnostic code. They must not contain source body, credentials, session tokens, Redis URLs, raw lease tokens, or arbitrary request environment data.

## Security Invariants

SEC2A-01 through SEC2A-10 are mandatory:

1. No real user-code executor is enabled.
2. Compiler adapters are unreachable from safe-fixture mode.
3. Interpreter/runtime adapters are unreachable from safe-fixture mode.
4. Execution Requests contain no arbitrary command.
5. Execution Requests contain no user-controlled executable path.
6. Worker configuration contains no Application DB credential.
7. Worker never directly connects to Application PostgreSQL.
8. Worker logs exclude source body.
9. No arbitrary Submission environment injection is accepted.
10. `REAL_SANDBOXED_EXECUTION` fails closed.

The future boundary is `Judge Worker -> Sandbox Execution Adapter`. The adapter is absent, disabled, and unqualified in Phase 2A. This contract makes no network or filesystem isolation claim.
