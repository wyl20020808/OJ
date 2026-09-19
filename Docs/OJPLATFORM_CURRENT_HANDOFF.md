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
- Phase 7A deployment + E2E qualification: PASS on feature branch;
  `main` merge not performed.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7A standard deployment ......... PARTIAL / FEATURE BRANCH
  Compose control plane ............. PASS (fresh VM)
  Host execution cell install ....... PASS (fresh VM)
  Real judge AC/WA/CE/RE/TLE ........ PASS (also after reboot)
  Editor DOM smoke .................. PASS
  Second Compose + second install ... PASS (idempotent, no data loss)
  Reboot recovery ................... PASS
  OnlineCodeEditor acquisition ...... BLOCKED (no authoritative remote)
Phase 7B+ ............................ NOT DEFINED
```

## Phase 7A Facts

- Two-command deploy, verified on a brand-new VM:
  `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  then `sudo ./deploy/judge-host/install.sh`.
- Docker Compose is the only container orchestrator; no custom CLI/wrapper.
- `deploy/judge-host/install.sh` owns host-only work: prerequisites, service
  identities, AppArmor userns grant, directories/modes, Worker/Supervisor/Host
  Agent builds, compiler rootfs, protected env files, systemd units, and 15
  failing-closed security gates. Idempotent and non-destructive.
- Compiler rootfs identity:
  `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.
- Only Web is public; API/Judge/Redis/Supervisor are loopback-only.

## Blocked / Next Action

1. `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION = BLOCKED`: the plugin
   repository has no authoritative Git remote, so no pinned submodule is
   possible. It stays an external checkout at `plugins/OnlineCodeEditor`.
   Decide the plugin remote policy before claiming acquisition PASS.
2. Integration Lead may review and integrate the Phase 7A feature commits from
   the latest live `main`; this task did not merge.
3. Do not start Phase 7B, ARM64 or Mac work without an explicit decision.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor, Host Agent stay host-native with no Product DB, MinIO
  admin, or Docker access.
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs, loopback-only (`127.0.0.1:19092`).
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.

## References

- Deployment entry: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Native checklist: `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md`.
- Phase 7A evidence:
  `Docs/reports/OJPLATFORM_PHASE7A_STANDARD_DEPLOYMENT_V1_REPORT.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 7A E2E PASS; OCE acquisition still blocked)
