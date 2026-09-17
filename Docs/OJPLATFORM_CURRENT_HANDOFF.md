# OJPlatform Current Handoff

> IMPORTANT: This file is a navigation/state summary, not a replacement for live
> inspection. Before acting: live-check Git, inspect the relevant code, and read
> the latest referenced report. If this file and live code/Git disagree, LIVE
> CODE / GIT WINS — then update this file.

## How To Use This File

- This is the first entry point for any new Codex/agent session in OJPlatform.
  Read it, then `Docs/PROJECT_STATUS.md`, then only the reports listed under
  [Relevant Reports](#relevant-reports).
- Git state in this file is `LAST KNOWN STATE` only. Never treat any hash here
  as current truth. Always live-check first:

```text
git branch --show-current
git rev-parse HEAD
git rev-parse refs/heads/main
git status --short
```

- Repository documentation is the durable project memory. Chat/session memory is
  supplemental only. "The assistant should remember" is not a recovery mechanism.
- This file is maintained only for phase-level changes (PASS / merged / blocked /
  deferred / resumed). It is not updated per commit.

## Current Main Rule

- Any Git hash written anywhere in `Docs/` is `LAST KNOWN STATE`, never current
  truth. Every task MUST live-check `git rev-parse refs/heads/main` before acting.
- Last known state at the time of writing: `main` = `7f49d1c`
  (`merge: integrate Durable Project Memory Bootstrap V1`). Docker Phase 4 and
  this memory bootstrap are integrated in `main`; Docker Phase 5 work is
  documented on branch `codex/docker-phase5-cross-platform-v1` and is NOT in
  `main`.

## Current Product State

- Product `main` is stable and integrated; the Docker work runs beside it, not
  instead of it.
- Core stack: Web (Vite/React) + API (Node) + PostgreSQL + Redis + MinIO, with a
  one-shot `migrate-product` migration job.
- Judge boundary: Judge Worker, Supervisor, and rootless-runc sandbox remain a
  separate, non-containerized Linux/WSL runtime behind the Judge Protocol. Judge
  never touches Application PostgreSQL directly.
- OnlineCodeEditor is a separate plugin source consumed at Web build time.

## Docker Roadmap

Roadmap source: `Docs/reports/OJPLATFORM_DOCKER_READINESS_AUDIT_V1_REPORT.md`.

```text
Phase 0 — Docker Readiness Audit ................ DONE (report status PARTIAL)
Phase 1 — PostgreSQL / Redis / MinIO Compose .... PASS (merged to main)
Phase 2 — Migration Architecture ................ PASS (merged to main)
Phase 3 — API Container ......................... PASS (merged to main)
Phase 4 — Web + Nginx Container ................. PASS (merged to main)
Phase 5 — Windows + macOS Cross-Platform Qual ... PARTIAL
Phase 6 — Judge Docker architecture/qualification NOT STARTED
Phase 7 — One-command bootstrap ................. NOT STARTED
Phase 8 — Production Compose .................... NOT STARTED
Phase 9 — GitHub Actions / GHCR ................. NOT STARTED
```

Phase 0 is an audit, not an implementation phase. Its report deliberately ends
with `DOCKER READINESS = PARTIAL` because Web, API, and Judge containerization
were only conditionally feasible at audit time. `SAFE TO START PHASE 1 = YES`
was the audit's gate, and Phases 1–4 have since been delivered.

Phase 5 detail:

```text
Windows lane (WSL2 amd64, real Docker) .......... PASS
Windows fresh-clone Core startup ................ PASS
Windows WSL2 amd64 API/Web image builds ......... PASS
Windows browser + OnlineCodeEditor in Docker .... PASS
Mac lane (Intel / Apple Silicon) ................ PENDING
Mac Intel ....................................... NOT TESTED
Mac Apple Silicon ............................... NOT TESTED
Native ARM64 API image .......................... NOT TESTED
Native ARM64 Web image .......................... NOT TESTED
OnlineCodeEditor acquisition/distribution ....... PARTIAL
Phase 5 overall ................................. PARTIAL
```

Phase 5 must NOT be marked `PASS` until a real Mac performs qualification.
`CONFIG_PORTABLE` (static config + published image manifests) is not Mac runtime
evidence. Never use `platform: linux/amd64` on Apple Silicon to fake an ARM64
result.

Phase 5 evidence lives outside `main`:

- branch `codex/docker-phase5-cross-platform-v1`, tip `f802833`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE5_CROSS_PLATFORM_V1_REPORT.md`
- `Docs/deployment/MAC_DOCKER_QUALIFICATION_HANDOFF.md`
- `Docs/deployment/MAC_DOCKER_SETUP.md` (unverified command plan, not evidence)

## DEFERRED — Resume When Company Mac Is Available

The real Mac is currently unavailable (owner is away from the office). This does
NOT block independent Windows/WSL work.

When a company Mac becomes available, resume by executing
`Docs/deployment/MAC_DOCKER_QUALIFICATION_HANDOFF.md`:

1. Record `sw_vers`, `uname -m`, Docker/Compose/Buildx/Node/pnpm versions; state
   the lane exactly (`MAC_INTEL` vs `MAC_ARM64`).
2. Fresh clone of OJPlatform plus a separate OnlineCodeEditor checkout.
3. Docker Desktop qualification; render base/dev/prod Compose.
4. Native API build and native Web build; inspect both generated image
   architectures (Apple Silicon must be native `linux/arm64`).
5. Fresh-volume Core startup, `migrate-product` exit 0, all health checks.
6. Product migrations + browser smoke at `/`, `/problems`, `/contests`,
   `/homework`, `/submissions`, same-origin `/api/*`.
7. OnlineCodeEditor selectors `.online-code-editor-host`, `.cm-editor`,
   `.cm-content` on an isolated disposable problem.
8. Second startup: normal `down`, then `up`; migration is a no-op and
   PostgreSQL/MinIO data persists.
9. Remove only the isolated qualification project's containers/networks/volumes.
10. Update the Phase 5 report; do not convert Windows evidence into Mac evidence.

## Phase 6 Parallel Decision

- The Phase 5 Mac lane may stay suspended. Phase 6 (Judge Docker architecture /
  security design and Linux–WSL qualification) may START on Windows + WSL without
  waiting for a real Mac.
- Phase 5 overall stays `PARTIAL` until a real Mac completes qualification, even
  if Phase 6 progresses.
- A Windows/WSL Judge result MUST NOT be reported as `macOS Judge PASS`.

## Judge Mac Boundary

```text
JUDGE MAC REAL EXECUTION = BLOCKED / NOT A CURRENT TARGET
```

Judge execution depends on Linux, runc, cgroup v2, namespaces, a compiler
rootfs, and an untrusted-code sandbox. macOS/Docker Desktop is not a supported
Judge execution target, and this is a design limitation — not a defect and not a
reason to avoid Mac work.

A Mac can still run Web, API, PostgreSQL, Redis, MinIO, `migrate-product`,
`OnlineCodeEditor`, and the full Docker Core stack.

## Model Recommendations

- Ordinary UI / Compose / API / Web / integration / documentation work: Terra is
  generally sufficient.
- The next large phase is **Phase 6 — Judge Docker / Sandbox architecture and
  security qualification**. Use the strongest available reasoning model
  (planned: `GPT-5.6 Sol`, high reasoning).

Why: runc, cgroup v2, namespaces, sandbox isolation, untrusted user code,
compiler rootfs, Worker/Supervisor trust boundary, credentials, amd64/arm64
differences, and security regression risk. Do not default to a low-reasoning
model for Judge/sandbox security architecture.

## NEXT ACTION

1. Phase 5 Mac lane = `DEFERRED` until a real Mac is available.
2. Windows + WSL may proceed with Phase 6 Judge Docker architecture and security
   audit.
3. Before Phase 6 implementation, switch to `GPT-5.6 Sol` + high reasoning.
4. Do NOT mark Phase 5 `PASS`.
5. Do NOT modify Mac claims without real Mac evidence.
6. Do NOT claim Phase 6 started until Phase 6 work actually begins.

## Current Docker Core Architecture

```text
Browser
  ↓
Web container (Nginx, SPA + /api proxy)   ← build-time input: OnlineCodeEditor
  ↓
API container (stateless HTTP)
  ↓
PostgreSQL   Redis   MinIO
```

- Migration: one-shot `migrate-product` job (API never self-migrates; no
  migration racing between API replicas).
- `compose.yaml` + `compose.dev.yaml` + `compose.prod.yaml`; production renders
  Web as the only published ingress, all other services stay on an internal
  network. Dev ports are loopback-only.
- API/Web run read-only with `/tmp` tmpfs and `no-new-privileges`.
- Currently validated platform: Windows 11 + Ubuntu-24.04 WSL2 Docker Engine,
  `linux/amd64`.
- Judge runtime: not containerized yet.

Do not copy full phase reports here; read the report when details are needed.

## LOCAL ENVIRONMENT NOTE — Docker Daemon Proxy

- The current Windows development machine reaches the internet through a user
  xray proxy, and the Docker daemon must use it. Current local daemon proxy:
  `127.0.0.1:10808` (configured in the daemon systemd drop-in inside WSL2; an
  older value `127.0.0.1:10809` is recorded in historical docs, e.g.
  `Docs/ENVIRONMENT_BASELINE.md`, and in older reports).
- THIS IS MACHINE-LOCAL. It is not a repository requirement, not a Docker Compose
  requirement, and not a default for open-source users.
- Do not write `10808` into product/Docker configuration.
- If the proxy port changes again, re-check the Docker daemon proxy before
  assuming a registry/network failure is a product bug.

## OnlineCodeEditor State

```text
Docker build path portability .................. PASS
Acquisition / distribution ..................... PARTIAL
```

- OnlineCodeEditor is a separate source repository. It is not a Git submodule and
  has no package-registry distribution.
- Portable contract: `parent/OJPlatform` + `parent/OnlineCodeEditor`, with
  `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT=../OnlineCodeEditor` as a build-time
  input only. The image normalizes it to `/plugins/OnlineCodeEditor`; the Web
  runtime has no host mounts.
- A fresh machine still needs a project owner to supply an approved acquisition
  URL or archive, so acquisition is `PARTIAL`, not "one-command open source".
- Possible future options (undecided, do not implement without a Goal): separate
  GitHub repo, submodule, or package.

## Known Non-Docker Product Debt

Verified live on `main` `b7dad60`. These are pre-existing baseline debt and MUST
NOT be attributed to Docker, and MUST NOT be "fixed" inside a Docker/governance
task.

- `tests/web.test.tsx` → `renders submission history and safely displays source
  as text` fails with an unhandled
  `TypeError: Cannot read properties of undefined (reading 'map')` at
  `apps/web/src/features/submissions/SubmissionHistoryPage.tsx:211`
  (`statistics?.trend.map(...)` when `statistics` exists but `trend` is
  undefined). Live re-run on `main` `b7dad60`: `1 failed | 11 passed`.
- Route gap: `/blog` has no client route in `apps/web/src/app/App.tsx` (`route()`
  falls through to `not-found`); the discussion hub lives at `/discussion`. The
  Nginx SPA fallback still answers `/blog` with the app shell, which can look
  like a pass in container smoke tests.
- Other recorded debt (Judge Runtime Manager legacy `scripts/dev-runtime.ps1`,
  unrelated full-suite lint findings) is documented in `Docs/PROJECT_STATUS.md`
  and is out of scope here.

## Relevant Reports

Read only what the current task needs.

Docker roadmap and phases:

- `Docs/reports/OJPLATFORM_DOCKER_READINESS_AUDIT_V1_REPORT.md` (Phase 0)
- `Docs/reports/OJPLATFORM_DOCKER_PHASE1_INFRASTRUCTURE_COMPOSE_V1_INTEGRATION_REPORT.md`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE2_MIGRATION_ARCHITECTURE_V1_INTEGRATION_REPORT.md`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE3_API_CONTAINER_V1_INTEGRATION_REPORT.md`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE4_WEB_CONTAINER_V1_INTEGRATION_REPORT.md`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE5_CROSS_PLATFORM_V1_REPORT.md`
  (on branch `codex/docker-phase5-cross-platform-v1`, not yet in `main`)

Mac / cross-platform:

- `Docs/deployment/MAC_DOCKER_QUALIFICATION_HANDOFF.md`
  (on branch `codex/docker-phase5-cross-platform-v1`, not yet in `main`)
- `Docs/deployment/MAC_DOCKER_SETUP.md` (unverified plan, same branch)

Docker design docs:

- `Docs/deployment/DOCKER_INFRASTRUCTURE.md`
- `Docs/deployment/DOCKER_API.md`
- `Docs/deployment/DOCKER_WEB.md`
- `Docs/deployment/DATABASE_MIGRATIONS.md`

Judge boundary and governance:

- `Docs/reports/OJPLATFORM_DURABLE_PROJECT_MEMORY_BOOTSTRAP_V1_INTEGRATION_REPORT.md`
- `Docs/parallel/JUDGE_SERVICE_WORKER_SUPERVISOR_HANDOFF_CONTRACT_V1.md`
- `Docs/parallel/JUDGE_SERVICE_DEPLOYMENT_BOUNDARY_V1.md`
- `Docs/PROJECT_STATUS.md`
- `AGENTS.md`

## Maintenance Rule

Update this file only when a major phase changes state: PASS, merged, blocked,
deferred, or resumed. Update only `Current Product State`, `Docker Roadmap`,
deferred items, `NEXT ACTION`, `Relevant Reports`, and `Model Recommendations`
(only if they changed). Do not edit this file for routine commits.

Last Updated: 2026-09-17
