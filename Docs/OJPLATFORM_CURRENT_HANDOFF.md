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
Phase 6B-4 sandbox privilege hardening  PASS / FEATURE COMPLETE
Phase 6B-5 onward ..................... NEXT / NOT STARTED
Phase 7–9 ............................ NOT STARTED
```

## Docker Judge Result

- Phase 6B-1/2/3 = PASS / MERGED.
- Phase 6B-4 sandbox privilege hardening = PASS / FEATURE COMPLETE.
- Redis 7.4.1 uses isolated Product/Judge/Worker/health/admin ACL identities;
  default user is disabled and fail-closed tests passed.
- WSL `oj-sandbox` now has only its primary group. Fresh process and systemd-user
  contexts cannot access the Docker socket/API; trusted runc preflight/probe passed.
- Isolated WSL2 runtime proved API Compose DNS, host loopback Judge/Redis,
  registration, heartbeat, trusted fixture lease/resolve, auth rejection,
  Judge/API/Redis restart recovery, Supervisor-protocol fail-closed behavior,
  incarnation fencing, graceful shutdown, loopback binds, and cleanup.
- Worker readiness now requires Judge control plane, Redis, and Supervisor
  preflight. Judge Service reconnects Redis after dependency restart.
- No user Submission, untrusted code, real Supervisor/runc, rootfs, cgroup,
  shared runtime, or real user DB was touched.

## Judge Architecture

```text
Docker: Product API -> Judge Service -> Judge PostgreSQL + Judge Redis
Host:   optional Host Agent -> Worker -> 127.0.0.1:19092 Supervisor -> runc
```

Container API uses `judge-service:3100`; same-host Worker uses loopback. Worker,
Host Agent, and Supervisor stay host-native. Durable execution-ready state is
still a MEDIUM observability gap; Worker itself fails closed.

## Production Boundary

Worker Redis ACL and `oj-sandbox` Docker-group HIGH blockers are RESOLVED.
Production Judge remains unqualified pending Phase 6B-5 full sandbox security
regression and Phase 6B-6 production qualification.

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

1. Phase 6B-5: disposable-host full sandbox security regression.
2. Phase 6B-6: production qualification. Resume Mac only with real hardware.

## Model

- Phase 6B Judge/Sandbox work: `GPT-5.6 Sol` + high reasoning.
- Mechanical UI/ordinary documentation: Terra.

## References

- Binding design: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Phase 6B-4 evidence:
  `Docs/reports/OJPLATFORM_DOCKER_PHASE6B4_SANDBOX_PRIVILEGE_HARDENING_V1_REPORT.md`.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open one report.

Last Updated: 2026-09-18 (Docker Phase 6B-4 PASS / FEATURE COMPLETE)
