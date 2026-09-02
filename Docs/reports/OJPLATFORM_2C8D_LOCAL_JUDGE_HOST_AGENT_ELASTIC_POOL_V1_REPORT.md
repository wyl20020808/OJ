# OJPlatform Phase 2C.8D Local Judge Host Agent and Elastic Pool V1 Report

## Status

`PARTIAL / IMPLEMENTED_AND_TESTED_RUNTIME_NOT_VERIFIED`

## Git evidence

- Starting 2C.8BC HEAD: `e8b1db6298d5800ca8a45de39b8231a9f4373c4b`
- Frozen 2C.8A authority: `63ba05eecceb3b09ee15075c38f82522ff1e89cd`
- Frozen authority was not an ancestor of 8BC; it was integrated with merge commit `004bc1f`.

## Implemented

- Trusted-template local Host Agent with idempotent start, safe stop, restart incarnations, process ownership metadata and a template-specific host-capacity ceiling that subtracts owned and in-flight processes before either reporting or allocating capacity.
- Judge Service admin pool policy, templates, host capacity, lifecycle capability/history and lifecycle operations.
- Deterministic autoscaler covering MANUAL/AUTOMATIC, queue pressure (pending/average/P95 wait), schedulable capacity, utilization, min/max, normal/fast scale-up, host CPU/RAM ceiling, cooldowns, sustained idle scale-down and bounded audit decisions.
- Product `/api/admin/judge/*` lifecycle boundary with `judge.lifecycle` RBAC, CSRF, idempotency, safe errors and durable audit integration; existing `judge.manage` operations remain separate.
- Web Judge Machines controls for mode, Add Node and lifecycle actions with truthful Host Agent unavailable state.
- Judge Service autoscaler loop with configurable interval, Redis pending-queue metrics, derived node utilization/schedulable capacity, overlap protection and timer cleanup. Host Agent-owned process count prevents repeated scale-up before registration.
- Host Agent lifecycle hardening: live PID checks, spawn-failure cleanup, capacity reservations across concurrent starts, per-node serialized restart, expected-incarnation checks, active-job stop rejection and persisted ownership reconciliation that fails closed without adopting or killing an unverified process. Legacy live ownership without resource metadata blocks additional allocation conservatively.
- Judge DB persistence for pool policy and bounded autoscaler decision history, restored at Judge Service startup through formal migration `0003_judge_pool_control.sql`.

## Tested

- Focused Host Agent, Judge Service, node registry and autoscaler tests: PASS (29 tests), including owned CPU/RAM subtraction, per-template `maxAdditionalNodes` calculation and Host Agent rejection of a manual start beyond capacity.
- Web tests: PASS (11 tests).
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and `git diff --check`: PASS.
- `go test ./...` in `apps/judge-worker`, `pnpm test:architecture` and `pnpm build`: PASS.
- Full `pnpm test`: 719 passed, 8 skipped; one pre-existing PostgreSQL integration suite failed during setup/cleanup because `127.0.0.1:55432` refused connections. This is `TEST BLOCKED`, not a full-suite PASS.

## Not verified / blocked

The following controlled runtime evidence was obtained before the final capacity correction: a real local Host Agent started two Windows Go Workers from the trusted template; both registered under Host Agent-issued node IDs/incarnations; eight `SAFE_FIXTURE_QUALIFICATION` jobs routed across both nodes; draining node A routed three subsequent jobs to B; restarting A produced incarnation `590d0c2b-987c-4962-8507-995d33e61bb5`, restored it to `ONLINE`, and the old incarnation heartbeat returned `409 STALE_NODE_INCARNATION`. This is genuine process/registration/routing evidence, but it is not Supervisor/C++ execution evidence and does not qualify the final capacity calculation at runtime.

Real Host Agent -> Supervisor -> Worker multi-process lifecycle, Host Agent restart ownership recovery, automatic scale-up/down against a live queue, final capacity-ceiling runtime behavior, and browser runtime qualification remain not verified. The in-app browser connector could not initialize because its local runtime asset path was unavailable; existing responsive E2E remains code-level evidence only. No mock node is claimed as runtime evidence.

Host Agent operation history remains bounded process-local observability; a restarted Agent retains live persisted ownership as an unreconciled block and does not adopt or kill the process, so cross-restart process reconciliation still requires runtime qualification and is not claimed.

## Security and architecture

Browser does not receive Judge/Host credentials. Add Node accepts trusted template IDs only. Judge Workers retain the standalone Judge boundary and do not access Application PostgreSQL. Production readiness, multi-host, HA, Kubernetes and cloud provisioning are not claimed.
