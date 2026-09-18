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
Phase 6B-2 onward ..................... NOT STARTED
Phase 7–9 ............................ NOT STARTED
```

## Phase 6B-1 Result (MERGED)

- Non-root `Dockerfile.judge-service` runtime + migration targets; profile
  `judge` = `judge-bootstrap` -> `migrate-judge` -> `judge-service`.
- Validated on Windows/WSL2 `linux/amd64` with isolated volumes: fresh start,
  second no-op migration, failure gate, health/readiness, runtime security
  inspection, API Compose DNS, loopback bridge, Core no-profile regression.
- Judge Service gets Judge DB/Redis/service/node settings only; no Product DB,
  MinIO, Docker socket, runc, compiler rootfs, or execution path.
- Production publishes Judge Service on `127.0.0.1` only; no public Judge
  ingress. Judge Service `linux/arm64` image = NOT VERIFIED (machine-local
  BuildKit TLS timeout), so no ARM64 claim.
- Evidence: `Docs/reports/OJPLATFORM_DOCKER_PHASE6B1_JUDGE_SERVICE_V1_REPORT.md`.

## Judge Architecture

```text
Docker control plane:
  Product API -> Judge Service -> Judge PostgreSQL + Judge Redis
  postgres healthy -> judge-bootstrap -> migrate-judge -> judge-service
Linux amd64 execution cell:
  Host Agent -> Worker -> 127.0.0.1:19092 Supervisor -> rootless runc
```

Worker, Host Agent, and Supervisor remain host-side. Docker container is not the
submission sandbox. Real submission execution was not run in Phase 6B-1.

## Production Blockers (HIGH, OPEN)

1. Live WSL `oj-sandbox` belongs to the `docker` group.
2. Service-mode Worker uses shared Redis without ACL isolation.

These do not block controlled Phase 6B work. They block production Judge
qualification. Execution-cell security regression also remains pending.

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

1. Phase 6B-2: keep Worker host-native and remove direct Redis from service mode
   or implement dedicated Judge Redis ACL isolation.
2. Then qualify Supervisor connectivity, a disposable Linux amd64 execution host,
   and the full sandbox security regression. Do not claim production readiness early.
3. Resume Phase 5 Mac only when real Mac hardware exists.

## Model

- Phase 6B Judge/Sandbox work: `GPT-5.6 Sol` + high reasoning.
- Mechanical UI/ordinary documentation: Terra.

## References

- Binding design: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.
- Phase 6B-1 evidence: report above.
- Historical details: search `Docs/PROJECT_STATUS.md`, then open at most one
  matching report.

Last Updated: 2026-09-18 (Docker Phase 6B-1 PASS / MERGED)
