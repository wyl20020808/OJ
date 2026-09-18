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
- Docker Phase 6B-1 Judge Service control plane: PASS / MERGED.

## Active / Deferred
```text
Phase 5 cross-platform ................ PARTIAL
  Windows/WSL2 amd64 Docker .......... PASS
  Mac Intel / Apple Silicon .......... DEFERRED (no real Mac)
  Native ARM64 API/Web images ........ NOT QUALIFIED
Phase 6B-2 execution-cell integration  PASS / MERGED
Phase 6B-3 Redis ACL isolation ........ PASS / MERGED
Phase 6B-4 sandbox privilege hardening  PASS / MERGED
Phase 6B-5 sandbox security regression  PASS / MERGED
Phase 6B-6 production hardening ....... PASS / FEATURE COMPLETE
  WSL production-like prequalification  PASS
  Native Linux amd64 qualification .... PENDING
Phase 7–9 ............................. NOT STARTED
```

## Docker Judge Result

- Phase 6B-1/2/3 = PASS / MERGED.
- Phase 6B-4 sandbox privilege hardening = PASS / MERGED.
- Phase 6B-5 WSL sandbox security regression = PASS / MERGED.
- Phase 6B-6 hardening + WSL production-like prequalification = PASS / FEATURE
  COMPLETE; native Linux amd64 final qualification = PENDING.
- MEDIUM dispositions: seccomp default-allow amd64 denylist = formally accepted
  with controls; `RLIMIT_NOFILE` = RESOLVED; per-file `RLIMIT_FSIZE` = enabled
  and aggregate compile quota = formally accepted with fail-closed controls.
- Fresh isolated production Compose, second startup, restart/crash recovery,
  Redis ACL, Docker privilege, 14 bounded C++ fixtures, and cleanup passed.
  CRITICAL/HIGH/OPEN MEDIUM = 0. No real user data/runtime was modified.

## Judge Architecture

```text
Docker: Product API -> Judge Service -> Judge PostgreSQL + Judge Redis
Host:   optional Host Agent -> Worker -> 127.0.0.1:19092 Supervisor -> runc
```

Container API uses `judge-service:3100`; same-host Worker uses loopback. Worker,
Host Agent, and Supervisor stay host-native. Durable execution-ready state is
still a MEDIUM observability gap; Worker itself fails closed.

## Production Boundary

All known HIGH production blockers remain resolved. Production hardening is
PASS, but Production Judge remains NO until the native Linux checklist passes.
Execution readiness is reportable (`ONLINE`/`EXECUTION_READY`/`DEGRADED`/
`UNAVAILABLE`) but end-to-end model remains PARTIAL.

## Critical Boundaries

- No Docker socket, privileged container, `CAP_SYS_ADMIN`, host PID/network, or
  unsandboxed fallback.
- Never move untrusted execution into Judge Service/API/Web/Core.
- Preserve Worker-to-Supervisor `127.0.0.1:19092`.
- Judge Service must never receive Product PostgreSQL credentials.
- Supervisor remains dedicated non-root, rootless runc, cgroup v2, namespaces,
  and immutable compiler-rootfs boundary.
- Mac real Judge execution remains BLOCKED / NOT TARGET.
- Full Linux ARM64 Judge remains NOT QUALIFIED.
- Windows Docker proxy `127.0.0.1:10808` is machine-local; never commit it.

## Next Action

1. Run `JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on native Linux amd64.
2. Resume Mac only with real hardware.

## Model

- Phase 6B Judge/Sandbox work: `GPT-5.6 Sol` + high reasoning.
- Mechanical UI/ordinary documentation: Terra.

## References

- Binding design: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Phase 6B-5 evidence:
  `Docs/reports/OJPLATFORM_DOCKER_PHASE6B5_SANDBOX_SECURITY_REGRESSION_V1_REPORT.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-18 (Docker Phase 6B-6 hardening PASS / native pending)
