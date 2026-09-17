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

## Active / Unfinished

```text
Phase 5 Docker cross-platform qualification ..... PARTIAL
  Windows lane (WSL2 amd64, real Docker) ........ PASS
  Mac Intel / Apple Silicon .................... PENDING (NOT TESTED)
  Native ARM64 API / Web images ................ NOT TESTED
  OnlineCodeEditor acquisition/distribution .... PARTIAL
Phase 6 Judge Docker architecture/security ...... NOT STARTED
Phase 7-9 (bootstrap / prod Compose / CI-GHCR) .. NOT STARTED
```

Phase 5 evidence + Mac steps: see References (branch-only, not in `main`).

## Deferred

- Real Mac qualification: no company Mac available right now; resume via the Mac
  qualification handoff when one exists. Does not block Windows/WSL work.

## Next Action

1. Phase 5 Mac lane stays DEFERRED until a real Mac is available.
2. Phase 6 Judge Docker architecture/security audit MAY proceed now on
   Windows + WSL2, using the Phase 6 model below.
3. Do not mark Phase 5 PASS or claim Phase 6 started before that is true.

## Model

- Phase 6 (Judge Docker / Sandbox): `GPT-5.6 Sol` + high reasoning — runc,
  cgroup v2, namespaces, untrusted code, compiler rootfs, Worker/Supervisor
  trust boundary, credentials, amd64/arm64, security regression risk.
- Ordinary UI / Compose / API / Web / integration / documentation: Terra.

## Critical Boundaries

- Phase 5 MUST NOT be marked PASS without real Mac evidence; on Apple Silicon
  require native `linux/arm64` — never `platform: linux/amd64` reported as ARM64.
- Judge real execution is Linux-only (runc, cgroup v2, namespaces, compiler
  rootfs, untrusted-code sandbox): `JUDGE MAC REAL EXECUTION = BLOCKED / NOT A
  CURRENT TARGET`. A Mac still runs Web, API, PostgreSQL, Redis, MinIO,
  `migrate-product`, and OnlineCodeEditor.
- Windows/WSL Judge evidence MUST NOT be reported as `macOS Judge PASS`.
- If this file disagrees with live code or Git, LIVE CODE / GIT WINS and this
  file must be corrected.
- Windows Docker daemon proxy `127.0.0.1:10808` is MACHINE-LOCAL only, never a
  repository, Compose, or open-source requirement; keep it out of product config.

## Docker Core Snapshot

`Browser → Web/Nginx → API → PostgreSQL + Redis + MinIO`, one-shot
`migrate-product` job, production publishes Web only. Validated: Windows + WSL2
Docker, `linux/amd64`. Judge runtime: not containerized.

## Known Unrelated Debt

Pre-existing, not Docker-caused, not to be "fixed" inside Docker/governance
tasks: `/blog` route gap (discussion lives at `/discussion`), and the
`SubmissionHistoryPage` web test failing on a missing `statistics.trend` fixture.

## Needed References (only for the unfinished work above)

- Phase 5 report / Mac qualification handoff / Mac setup plan — branch
  `codex/docker-phase5-cross-platform-v1` (live-check its tip), NOT in `main`.
- Judge boundary: `Docs/parallel/JUDGE_SERVICE_WORKER_SUPERVISOR_HANDOFF_CONTRACT_V1.md`,
  `JUDGE_SERVICE_DEPLOYMENT_BOUNDARY_V1.md`.
- Docker design: `Docs/deployment/DOCKER_INFRASTRUCTURE.md`, `DOCKER_API.md`,
  `DOCKER_WEB.md`, `DATABASE_MIGRATIONS.md`.

History workflow (only when this file is insufficient): search
`Docs/PROJECT_STATUS.md` for the keyword, read that section, then at most one
matching `Docs/reports/` file. Never preload the full status log.

## Maintenance

- Update only on phase PASS / merged / blocked / deferred / resumed; record the
  formal status in `Docs/PROJECT_STATUS.md`.
- Compress anything that becomes PASS + merged to `NAME = PASS / MERGED`.
  Routine commits MUST NOT edit this file.

Last Updated: 2026-09-17
