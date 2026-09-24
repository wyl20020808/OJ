# OJPlatform Current Handoff

> HOT STATE only. Live Git/code wins. Git hashes below are last-known state.
> Read history only when this file is insufficient.

## Startup Rule

1. Run live Git branch/HEAD/main/status checks.
2. Read this file.
3. Do not preload `Docs/PROJECT_STATUS.md` or historical reports.
4. Keep this file at 60–100 lines; hard ceiling 120.

## Phase Definitions

`Phase 7 = Fresh-Machine Deployment & Bootstrap`.  
`Phase 7A = Standard Compose Deployment + Linux Host Provisioning` (PASS).  
`Phase 7B = Production Publication + One-Command Fresh Host Deployment` (PASS).  
`Phase 7C = Windows One-Command Deployment Preview` (PREVIEW_COMPLETE).
## Completed Baseline

- Docker Phase 0–4: DONE; Docker Phase 6A + 6B-1 … 6B-6: PASS / MERGED.
- Linux amd64 native Judge + Production Judge: QUALIFIED / MERGED.
- Phase 7A: PASS / MERGED; Phase 7B: PASS / MERGED / PUBLISHED / PUBLICLY QUALIFIED; Typography V1: PASS / MERGED.
- Full-Stack Synchronization V1: PASS / MERGED / CI GREEN (`a6b5732`, run `35726474650`); AI Host Integration V1 = PASS / MERGED (`a5fe3d7`, validated source `c3391b5`, migrations `0037–0038` UP_TO_DATE, canonical runtime READY); Specialized AI Host Sync V1 = PASS / MERGED (`fb42e73`; Host grants + dispatches `code.debug.analyze@1.0` and transports `promptApplied`/`promptVersion`; AI Bridge Stage 7 host qualification PASS; AlgoQuest Real-AI E2E NOT RUN).

## GitHub CI (2026-09-22)

- `OJPlatform CI = GREEN` at `a6b5732`: `ci:check` 1082/1030 passed/47 known/
  1 resolved, `integration` 20/20, `test:e2e:baseline` 31 identities (1 pass /
  17 known legacy failures / 13 gated skips). Exact identity+signature gates;
  no test deleted or newly skipped.
- `TECH DEBT` = 17 legacy E2E failures (stale selectors, legacy English UI
  expectations, test cleanup FK collision); pinned in
  `Docs/reports/artifacts/fullstack-sync-v1/e2e-baseline.json`.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7C Windows preview ............. PREVIEW_COMPLETE / INTEGRATED
Phase 8+ ............................. NOT DEFINED
```

## Windows Dev Runtime Infra Readiness (2026-09-21) — PASS

- `Issue` = cold Docker/WSL readiness race: false READY (container health +
  accepted TCP) while a Compose bridge/WSL2 NAT subnet collision broke the
  published postgres/redis paths; container-only recreate could not recover.
- `Fix` = published-path protocol probes (pg `connect + SELECT 1`, redis
  `PING -> +PONG`, MinIO `/minio/health/ready`), bounded 120s/2s wait, one
  bounded network-level reconcile (never `-v`, volume asserted), full failure
  diagnostics, transient-only retry + Judge credential verification in
  `judge-service-bootstrap.mjs`.
- `Verified` = cold start (exited containers), slow-Postgres no-premature-
  bootstrap, second start; dev data/volumes unchanged. Deployment impact = No.
- `Dev-only` = one legacy `0000_platform_metadata.down` ledger row removed from
  the local dev DB (dumped first) so migrations could pass.
- Report: `Docs/reports/OJPLATFORM_DEV_RUNTIME_INFRASTRUCTURE_READINESS_V1_REPORT.md`.

## Phase 7C Final Facts

- Windows 11 x86_64 + WSL2 is a **bootstrap host only**; `deploy/install-windows.ps1`
  installs WSL2 + Ubuntu 24.04 and delegates to `deploy/install.sh`, which stays
  the single production installer. No Windows-native Judge, no Docker Desktop
  requirement, `WINDOWS_FUNCTIONAL_QUALIFICATION = PASS` on a physical Windows 11
  host with an existing WSL2 installation (install, Web, API, DB, Judge
  AC/WA/TLE/MLE/CE/RE, OnlineCodeEditor in Edge, second-install idempotency,
  persistence, both doctors, Windows localhost).
- Judge tail closed: rejudge request identity is generation-scoped, Judge Service
  404/409/501 keep their own non-retryable statuses, product cancellation goes
  through the Judge Service control plane. Live evidence: AC -> rejudge ->
  generation 2 AC; in-flight TLE -> cancel -> `CANCELLED`, still `CANCELLED`
  after the worker finished.
- README is Chinese-first: `README.md` is the Chinese landing page,
  `README.en.md` / `README.zh-CN.md` are the complete references.

## Deferred qualification

Fresh Windows no-WSL2 bootstrap + reboot resume. No clean Windows host without an
existing WSL2 installation was available and no local VM can nest WSL2; do not
pursue it by changing host boot configuration, VBS, HVCI or rebooting the host.
## Status Wording (never regress)

- `WINDOWS_ONE_COMMAND_DEPLOYMENT = PREVIEW / FUNCTIONAL QUALIFIED`.
- Never write `FULLY QUALIFIED` or `Fresh Windows = Supported`.
- Ubuntu 24.04 x86_64 / Linux remains `Production Qualified`.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor and optional Host Agent stay host-native with no Product DB,
  MinIO admin or Docker access; the API must not reach into Judge queue internals
  (use the Judge Protocol / Judge Service control plane).
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs and loopback-only (`127.0.0.1:19092`).
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall or Docker denial.
- Plugin remains an independently versioned pinned submodule; never vendor it,
  squash its history or automatically follow its remote `main`.

## Next Action

1. Manual visual acceptance remains `PENDING USER`.
2. Deferred product contracts: contest scoring/standings, verdict-derived
   wrong-book aggregation, and atomic Contest submission binding/dispatch.

## References

- Windows deployment: `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md`.
- One-command deployment: `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`.
- Manual deployment: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Local dev runtime: `Docs/LOCAL_RUNTIME.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-24 (Specialized AI Host Sync V1 PASS / MERGED / AI Bridge Stage 7 host qualification PASS; AlgoQuest Real-AI E2E NOT RUN)
