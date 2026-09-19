# OJPlatform Current Handoff

> HOT STATE only. Live Git/code wins. Git hashes below are last-known state.
> Read history only when this file is insufficient.

## Startup Rule

1. Run live Git branch/HEAD/main/status checks.
2. Read this file.
3. Do not preload `Docs/PROJECT_STATUS.md` or historical reports.
4. Keep this file at 60–100 lines; hard ceiling 120.

## Completed Baseline

- Docker Phase 0 readiness audit: DONE; original verdict PARTIAL.
- Docker Phase 1–4: PASS / MERGED.
- Docker Phase 6A: PASS / MERGED.
- Docker Phase 6B-1 through 6B-6: PASS / MERGED.
- Linux amd64 Judge + Production Judge: QUALIFIED / MERGED.

## Phase 7 Definition

`Phase 7 = Fresh-Machine Deployment & Bootstrap` (defined 2026-09-19).
`Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning`.

## Active / Deferred

```text
Phase 5 cross-platform ................ PARTIAL
  Windows/WSL2 amd64 Docker .......... PASS
  Mac Intel / Apple Silicon .......... DEFERRED (no real Mac)
  Native ARM64 full Judge ............ NOT QUALIFIED
Phase 7A standard deployment .......... PARTIAL / FEATURE BRANCH
  Core + Judge control plane ......... PASS (fresh VM)
  Host execution cell install ........ BLOCKED (no root on fresh VM)
  Real judge verdicts ................ NOT RUN
Phase 7B+ ............................. NOT DEFINED
```

## Phase 7A State

- Branch `codex/phase7a-standard-deployment-v1`; not merged.
- Docker Compose remains the only container orchestrator; no custom CLI.
- `deploy/judge-host/install.sh` is the single host provisioning script
  (idempotent, root-required, fail-closed, security gates, no destructive
  cleanup, never grants `docker` group).
- systemd units live in `deploy/judge-host/systemd/`; Supervisor stays a
  dedicated non-root `oj-sandbox` user unit on `127.0.0.1:19092`.
- `.env.production.example` documents every production-required variable.
- `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md` is the single deployment entry.
- Judge-only/Core-only Compose no longer depends on the OnlineCodeEditor path.
- Fixes found during the fresh VM run: the plugin must not be a pnpm workspace
  package or enter the main Docker build context.
- ONLINE_CODE_EDITOR_ACQUISITION = BLOCKED: the plugin repository has no
  authoritative Git remote, so no submodule can be pinned. A checkout is
  expected at `plugins/OnlineCodeEditor`.

## Next Action

1. Provide root on the Phase 7A fresh VM (or run
   `sudo ./deploy/judge-host/install.sh` there) to finish the execution-cell
   install, real judge smoke, reboot recovery and second-run checks.
2. Re-run `docker compose -f compose.yaml -f compose.prod.yaml --profile judge
   up -d --build` afterwards to confirm idempotency.
3. Do not start Phase 7B or ARM64/Mac work without an explicit decision.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor, and Host Agent stay host-native with no Product DB,
  MinIO admin, or Docker access.
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs, loopback-only.
- Only Web is public ingress; API/Redis/Judge Service loopback only.
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.
- Compiler rootfs identity:
  `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.

## References

- Deployment entry: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Native checklist: `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md`.
- Phase 7A evidence:
  `Docs/reports/OJPLATFORM_PHASE7A_STANDARD_DEPLOYMENT_V1_REPORT.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 7 defined; Phase 7A PARTIAL, host install blocked)
