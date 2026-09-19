# OJPlatform Current Handoff

> HOT STATE only. Live Git/code wins. Git hashes below are last-known state.
> Read history only when this file is insufficient.

## Startup Rule

1. Run live Git branch/HEAD/main/status checks.
2. Read this file.
3. Do not preload `Docs/PROJECT_STATUS.md` or historical reports.
4. Keep this file at 60–100 lines; hard ceiling 120.

## Phase 7 Definition

`Phase 7 = Fresh-Machine Deployment & Bootstrap` (defined 2026-09-19).
`Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning`.

## Completed Baseline

- Docker Phase 0 readiness audit: DONE; original verdict PARTIAL.
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
Phase 7A standard deployment ......... PASS / MERGED
  Compose control plane + host cell . PASS (fresh VM, 15 gates)
  Real judge AC/WA/CE/RE/TLE ........ PASS (also after reboot)
  Editor DOM smoke .................. PASS
  Idempotent re-runs + reboot ....... PASS
  OnlineCodeEditor submodule ........ PASS
  Integration into main ............. PASS / MERGED
Phase 7B+ ............................ NOT DEFINED
```

## Phase 7A Facts

- Two-command deploy, verified on a brand-new VM:
  `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  then `sudo ./deploy/judge-host/install.sh`. No custom orchestrator.
- OnlineCodeEditor is a pinned submodule at `plugins/OnlineCodeEditor`
  (gitlink `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, remote
  `https://github.com/wyl20020808/OnlineEditor.git`, no branch tracking).
  Fresh clones use `--recurse-submodules`; existing clones use
  `git submodule update --init --recursive`.
- `plugins/OnlineCodeEditor` is the build default; the
  `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT` variable is only a developer override.
- Compiler rootfs identity:
  `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.
- Only Web is public; API/Judge/Redis/Supervisor are loopback-only.

## Next Action

1. Phase 7A is integrated. Next work starts only from a new approved phase.
2. `OJPLATFORM_REMOTE_PUBLICATION = PENDING`:
   `https://github.com/wyl20020808/OJ` is reserved for the OJPlatform main
   repository but has not been published. The submodule URL is absolute, so
   acquisition does not depend on it.
3. Do not start Phase 7B, ARM64 or Mac work without an explicit decision.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor, Host Agent stay host-native with no Product DB, MinIO
  admin, or Docker access.
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs, loopback-only (`127.0.0.1:19092`).
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.
- Plugin stays an independent repository: never vendor it, never squash its
  history, never auto-follow its remote `main`.
- A host-only `pnpm build:web` needs `cd plugins/OnlineCodeEditor && npm ci`
  once; the Docker Web build installs plugin dependencies itself.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.

## References

- Deployment entry: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Phase 7A deployment evidence:
  `Docs/reports/OJPLATFORM_PHASE7A_STANDARD_DEPLOYMENT_V1_REPORT.md`.
- Plugin acquisition evidence:
  `Docs/reports/OJPLATFORM_PHASE7A_ONLINECODEEDITOR_ACQUISITION_V1_REPORT.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 7A PASS / feature complete; integration pending)
