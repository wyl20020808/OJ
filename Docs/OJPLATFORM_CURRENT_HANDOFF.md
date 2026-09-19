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
- Docker Phase 6A Judge architecture/security audit: PASS / MERGED.
- Docker Phase 6B-1 through 6B-5: PASS / MERGED.
- Phase 6B-6 hardening + WSL prequalification: PASS / MERGED.
- Phase 6B-6 native Linux amd64 qualification: PASS on feature branch;
  integration into `main` is pending.

## Active / Deferred

```text
Phase 5 cross-platform ................ PARTIAL
  Windows/WSL2 amd64 Docker .......... PASS
  Mac Intel / Apple Silicon .......... DEFERRED (no real Mac)
  Native ARM64 full Judge ............ NOT QUALIFIED
Phase 6B-6 native Linux amd64 ........ PASS / FEATURE BRANCH
  Linux amd64 full Judge ............. QUALIFIED
  Production Judge ................... QUALIFIED on reviewed feature branch
  Integration into main .............. PENDING
Phase 7–9 ............................. NOT STARTED
```

## Native Linux Qualification Result

- Base main commit: `fa234f826b8e766ba7f29fd785243f3db5c966d7`.
- Branch: `codex/docker-native-linux-amd64-qualification-v1`.
- Ubuntu 24.04.5, kernel 6.8.0-139, native VMware x86_64, cgroup v2,
  systemd 255, runc 1.5.1, OCI 1.3.0, libseccomp 2.5.5.
- Fresh production Compose, migrations, MinIO provisioning, Redis ACL, Product/
  Judge DB isolation, firewall, logging, and service-account boundaries passed.
- Rootfs identity:
  `cfb8d628eb7ef2ceb0257e27a1f82f2deb4eb312cfd3ca2498b302564a5a7e14`.
- Native Phase 6B-5 suite passed: 12 trusted probes, 14 bounded untrusted
  fixtures, all isolation/resource/cleanup gates.
- Real artifact workflows produced AC, WA, CE, RE, and TLE.
- Worker SIGKILL during a real attempt recovered under a new incarnation to one
  terminal result. Component restart and two guest reboot cycles passed.
- Worker/Judge readiness now fails closed on Supervisor/Redis/control-plane
  loss and recovers to `EXECUTION_READY`.
- CRITICAL/HIGH/OPEN MEDIUM findings: 0.

## Accepted Controls

- amd64 seccomp remains the formally accepted default-allow denylist with
  rootless-runc, namespace, capability, cgroup, and explicit syscall controls.
- Compile aggregate quota remains the formally accepted bounded monitor with
  fail-closed accounting and free-space admission; per-file FSIZE is enforced.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET; Phase 5 Mac
  remains DEFERRED pending real hardware.

## Critical Boundaries

- Untrusted code never runs in API/Web/Core/Judge Service/Plugin Host.
- Worker/Supervisor/Host Agent remain host-native and have no Product DB,
  MinIO admin, or Docker access.
- Supervisor remains dedicated non-root, rootless runc, cgroup v2, namespaces,
  immutable rootfs, and loopback-only.
- Product artifact API, Worker Redis, and Judge Service same-host bridges are
  loopback-only; only Web is public HTTP ingress.
- Do not weaken AppArmor/userns, seccomp, cgroups, firewall, or Docker denial.

## Next Action

1. Integration Lead starts from latest live `main`, reviews and integrates the
   native qualification feature commit without rewriting history.
2. Re-run changed/focused gates after integration; do not rerun unsafe fixtures
   outside the dedicated native host.
3. Resume Mac work only with real hardware; keep ARM64 Judge unqualified.

## References

- Native evidence:
  `Docs/reports/OJPLATFORM_NATIVE_LINUX_AMD64_PRODUCTION_JUDGE_QUALIFICATION_V1_REPORT.md`.
- Deployment runbook: `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`.
- Architecture: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Native checklist: `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-19 (native Linux amd64 PASS; feature integration pending)
