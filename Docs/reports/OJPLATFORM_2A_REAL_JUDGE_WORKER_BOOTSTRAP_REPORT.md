# OJPlatform Phase 2A Real Judge Worker Foundation Bootstrap Report

Goal: `OJPLATFORM-2A-REAL-JUDGE-WORKER-FOUNDATION-BOOTSTRAP`
Date: 2026-08-29
Status: PASS / BOOTSTRAPPED

## Baseline and Scope

Starting HEAD was approved Phase 1E closure `11bc091`. Phase 1E final status remains PASS and Phase 1E-R remains CLOSED. Common Bootstrap commit is `6cd4b7c72767714b7c31864ecea87b657a9dba77` (`docs: bootstrap phase 2A judge worker foundation`). This Bootstrap freezes contracts and work ownership only; it does not implement a Worker, Sandbox, compiler, runtime adapter, real verdict, Contest, or submitted-source execution.

Final Lead HEAD at Bootstrap closure report recording: `113a28c54a4ab139ac255c68112df2599b4b140a`.

Go tooling was verified/installed as `go1.27.0 windows/amd64`. No Go module or Worker code was created in this Bootstrap.

## Frozen Architecture

The future Phase 2A Worker is an independently built Go process/service, never part of the Node API process. It consumes the existing Phase 1E Redis Judge Queue and does not introduce a second queue. `APP_DB_ACCESS = FORBIDDEN`: Worker configuration, code, and runtime have no Application PostgreSQL credential, client, repository, or direct database connection.

The frozen public protocol is `2A.1`. Supported requests require immutable job/submission/attempt/problem revision/testdata/language linkage, correlation ID, opaque source snapshot reference/hash, contract-only limits, explicit execution mode, fixture ID, and cancellation/deadline metadata. Unsupported/malformed versions, requests, immutable references, fixtures, execution modes, or capabilities fail closed.

The Worker identifies with a configured stable `worker_id` and a fresh random `worker_instance_id` on every process start. Its capability manifest permits `SAFE_FIXTURE_QUALIFICATION` only, reports bounded configured concurrency and build/protocol version, has empty language capabilities, and reports Sandbox capability false/unqualified. C++, Python, Java, and real Sandbox support are not qualified.

## Lifecycle and Safety

Lifecycle, heartbeat, liveness, bounded concurrency, graceful drain, crash/restart, and cancellation rules are frozen in the lifecycle contract. Default concurrency is one and no implementation may claim beyond a positive configured bound. A Worker stops new claims when draining, handles bounded active safe work, preserves lease recovery semantics, stops its heartbeat, and exits without stopping Lead-owned infrastructure. Crash assumes no cleanup; lease expiry/stale recovery governs work recovery and a restart never owns an old lease.

Safe heartbeats use identities, build/protocol/capability summary, state, active count, timestamp, and safe correlation IDs only. Source, credentials, session material, Redis URLs, database credentials, and raw lease tokens are prohibited.

Cancellation is explicit: cancellation before claim terminalizes without a Worker claim; cancellation after claim/during a cooperative fixture resolves as `CANCELLED`; completion/cancel races accept exactly one current-lease transition; post-terminal cancellation has no requeue effect.

The safe fixture executor provides only deterministic bounded internal fixtures `FX-SUCCESS`, `FX-RETRYABLE`, `FX-TERMINAL`, `FX-SLOW`, `FX-CANCEL`, and optional harness-owned `FX-CRASH-BOUNDARY`. Fixture selection is control-owned and cannot inspect source. No fixture executes/imports/evaluates source, launches a compiler/interpreter/shell/subprocess, or creates arbitrary source-driven filesystem/network effects.

SEC2A-01 through SEC2A-10 are frozen: real executor disabled; compiler/interpreter paths unreachable; no arbitrary command, executable path, environment, source log, DB credential, or direct App DB; real execution mode fails closed. The future Sandbox adapter is absent, disabled, and unqualified.

## Runtime Topology and Qualification

The local topology is Web -> API -> PostgreSQL/Redis/MinIO with a separate Worker consuming Redis and a Lead-owned safe-fixture harness. It reuses the scoped API/process lifecycle and WSL keepalive lessons from Phase 1E. Worker health, if later exposed, must bind locally and never provide arbitrary execution control. Worker shutdown never stops Redis, PostgreSQL, MinIO, API, Web, or peer Workers.

The qualification matrix freezes all required JW01-JW10, JP01-JP08, JQ01-JQ12, JH01-JH05, JS01-JS10, JR01-JR08, and JU01-JU10 rows with Owner, Setup/Expected, Actual, Evidence, and PASS/FAIL fields. Every row is PENDING implementation evidence; Bootstrap does not claim Phase 2A qualification completion.

## Parallel Ownership and Branch Rotation

No new worktrees were created. Existing clean permanent worktrees were retained and rotated without force/reset/clean:

| Slot | Permanent path | Branch | Starting HEAD | Status |
|---|---|---|---|---|
| Auth | `D:\OJPlatform-worktrees\phase1b-authz` | `codex/phase2a-worker-authz` | `6cd4b7c72767714b7c31864ecea87b657a9dba77` | clean |
| Backend | `D:\OJPlatform-worktrees\phase1b-problem-authoring` | `codex/phase2a-worker-runtime` | `6cd4b7c72767714b7c31864ecea87b657a9dba77` | clean |
| Web | `D:\OJPlatform-worktrees\phase1b-web-authoring` | `codex/phase2a-worker-ops-ui` | `6cd4b7c72767714b7c31864ecea87b657a9dba77` | clean |

All starts equal the common Bootstrap commit. The prior Phase 1E recovery branches remain preserved. Ownership/context and integration-request documents explicitly prohibit unauthorized shared changes and all source execution/Sandbox work.

## Regression and Status

PASS: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (114 passed, 3 opt-in Redis tests skipped), `pnpm test:architecture`, `pnpm build`, and `git diff --check`. Phase 1E behavior was not changed by this documentation-only Bootstrap.

`Docs/PROJECT_STATUS.md` now states `PHASE 2A = IN PROGRESS / BOOTSTRAPPED`, not PASS. Worker implementation, the matrix evidence, real source execution, Sandbox, real verdicts, Contest, Phase 2B/2C, production deployment, HA, and production durability remain deferred.

## Final Bootstrap Decision

WORKERS READY = YES. The shared Bootstrap is complete, all permanent Worker branches have the same starting baseline, and implementation may begin only within the frozen ownership and safety boundaries. This Goal stops before implementation.
