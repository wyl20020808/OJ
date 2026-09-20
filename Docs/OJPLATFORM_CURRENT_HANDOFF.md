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

- Docker Phase 0–4: DONE.
- Docker Phase 6A + 6B-1 … 6B-6: PASS / MERGED.
- Linux amd64 native Judge + Production Judge: QUALIFIED / MERGED.
- Phase 7A: PASS / MERGED.
- Phase 7B: PASS / MERGED / PUBLISHED / PUBLICLY QUALIFIED.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7C Windows preview ............. PREVIEW_COMPLETE / INTEGRATED
Phase 8+ ............................. NOT DEFINED
```

## Phase 7C Final Facts

- Windows 11 x86_64 + WSL2 is a **bootstrap host only**; `deploy/install-windows.ps1`
  installs WSL2 + Ubuntu 24.04 and delegates to `deploy/install.sh`, which stays
  the single production installer. No Windows-native Judge, no Docker Desktop
  requirement.
- `WINDOWS_FUNCTIONAL_QUALIFICATION = PASS` on a physical Windows 11 host with an
  existing WSL2 installation: install, Web, API, DB, Judge AC/WA/TLE/MLE/CE/RE,
  OnlineCodeEditor in Edge (CodeMirror, keyboard input, no fatal JS errors),
  second-install idempotency, persistence, both doctors, Windows localhost.
- Judge tail closed: rejudge request identity is generation-scoped, Judge Service
  404/409/501 keep their own non-retryable statuses, and product cancellation goes
  through the Judge Service control plane. Live product-path evidence:
  AC -> rejudge -> generation 2 AC; in-flight TLE -> cancel -> `CANCELLED` with no
  verdict, still `CANCELLED` after the worker finished.
- README is Chinese-first: `README.md` is the Chinese landing page,
  `README.en.md` / `README.zh-CN.md` are the complete references.

## Deferred qualification

Fresh Windows no-WSL2 bootstrap + reboot resume. No clean Windows host without an
existing WSL2 installation was available and no local VM can nest WSL2 (Windows 11
Home has no Hyper-V role; the active hypervisor/VBS path blocks nested VT-x).
Do not pursue it by changing host boot configuration, VBS, HVCI or rebooting the
host.

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

1. Phase 7C is closed as a Windows preview; no follow-up blocks new feature work.
2. Start the next product feature Phase only with an explicit goal.
3. Preserve the existing untracked browser evidence file unless explicitly asked
   to archive or remove it.

## References

- Windows deployment: `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md`.
- One-command deployment: `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`.
- Manual deployment: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-20 (Phase 7C Windows preview closeout / integrated)
