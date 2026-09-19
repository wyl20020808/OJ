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
- Docker Phase 6B-1: PASS / MERGED.
- Docker Phase 6B-2: PASS / MERGED.
- Docker Phase 6B-3: PASS / MERGED.
- Docker Phase 6B-4: PASS / MERGED.
- Docker Phase 6B-5: PASS / MERGED.
- Docker Phase 6B-6: PASS / MERGED.

## Active / Deferred

```text
Phase 5 cross-platform ................ PARTIAL
  Windows/WSL2 amd64 Docker .......... PASS
  Mac Intel / Apple Silicon .......... DEFERRED (no real Mac)
  Native ARM64 full Judge ............ NOT QUALIFIED
Linux amd64 full Judge ............... QUALIFIED
Production Judge ..................... QUALIFIED
Phase 7–9 ............................. NOT STARTED
```

## Native Linux Qualification Result

- Qualification feature: `f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe`.
- Host: Ubuntu 24.04.5, kernel 6.8.0-139, native VMware x86_64,
  cgroup v2, systemd 255, runc 1.5.1, OCI 1.3.0, libseccomp 2.5.5.
- Fresh production Compose, migrations, MinIO provisioning, Redis ACL, Product/
  Judge DB isolation, firewall, logging, and service-account boundaries passed.
- Canonical rootfs identity after locale-independent manifest normalization:
  `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.
- Native Phase 6B-5 suite passed: 12 trusted probes and 14 bounded untrusted
  fixtures, including isolation, resource, recovery, and cleanup gates.
- Real artifact workflows produced AC, WA, CE, RE, and TLE.
- Worker SIGKILL recovery, component restart recovery, and two guest reboot
  cycles passed.
- Worker/Judge readiness fails closed on Supervisor, Redis, or control-plane
  loss and recovers to `EXECUTION_READY`.
- CRITICAL/HIGH/OPEN MEDIUM findings: 0.

## Accepted Residual Controls

- Seccomp: `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL` for the amd64
  default-allow denylist plus rootless-runc, namespaces, capabilities, cgroups,
  and explicit high-risk syscall controls.
- Workspace aggregate: `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL` for the
  bounded fail-closed monitor and free-space admission reserve.
- `RLIMIT_NOFILE`: RESOLVED. Per-file `RLIMIT_FSIZE`: enforced.
- Kernel/runc zero-day risk remains out of scope, not an open finding.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker, Supervisor, and Host Agent remain host-native and have no Product DB,
  MinIO admin, or Docker access.
- Supervisor remains dedicated non-root, rootless runc, cgroup v2, namespaces,
  immutable rootfs, and loopback-only.
- Product artifact API, Worker Redis, and Judge Service same-host bridges remain
  loopback-only; only Web is public HTTP ingress.
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED until real hardware is available.

## Next Action

1. Stop after Phase 6 integration.
2. Await user selection and scope for the next roadmap phase; do not start
   ARM64 qualification, Mac work, or Phase 7 automatically.

## References

- Native evidence:
  `Docs/reports/OJPLATFORM_NATIVE_LINUX_AMD64_PRODUCTION_JUDGE_QUALIFICATION_V1_REPORT.md`.
- Integration evidence:
  `Docs/reports/OJPLATFORM_NATIVE_LINUX_AMD64_JUDGE_QUALIFICATION_INTEGRATION_V1_REPORT.md`.
- Deployment runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Repeatable native checklist:
  `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (Phase 6B-6 PASS / MERGED; Production Judge qualified)
