# OJPlatform Current Handoff

> HOT STATE only. Live Git/code wins over this file. Do not preload
> `Docs/PROJECT_STATUS.md` or historical reports unless this file is
> insufficient. Any hash here is `LAST KNOWN STATE` only.

## Rule

- Live-check first: `git branch --show-current`, `git rev-parse HEAD`,
  `git rev-parse refs/heads/main`, `git status --short`.
- This file holds unfinished work, blockers, boundaries, and next action only;
  finished work is compressed to `NAME = PASS / MERGED`.
- Keep it short (target 60–100 lines, ceiling 120); delete merged detail, since
  `Docs/PROJECT_STATUS.md` and the phase report already hold it.

## Completed Baseline

- Docker Phase 0 readiness audit: DONE; original verdict `DOCKER READINESS = PARTIAL`.
- Docker Phase 1–4: PASS / MERGED.
- Docker Phase 6A Judge architecture + sandbox security audit: PASS / MERGED.

## Active / Unfinished

```text
Phase 5 Docker cross-platform qualification ..... PARTIAL
  Windows lane (WSL2 amd64, real Docker) ........ PASS
  Mac Intel / Apple Silicon .................... PENDING (NOT TESTED)
  Native ARM64 API / Web images ................ NOT TESTED
  OnlineCodeEditor acquisition/distribution .... PARTIAL
Phase 6B Judge Docker implementation ............ NOT STARTED
Phase 7-9 (bootstrap / prod Compose / CI-GHCR) .. NOT STARTED
```

## Judge Architecture (Phase 6A audit)

- Containerize the Judge control plane: `judge-bootstrap`, `migrate-judge`,
  Judge Service.
- Keep host-side on Linux amd64: Host Agent, Worker, Supervisor, rootless runc,
  cgroup v2, namespaces, compiler rootfs.
- No Docker socket anywhere; Supervisor stays loopback-only.

## Production Blockers (HIGH, open)

1. Live WSL `oj-sandbox` belongs to the `docker` group; remove before production qualification.
2. Service-mode Worker still uses shared ACL-less Redis; tighten Redis credential/ACL isolation.

These block production Judge qualification only; controlled Phase 6B may start.

Sandbox `network/filesystem/process/cgroup = PASS` are audit-level findings.
Phase 6B still owes real security regression qualification, so no new Docker
deployment is production-qualified.

## Deferred

- Real Mac qualification: no company Mac available now; does not block Windows/WSL work.

## Next Action

1. Phase 5 Mac lane stays DEFERRED until a real Mac is available.
2. Phase 6B controlled implementation, in audited order: Judge Service image,
   Worker host/container decision, Supervisor connectivity, Linux sandbox
   qualification, security regression, Compose judge profile.
3. Do not weaken Supervisor loopback, add Docker socket, or claim ARM64/macOS
   Judge support.

## Model

- Phase 6B (Judge Docker / Sandbox): `GPT-5.6 Sol` + high reasoning — runc,
  cgroup v2, namespaces, untrusted code, compiler rootfs, Worker/Supervisor
  trust boundary, credentials, security regression risk.
- Ordinary UI / Compose / API / Web / integration / documentation: Terra.

## Critical Boundaries

- Phase 5 MUST NOT be marked PASS without real Mac evidence; on Apple Silicon
  require native `linux/arm64` — never `platform: linux/amd64` reported as ARM64.
- Judge real execution is Linux-only (runc, cgroup v2, namespaces, compiler
  rootfs, untrusted-code sandbox): `JUDGE MAC REAL EXECUTION = BLOCKED / NOT A
  CURRENT TARGET`. A Mac still runs Web, API, PostgreSQL, Redis, MinIO,
  `migrate-product`, and OnlineCodeEditor.
- Worker→Supervisor uses `127.0.0.1:19092`; inside a Worker container that no
  longer means the host, so `WORKER CONTAINERIZABLE = PARTIAL`.
- Host Agent containerizable = NO; Supervisor containerizable = PARTIAL. Docker
  containers are not themselves the sandbox security boundary.
- Windows/WSL Judge evidence MUST NOT be reported as `macOS Judge PASS`; WSL and
  Linux amd64 remain PARTIAL, ARM64 NOT QUALIFIED.
- If this file disagrees with live code or Git, LIVE CODE / GIT WINS and this
  file must be corrected.
- Windows Docker daemon proxy `127.0.0.1:10808` is MACHINE-LOCAL only, never a
  repository, Compose, or open-source requirement; keep it out of product config.

## Docker Core Snapshot

`Browser → Web/Nginx → API → PostgreSQL + Redis + MinIO`, one-shot
`migrate-product` job, production publishes Web only. Validated: Windows + WSL2
Docker, `linux/amd64`. Judge runtime: not containerized. Known unrelated debt
(discussion lives at `/discussion`, not `/blog`; `SubmissionHistoryPage` web test
needs a `statistics.trend` fixture) is pre-existing and must not be "fixed" here.

## Needed References (only for the unfinished work above)

- Phase 6A: `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`, `Docs/reports/OJPLATFORM_DOCKER_PHASE6A_JUDGE_ARCHITECTURE_SECURITY_AUDIT_V1_REPORT.md`.
- Phase 5 report / Mac handoff / Mac setup plan — branch
  `codex/docker-phase5-cross-platform-v1` (live-check its tip), NOT in `main`.
- Judge boundary: `Docs/parallel/JUDGE_SERVICE_WORKER_SUPERVISOR_HANDOFF_CONTRACT_V1.md`, `JUDGE_SERVICE_DEPLOYMENT_BOUNDARY_V1.md`.
- Docker design: `Docs/deployment/DOCKER_INFRASTRUCTURE.md`, `DOCKER_API.md`, `DOCKER_WEB.md`, `DATABASE_MIGRATIONS.md`.

History workflow (only when this file is insufficient): search
`Docs/PROJECT_STATUS.md` for the keyword, read that section, then at most one
matching `Docs/reports/` file. Never preload the full status log.

## Maintenance

- Update only on phase PASS / merged / blocked / deferred / resumed; record the
  formal status in `Docs/PROJECT_STATUS.md`.
- Compress anything that becomes PASS + merged to `NAME = PASS / MERGED`.
  Routine commits MUST NOT edit this file.

Last Updated: 2026-09-18 (Docker Phase 6A PASS / MERGED)
