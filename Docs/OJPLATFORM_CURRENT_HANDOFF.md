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
`Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning`.  
`Phase 7B = Production Publication + One-Command Fresh Host Deployment`.

## Completed Baseline

- Docker Phase 0 audit: DONE (original verdict PARTIAL).
- Docker Phase 1–4: PASS / MERGED.
- Docker Phase 6A + 6B-1 … 6B-6: PASS / MERGED.
- Linux amd64 Judge + Production Judge: QUALIFIED / MERGED.
- Phase 7A: PASS / MERGED.
- Phase 7B: PASS / MERGED / PUBLISHED / PUBLICLY QUALIFIED.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7A standard deployment ........ PASS / MERGED
Phase 7B one-command deployment ..... PASS / MERGED / PUBLISHED
Phase 7C+ ............................ NOT DEFINED
```

## Phase 7B Final Facts

- Public remote: `https://github.com/wyl20020808/OJ.git`.
- Qualified code tip: `ff8f030cb4592038cdcefc014cb97f5fc2944d52`.
- Pinned OnlineCodeEditor: `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`.
- Anonymous recursive clone reproduced both commits.
- Target UX passed on a clean independent Ubuntu 24.04.5 guest:
  `git clone --recurse-submodules ...`, then `sudo ./deploy/install.sh`.
- Real production verification/register/login, browser session + CSRF,
  same-origin Submission API, Judge AC/WA and CodeMirror typing passed.
- Reboot recovery, `deploy/doctor.sh`, persistence, second installer run,
  unchanged secrets/data, no duplicate containers and post-install AC passed.
- Secret/history audit passed; only `main` was pushed and no force push used.
- Qualification-only mail sinks, overrides and passwordless sudo were removed.
- Formal report:
  `Docs/reports/OJPLATFORM_PHASE7B_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

## Next Action

1. Phase 7B needs no follow-up action.
2. Do not start Phase 7C, native ARM64 or Mac work without an explicit goal.
3. Preserve the existing untracked browser evidence file unless explicitly
   asked to archive or remove it.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor and optional Host Agent stay host-native with no Product
  DB, MinIO admin or Docker access.
- Supervisor remains non-root, rootless runc, cgroup v2, namespaces, immutable
  rootfs and loopback-only (`127.0.0.1:19092`).
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall or Docker denial.
- Plugin remains an independently versioned pinned submodule; never vendor it,
  squash its history or automatically follow its remote `main`.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.

## References

- One-command deployment: `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`.
- Manual deployment: `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`.
- Production runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 7B PASS / merged / published / publicly qualified)
