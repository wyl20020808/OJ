# PHASE 1E Judge Protocol & Queue Contract

This Lead-owned contract freezes the Phase 1E boundary. Workers must request changes through the integration request file.

## Public Job Model

`JudgeJob` contains a stable job id, submission id, problem revision id, testdata version reference, language id, attempt number, lifecycle state, idempotency key, retry count/max attempts, created/leased/completed timestamps, lease owner and correlation/request ids. It contains metadata only; source is never executed or transported to a judge runtime by this foundation.

States are `QUEUED -> LEASED_FAKE -> SUCCEEDED_FAKE | FAILED_RETRYABLE | FAILED_TERMINAL`; `CANCELLED` is terminal. A stale lease is requeued when its visibility timeout expires. Completion and enqueue are idempotent by job id/idempotency key. Delivery is at-least-once, never exactly-once; persistence effects must tolerate duplicates. Terminal jobs are retained for inspection/dead-letter handling.

## Queue Semantics

Enqueue persists before publication. Claim atomically records a lease and visibility deadline. A worker acknowledges only a matching leased attempt. Retry increments attempt metadata and requeues; exhausted retries become terminal. Restart of API, Redis, or a fake worker must recover durable state without losing or duplicating a job. Correlation, request, job, submission and attempt ids are observable in structured metadata.

The backend is the existing minimal Redis/ioredis abstraction plus PostgreSQL persistence where required. No BullMQ, RabbitMQ, Kafka, or new queue framework is introduced. If schema persistence is needed, the single allocated migration is `0006_judge_job_queue_foundation`; the migration registry and runner remain Lead-owned.

## Fake Qualification Boundary

The fake judge accepts only deterministic, safe control/fixture input. It must never read, compile, import, eval, shell, or execute user source. Synthetic outcomes are explicitly marked `FAKE` and must never be presented as real AC/WA/TLE/MLE verdicts or used for production scoring.

## Security and Authorization

Judge Worker and queue code have no direct Application PostgreSQL access. Authz uses the public authorization policy/AuthContext boundary. Raw credentials, session tokens, source, and secrets are excluded from logs and error payloads. Privileged enqueue/retry/cancel/inspect operations are policy-controlled. API remains stateless; durable job state is externalized.

