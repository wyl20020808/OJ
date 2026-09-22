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
- Full-Stack Synchronization V1: PASS / MERGED.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7C Windows preview ............. PREVIEW_COMPLETE / INTEGRATED
Phase 8+ ............................. NOT DEFINED
```

## Windows Dev Runtime Infra Readiness (2026-09-21)

- `Issue` = cold Docker/WSL infrastructure readiness race: `dev-runtime start`
  printed READY and then the Judge DB bootstrap died with
  `Connection terminated unexpectedly` (`pg/lib/client.js`).
- `Root cause` = **false READY** (container health + accepted TCP was treated as
  readiness). The Compose bridge (`172.18.0.0/16`) overlapped the WSL2 host-NAT
  subnet (`172.18.0.0/30`), so postgres `172.18.0.2` / redis `172.18.0.3` were
  routed via `eth0` instead of the bridge: the port forwarder accepted and closed
  connections while the in-container healthcheck stayed `healthy` (MinIO
  `172.18.0.4` was fine). Container-only `--force-recreate` cannot recover it;
  recreating the network can.
- `Fix` = published-path protocol probes (pg `connect + SELECT 1`, redis
  `PING -> +PONG`, MinIO `/minio/health/ready`), bounded 120s/2s wait with
  `STARTING` / `READY (n s)` / `FAILED`, one bounded network-level reconcile
  (`down --remove-orphans` + `up -d`, never `-v`, volume asserted), full failure
  diagnostics, and bounded transient-only retry in `judge-service-bootstrap.mjs`.
- `Verified` = cold start with containers `exited` PASS (infra 12.2–17.7s,
  bootstrap READY, migrations PASS, worker ONLINE), slow-Postgres no-premature-
  bootstrap PASS, second start PASS (10.6s, all REUSE), dev data and volumes
  unchanged. `Deployment impact = No` (`deploy/` untouched).
- `Dev-only` = one legacy `0000_platform_metadata.down` product ledger row was
  removed from the local dev DB (dumped first) so migrations could pass; a bad
  dev test case also changed the local judge role password and was repaired
  (bootstrap now verifies the Judge role credential).
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

Last Updated: 2026-09-22 (Full-Stack Synchronization V1 PASS / MERGED)
