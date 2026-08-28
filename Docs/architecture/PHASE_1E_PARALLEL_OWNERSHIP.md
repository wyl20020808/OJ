# PHASE 1E Parallel Ownership

## Worker A: Judge Authz

Owns Auth-facing policy checks, job visibility, privileged enqueue/retry/cancel/inspect authorization, audit hooks and tests. It must not modify queue backend, migration registry, central bootstrap, or execute source.

## Worker B: Judge Queue

Owns JudgeJob domain, persistence, the allocated `0006` migration if needed, Redis adapter, enqueue/claim/lease/retry/complete behavior, submission linkage, deterministic fake plumbing and tests. It must not execute source or modify Auth internals.

## Worker C: Judge Status UI

Owns Web status/history/detail/diagnostic UX and browser tests. It must use public APIs only and must not display fake outcomes as real verdicts.

## Lead-only

Lead owns shared contracts, central API/route composition, migration registry/runner, shared config, cross-module wiring, real PostgreSQL/Redis qualification, browser E2E, `Docs/PROJECT_STATUS.md`, CI shared workflows and final reports. Workers publish permanent reports and never edit PROJECT_STATUS. Shared-file changes are Integration Requests.

