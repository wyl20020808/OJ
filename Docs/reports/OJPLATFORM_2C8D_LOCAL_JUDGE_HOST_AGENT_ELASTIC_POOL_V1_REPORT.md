# OJPlatform Phase 2C.8D Local Judge Host Agent and Elastic Pool V1 Report

## Status

`PARTIAL / SAFE_FIXTURE_RUNTIME_VERIFIED`

## Git evidence

- Starting 2C.8BC HEAD: `e8b1db6298d5800ca8a45de39b8231a9f4373c4b`
- Frozen 2C.8A authority: `63ba05eecceb3b09ee15075c38f82522ff1e89cd`
- Frozen authority was not an ancestor of 8BC; it was integrated with merge commit `004bc1f`.

## Implemented

- Trusted-template local Host Agent with idempotent start, safe stop, restart incarnations, process ownership metadata and a template-specific host-capacity ceiling that subtracts owned and in-flight processes before either reporting or allocating capacity.
- Judge Service admin pool policy, templates, host capacity, lifecycle capability/history and lifecycle operations.
- Deterministic autoscaler covering MANUAL/AUTOMATIC, queue pressure (pending/average/P95 wait), schedulable capacity, utilization, min/max, normal/fast scale-up, host CPU/RAM ceiling, cooldowns, sustained idle scale-down and bounded audit decisions.
- Product `/api/admin/judge/*` lifecycle boundary with `judge.lifecycle` RBAC, CSRF, idempotency, safe errors and durable audit integration; existing `judge.manage` operations remain separate.
- Web Judge Machines controls for mode, Add Node and lifecycle actions with truthful Host Agent unavailable state. Product policy mutations correctly preserve JSON/CSRF headers, accept policy-level control-version guards without requiring a node incarnation, and unwrap the audited policy projection.
- Judge Service autoscaler loop with configurable interval, Redis pending-queue metrics, derived node utilization/schedulable capacity, overlap protection and timer cleanup. Host Agent-owned process count prevents repeated scale-up before registration.
- Host Agent lifecycle hardening: live PID checks, spawn-failure cleanup, capacity reservations across concurrent starts, per-node serialized restart, expected-incarnation checks, active-job stop rejection and persisted ownership reconciliation that fails closed without adopting or killing an unverified process. Legacy live ownership without resource metadata blocks additional allocation conservatively.
- Judge DB persistence for pool policy and bounded autoscaler decision history, restored at Judge Service startup through formal migration `0003_judge_pool_control.sql`.

## Tested

- Focused Host Agent, Judge Service, node registry and autoscaler tests: PASS (29 tests), including owned CPU/RAM subtraction, per-template `maxAdditionalNodes` calculation and Host Agent rejection of a manual start beyond capacity.
- Web/Product Judge Admin focused regression tests: PASS (8 tests), including JSON/CSRF write headers, pool-mode control-version mutation and audited policy-response projection.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and `git diff --check`: PASS.
- `go test ./...` in `apps/judge-worker`, `pnpm test:architecture` and `pnpm build`: PASS.
- Full `pnpm check`: PASS (format, lint, typecheck, `pnpm test` with 724 passed and 5 skipped, architecture gate and build), with PostgreSQL/Redis available through the Goal-owned local Compose stack.
- Judge Admin Product browser qualification: PASS using the server-configured `OJPLATFORM_PHASE2B_REAL_RUNTIME` operator fixture. Real Product API, Vite and local Chrome verified authenticated Product-only access, CSRF/session behavior, no browser-direct Judge or Host Agent request, and no horizontal overflow at 1440x900, 1024x768 and 390x844. Against a configured real Host Agent, the browser switched policy to MANUAL, added a trusted-template logical node, restarted it from incarnation `c6039550-c8f8-4ebd-ad5c-ab1afb8a0b87` to `9e87782b-3f2d-4540-b233-e829a190d4f6`, and submitted lifecycle Stop. The remaining qualification-created owned Worker was then stopped through the Host Agent using its logical node ID, expected incarnation and `activeJobs: 0`; final `/v1/owned` was empty.

## Not verified / blocked

`RUNTIME VERIFIED (SAFE_FIXTURE_QUALIFICATION)`: a clean isolated Judge database and Redis prefix were used with a real local Host Agent, two Windows Go Workers and the current trusted template. A real autoscaler fast-backlog decision started two processes; both registered `ONLINE`; Host capacity moved from `2 CPU / 512 MB / maxAdditionalNodes=2` to `0 / 0 / 0`. A second backlog decision was blocked first by `MAX_NODES_REACHED`, then by `HOST_CAPACITY_EXHAUSTED` after raising maxNodes. Eight real Worker claims completed through the scheduler, with five assignments on one logical node and three on the other. Two sustained-idle reconciliations each performed `SCALE_DOWN / LOW_UTILIZATION_IDLE_WINDOW`, draining, offlining and Host-Agent-stopping one node; final Host owned count was zero. Manual Start -> register -> Restart produced new incarnations (`0abef...` to `c603...`) and restored `ONLINE`; an old heartbeat returned `409 STALE_NODE_INCARNATION`.

This evidence verifies Host Agent lifecycle, template capacity accounting, autoscaler decision/action flow, scheduler A/B routing, scale-down ordering, stale-incarnation rejection and configured Product browser controls for the Safe Fixture path. It does not qualify Supervisor/C++ execution, Host Agent restart ownership recovery or production readiness. The in-app browser connector itself could not initialize because its local runtime asset path was unavailable; local Chrome was used for the configured browser qualification. No mock node is claimed as runtime evidence.

Host Agent operation history remains bounded process-local observability; a restarted Agent retains live persisted ownership as an unreconciled block and does not adopt or kill the process, so cross-restart process reconciliation still requires runtime qualification and is not claimed.

## Security and architecture

Browser does not receive Judge/Host credentials. Add Node accepts trusted template IDs only. Judge Workers retain the standalone Judge boundary and do not access Application PostgreSQL. Production readiness, multi-host, HA, Kubernetes and cloud provisioning are not claimed.
