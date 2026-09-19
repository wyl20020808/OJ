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
`Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning` (PASS / MERGED).
`Phase 7B = Production Publication + One-Command Fresh Host Deployment` (in progress).

## Completed Baseline

- Docker Phase 0 audit: DONE (original verdict PARTIAL).
- Docker Phase 1–4: PASS / MERGED.
- Docker Phase 6A + 6B-1 … 6B-6: PASS / MERGED.
- Linux amd64 Judge + Production Judge: QUALIFIED / MERGED.
- Phase 7A deployment, E2E and plugin acquisition: PASS / MERGED into `main`.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7B one-command deployment ...... PARTIAL / FEATURE BRANCH
  Host toolchain minimization ....... PASS (no Go/Node/pnpm needed)
  deploy/install.sh ................. --check + contract PASS; full run PENDING
  deploy/doctor.sh .................. PASS on the Ubuntu VM
  Contract tests .................... 39/39 PASS
  Fresh-host E2E, reboot, judge ..... PENDING
  Public remote publication ......... PENDING
  Integration into main ............. PENDING
Phase 7C+ ............................ NOT DEFINED
```

## Phase 7B Facts

- Target UX: `git clone --recurse-submodules https://github.com/wyl20020808/OJ.git`,
  `cd OJ`, `sudo ./deploy/install.sh`.
- `deploy/install.sh`: preflight (x86_64 only, fail closed) -> Docker from the
  official repository when missing -> pinned submodule (aborts on drift) ->
  `.env` 0600 with secrets generated once and never printed -> port check ->
  standard production Compose -> bounded health gate -> `deploy/judge-host/install.sh`.
  Never runs `git pull`; never hides Docker Compose.
- `deploy/doctor.sh`: read-only, ends with `DEPLOY_DOCTOR=PASS/FAIL`, accurate
  without root.
- Host needs only Linux + git + curl + Docker. Execution-cell binaries are built
  in `golang:1.22-bookworm`; the optional Host Agent uses npm/npx.
- Two-command manual path still supported and documented.
- Checkpoint report:
  `Docs/reports/OJPLATFORM_PHASE7B_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

## Next Action

1. Operator grants one privileged run on the disposable VM, then finish Judge
   E2E, browser E2E, reboot survival and the second installer run.
2. Run the secret/history audit and publish `main` to
   `https://github.com/wyl20020808/OJ.git` (no force, `main` only).
3. Integrate Phase 7B with a `--no-ff` merge after the full gate, then repeat
   the loop from a clean VM with no Docker/Node/pnpm/Go via the public remote.
4. Do not start Phase 7C, ARM64 or Mac work without an explicit decision.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor, Host Agent stay host-native with no Product DB, MinIO
  admin, or Docker access.
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs, loopback-only (`127.0.0.1:19092`).
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.
- Plugin stays an independent repository: never vendor it, never squash its
  history, never auto-follow its remote `main`.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.

## References

- One-command deployment: `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`.
- Manual step-by-step: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 7B implementation complete; E2E + publication pending)
