# OJPlatform Docker Readiness Audit V1

## Live Baseline

- Audit date: 2026-09-16.
- Canonical root: `D:\OJPlatform` on `main`.
- `HEAD` and `refs/heads/main`: `8e391be7d0250a61ca223c75c45b4e5aa0a956d7`.
- Tracked worktree: clean at audit start and no runtime/database state was changed.
- Existing stashes and all listed worktrees were preserved. No merge, checkout, reset, clean, migration, fixture, or process operation occurred.
- Architecture baseline requires separate API, Judge, and Sandbox trust boundaries. A Judge Worker must never receive Product PostgreSQL credentials.

## Existing Docker Assets

| Path | Purpose | Status | Reusable |
| --- | --- | --- | --- |
| `deploy/docker/compose.yml` | Local PostgreSQL 16.4, Redis 7.4.1, and MinIO infrastructure for Runtime Manager | Active local-development asset; Compose validation completed | Yes, as Phase 1 input, after secrets/port/profile redesign |
| `scripts/infra.mjs` | Runs the infrastructure Compose; uses WSL `Ubuntu-24.04` on Windows | Windows-oriented local helper | No, not cross-platform Docker UX |
| `scripts/infra-wait.mjs` | Waits for Compose health | Local helper | Partial; Windows WSL branch must be removed/reworked |
| `scripts/phase2c1-compiler-rootfs.Dockerfile` | Builds pinned Ubuntu/GCC 13 compiler rootfs input | Judge build artifact preparation, not service image | Yes, only as Judge image/rootfs build input |
| `scripts/phase2c1-prepare-compiler-rootfs.sh` | Prepares/verifies immutable Linux compiler rootfs | Linux/WSL-only Judge tooling | No direct Compose use without Linux qualification |
| `Docs/deployment/LOCAL_DEVELOPMENT_INFRASTRUCTURE.md` and WSL Docker reports | Records Docker CE/WSL local-infrastructure qualification and recovery history | Historical/local-runtime evidence | Yes, as Windows WSL constraints; not cross-platform deployment proof |

No tracked `Dockerfile` for Web/API/Judge service, root `.dockerignore`, application-level Compose file, devcontainer, or CI image build was found. CI runs local infrastructure and application tests on Ubuntu but does not build/publish images. Existing Compose deliberately exposes local ports `55432`, `56379`, `59000`, and `59001`, so it is not production Compose.

## Current Runtime Architecture

Current Runtime Manager is Windows PowerShell plus WSL-native Docker (`Ubuntu-24.04`):

```text
Browser -> Vite Web :5173 -> API :3010
                              |-> PostgreSQL :55432
                              |-> Redis :56379
                              |-> MinIO :59000
                              |-> Judge Service :3100
Judge Service -> Host Agent :3180 -> Go Worker -> loopback Supervisor :19092
                                            -> rootless runc / cgroup v2 / compiler rootfs
```

`scripts/dev-runtime.ps1` owns full local startup/shutdown. It creates/migrates Product and Judge databases, runs API/Web/Judge components as host processes, and preserves named infrastructure volumes. This must remain unchanged during Docker Phase 1.

## Web

### WEB BUILD CONTRACT

- Package: `@ojplatform/web`; package manager: pnpm `11.19.0`; Node: `>=22.20.0 <25`.
- Dev: `pnpm --filter @ojplatform/web dev` (Vite).
- Build: `pnpm --filter @ojplatform/web build`; Vite default output is `apps/web/dist`.
- Preview/dev proxy: `/api` and `/ready` proxy to `http://127.0.0.1:${OJPLATFORM_API_PORT:-3010}`.
- Vite resolves `@ojplatform/online-code-editor` from `OJPLATFORM_ONLINE_CODE_EDITOR_ROOT`, defaulting to `D:/OJPlatformPlugins/OnlineCodeEditor`.
- Browser code uses relative API paths through proxy; no production runtime API URL mechanism was found.

Development recommendation: **A, Vite in a Node container**, only after the plugin path becomes a container-safe mount/configuration. Use source bind mount plus an anonymous/named container `node_modules` volume. macOS/Windows bind mounts may be slow; allow a documented host-Vite profile as an alternative.

Production recommendation: **A, Nginx serves immutable `dist`** and reverse-proxies `/api`/`/ready` to API. This avoids baking API origins into static assets and keeps browser same-origin routing. Add Nginx SPA fallback (`try_files ... /index.html`) for client routes.

## API

### API BUILD CONTRACT

- Package: `@ojplatform/api`; dev entrypoint: `tsx src/server.ts`; build: `tsc -p tsconfig.json`.
- Runtime entrypoint after build: `node dist/apps/api/server.js` (from `apps/api/tsconfig.json`).
- Fastify supports `SIGINT` and `SIGTERM` shutdown.
- `/health` is liveness; `/ready` checks PostgreSQL, Redis, and S3 bucket availability.
- API creates the configured S3 bucket during infrastructure construction via `ensureBucket`.

### API CONTAINER REQUIREMENTS

- Set `HOST=0.0.0.0`, `PORT=<container port>`, and `OJPLATFORM_CORS_ORIGINS=<published web origin>`.
- Replace default loopback values with service DNS: `DATABASE_URL=postgres://...@postgres:5432/...`, `REDIS_URL=redis://redis:6379`, `S3_ENDPOINT=http://minio:9000`, `JUDGE_SERVICE_URL=http://judge:3100`.
- Supply `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, Judge service token(s), artifact-read token, and auth secrets as environment/secrets.
- API has no required writable application directory; uploads/artifacts are object storage. Temporary upload behavior still needs container filesystem quota review.
- Current defaults (`127.0.0.1`, host `127.0.0.1`) are host-runtime defaults, not container-safe defaults.

## PostgreSQL

- Existing image: `postgres:16.4-alpine`; database/user defaults are `ojplatform`; host port is `55432`.
- Product schema is ordered SQL under `packages/database/migrations`; formal history currently reaches `0036_contest_development_provenance`.
- Separate Judge database is `ojplatform_judge`, initialized by `scripts/judge-service-bootstrap.mjs`, with least-privilege Judge role and its own `packages/judge-runtime/migrations` history.
- Official PostgreSQL image is appropriate. Future Compose needs `postgres-data:/var/lib/postgresql/data`, `pg_isready` healthcheck, and no public port by default.
- Backups: document scheduled logical `pg_dump`, restore rehearsal, retention, and a consistent MinIO backup pair. Docker volumes alone are not backup.

## Redis

- Existing image: `redis:7.4.1-alpine`; host port `56379`; healthcheck is `redis-cli ping`.
- Used as transient Judge queue, leases, worker heartbeats, and progress events. No password is configured in current local Compose.
- Official image is sufficient for Phase 1. Production must configure authentication, restrict network access, and choose AOF persistence deliberately. Keep `redis-data` only when queue recovery/persistence policy requires it.

## MinIO

- Existing image: `minio/minio:RELEASE.2024-12-18T13-15-44Z`; API uses S3 SDK and bucket `ojplatform-dev` by default.
- Stores problem JudgeData and profile media; API bootstraps the configured bucket. Browser does not need direct MinIO access in current design.
- Official MinIO image is appropriate. Persist `/data` as `minio-data`; retain console only in development profile. Production needs non-default root credentials, private bucket policy, and backup/restore documentation.
- Current healthcheck uses `mc ready local`; implementation must verify this command remains available in pinned MinIO image. Prefer documented HTTP `/minio/health/ready` if image CLI availability is uncertain.

## Migrations

- `scripts/migrate.mjs` is a simple ordered full-replay SQL runner. It has no migration ledger or checksum; it replays every listed migration each run.
- `scripts/dev-runtime-migrate.mjs` has a checksum ledger and transaction per file, but it is Runtime Manager-specific. `scripts/judge-service-migrate.mjs` also replays its SQL without a ledger.
- Existing reports identify a pre-existing non-idempotent full-replay failure around historical `0020_judge_artifacts`; do not repair it in this phase.

Recommendation: **B, one-shot `migrate` service** for Product schema and separate one-shot `judge-bootstrap`/`judge-migrate` services. API must never self-migrate; multiple API replicas must not race migrations. Phase 2 must first make Product/Judge migration execution ledgered, idempotent, and fresh-volume tested.

## Development Fixtures

All fixture scripts require `OJPLATFORM_DEVELOPMENT_FIXTURES=true` and `DATABASE_URL`. Home, Problem Library, Blog, and Contest additionally reject non-loopback database hosts. Evaluation currently has development guard but lacks equivalent loopback-host guard; this is a deployment blocker for a generalized Compose seed command.

| Surface | Command | Prerequisite | Cleanup |
| --- | --- | --- | --- |
| Home | `pnpm seed:home-development` | Migrated Product DB | No standalone cleanup command found; seed is transactional/reseed-oriented |
| Problem Library | `pnpm seed:problem-library-development` | Migrations and tag catalog | Script supports `--clean`; not exposed as root script |
| Blog | `pnpm seed:blog-development` | Migrated Product DB | No CLI cleanup switch; reseeding deletes its known post relations |
| Evaluation | `pnpm seed:evaluation-development` | Problem Library fixture first | Script supports `--clean`; no localhost guard |
| Contest | `pnpm seed:contest-development` | Problem Library fixture first, at least eight public fixture problems | `pnpm cleanup:contest-development` |

Future development profile: `docker compose --profile fixtures run --rm seed-development`. It must be opt-in, require a dedicated development Compose project/database, and never join production startup.

## Judge Service

- Judge Service is Fastify/TypeScript (`apps/judge-service`), default port `3100`, with public `/health` and `/ready`.
- It requires `JUDGE_DATABASE_URL`, `JUDGE_REDIS_URL`, `JUDGE_SERVICE_TOKEN`, and distinct `JUDGE_NODE_TOKEN`; it owns Redis coordination and Judge-only PostgreSQL projections.
- Product API uses `JudgeServiceClient` only when `JUDGE_SERVICE_URL` and `JUDGE_SERVICE_TOKEN` are configured. Product DB access stays API-only.
- Local Host Agent is TypeScript at `3180`, persists node state locally, and launches worker templates.
- Judge Worker is Go. It uses Redis plus authenticated Judge Service; it has no Product PostgreSQL configuration.
- Real submissions pass from Worker only to a loopback Supervisor (`127.0.0.1:19092`). Supervisor requires Linux `runc`, cgroups v2, namespaces, systemd user unit/delegation, an immutable GCC 13 rootfs under `/opt/ojplatform/compiler-rootfs`, and private staging/workspace paths.

## Judge Sandbox Boundary

Judge must remain an independent deployment unit. Do not put it in the API container and do not mount Docker socket, Product DB credentials, source checkout, host root, or deployment secrets into its execution container.

Existing Phase 2B evidence qualifies a frozen trusted-probe-only local WSL/rootless-runc contract. It does **not** qualify generic production Docker execution, Docker Desktop, macOS, Apple Silicon, or an arbitrary container runtime. Real submission execution is Linux-oriented and must fail closed when Supervisor isolation preflight fails.

## Windows-Specific Dependencies

| Finding | Classification | Docker impact |
| --- | --- | --- |
| `OJPlatform-*.bat`, `scripts/dev-runtime.ps1` | A. Windows launcher/runtime manager | Keep; replace with separate cross-platform Docker entrypoint later |
| `scripts/infra.mjs`, `scripts/infra-wait.mjs` call `wsl.exe -d Ubuntu-24.04` | B. Runtime blocker for current helper | Cannot be Docker UX on macOS/Linux |
| Vite plugin default `D:/OJPlatformPlugins/OnlineCodeEditor` | B. Build/runtime blocker | Must become repo-contained package, explicit mount, or container path setting |
| WSL systemd/user unit, `runc`, cgroup checks, `/opt` rootfs | B. Judge runtime blocker | Linux-specific; needs distinct Linux container/host qualification |
| Go tests skipping real process tests on Windows | C. Test-only evidence gap | Confirms Windows host is not Judge qualification target |
| `D:\private\internal.ts` test error string and docs | C/D. Test/docs | Not runtime Docker blockers |

## macOS Compatibility

| Area | Intel | Apple Silicon | Notes |
| --- | --- | --- | --- |
| Web/API containers | LIKELY SUPPORTED | LIKELY SUPPORTED | Node image/build and plugin path remediation required |
| PostgreSQL/Redis/MinIO | LIKELY SUPPORTED | LIKELY SUPPORTED | Official image manifests must be pinned and verified in implementation CI |
| Development bind mounts | REQUIRES WORK | REQUIRES WORK | Docker Desktop performance, file ownership, and watch behavior need qualification |
| Host networking | REQUIRES WORK | REQUIRES WORK | Never rely on Linux host-network behavior; publish ports/proxy explicitly |
| Judge real execution | BLOCKED | BLOCKED | Current Supervisor requires Linux rootless runc/cgroups/systemd and has no Docker Desktop qualification |

Use LF (`.gitattributes` already enforces it), preserve executable bits in Linux-oriented scripts, avoid case-collision paths, and document Docker Desktop memory allocation for Judge tests.

## amd64 / arm64 Compatibility

| Component | Classification | Evidence / action |
| --- | --- | --- |
| Web/API TypeScript | NEEDS MULTI-ARCH BUILD | Node deps include platform-specific `esbuild`; build image per target and test both |
| PostgreSQL/Redis/MinIO | MULTI-ARCH SAFE (vendor expected) | Pin digest/platform evidence in Phase 1 CI; do not rely on mutable tags |
| Go Worker | NEEDS MULTI-ARCH BUILD | Go source portable in principle; build/test `linux/amd64` and `linux/arm64` |
| Supervisor/runc/rootfs/GCC profile | AMD64 ONLY / UNKNOWN | Existing qualified environment is WSL Ubuntu amd64; no arm64 rootfs identity or execution evidence |
| Judge profile | AMD64 ONLY | Do not emulate arm64 Judge as supported without dedicated attack/regression qualification |

## Environment Variables

### Required

- `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `JUDGE_DATABASE_URL`, `JUDGE_SERVICE_TOKEN`, `JUDGE_NODE_TOKEN`
- `JUDGE_SERVICE_URL` and `JUDGE_ARTIFACT_READ_TOKEN` when Product-to-Judge dispatch is enabled

### Optional

- `HOST`, `PORT`, `OJPLATFORM_CORS_ORIGINS`, `JUDGE_SERVICE_HOST`, `JUDGE_SERVICE_PORT`, `JUDGE_REDIS_URL`, `JUDGE_REDIS_PREFIX`, `JUDGE_NODE_UNHEALTHY_TIMEOUT_MS`, `JUDGE_AUTOSCALER_INTERVAL_MS`
- `JUDGE_HOST_AGENT_URL`, `JUDGE_HOST_AGENT_TOKEN`, `JUDGE_HOST_AGENT_TEMPLATES_JSON`, `JUDGE_HOST_CPU_UNITS`, `JUDGE_HOST_MEMORY_MB`

### Development Only

- `OJPLATFORM_API_PORT`, `OJPLATFORM_ONLINE_CODE_EDITOR_ROOT`, `OJPLATFORM_DEVELOPMENT_FIXTURES`, `RUNTIME_MIGRATION_*`, `JUDGE_DATABASE_ADMIN_URL`, `JUDGE_DATABASE_PASSWORD`

### Production Only

- `OJPLATFORM_AUTH_CALLBACK_BASE_URL`, provider URL/API-key variables, OAuth client IDs/secrets, strong Redis password/TLS settings, external reverse-proxy/TLS settings, secret-manager bindings.

`.env.example` exists but is explicitly local-only, contains loopback endpoints, and lacks Judge/Compose production variable documentation. It must not be copied as production defaults.

## Secrets

Never bake `.env`, PostgreSQL/Judge DB passwords, Redis password, MinIO root/S3 keys, JWT/session/auth-provider secrets, Judge tokens, artifact tokens, OAuth secrets, or private keys into an image. Dockerfiles must not `COPY .env`. Development can use ignored `.env`; production must inject via deployment environment or Docker secrets with least-privilege, distinct Product/Judge credentials.

## Persistent Storage

| Volume/path | Classification | Policy |
| --- | --- | --- |
| `postgres-data` | Persistent | Keep across `docker compose down`; delete only explicit `down -v` |
| `minio-data` | Persistent | Keep across `down`; backup with DB-aware procedure |
| `redis-data` | Policy-dependent | Persistent only if AOF/recovery policy adopted |
| API/Web filesystem | Ephemeral | No source bind mount in production |
| Judge cache/compiler rootfs | Immutable image or read-only persistent cache | Never host-root mount |
| Judge workspaces/artifact materialization | Ephemeral | Private, size-limited, cleanup verified; never persistent volume |
| Host Agent state | Requires design | Current local state path is host-relative; Docker profile needs dedicated ownership/retention design |

## Networking

Use an internal Compose network. Browser reaches only `web`; Nginx proxies `web -> api`. Internal DNS connections are `postgres:5432`, `redis:6379`, `minio:9000`, and `judge:3100`.

API accesses PostgreSQL, Redis, MinIO, and Judge. Judge accesses its own database and Redis, and Worker communicates only through its authenticated protocol/Supervisor boundary. Worker must not receive Product DB credentials. Do not use `127.0.0.1` for inter-container communication.

Development may publish web/API/MinIO console and optionally infrastructure ports. Production should publish reverse proxy/web only; database, Redis, MinIO API/console, Judge, Host Agent, Worker health, and Supervisor remain internal/private.

## Health Checks

| Service | Healthcheck | Startup rule |
| --- | --- | --- |
| PostgreSQL | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` | Migrate waits for healthy |
| Redis | `redis-cli ping` with auth when configured | API/Judge waits for healthy |
| MinIO | HTTP `/minio/health/ready` | API waits for healthy |
| Migrate | Process exit `0` | API starts only after completed successfully |
| API | HTTP `GET /ready` | Web proxy can start independently but marked unavailable until API ready |
| Web | HTTP root/static asset response | Reverse proxy readiness |
| Judge Service | HTTP `GET /ready` | Worker registration after ready |
| Worker | HTTP `GET /ready` plus Judge registration/heartbeat | Judge profile only |

`depends_on: condition: service_healthy` controls ordering, not ongoing readiness or recovery; every client retains connection retry/fail-closed behavior.

## Development Compose Blueprint

Future files: root `compose.yaml` base plus `compose.dev.yaml` override, or clearly documented `docker compose -f` equivalents.

- Services: `postgres`, `redis`, `minio`, `api`, `web`; Judge excluded by default profile.
- API and Web use watch commands, source bind mounts, and container-local `node_modules` anonymous/named volumes.
- Bind only project source and a normalized plugin source/mount; never bind `.env`, `.git`, Docker socket, or host runtime secrets.
- Publish Web; publish API/infra/MinIO console only as opt-in development ports.
- Fixtures live in separate opt-in profile/service and never execute during `up`.

## Production Compose Blueprint

- Files: `compose.yaml` plus `compose.prod.yaml` override; use prebuilt immutable/digest-pinned images.
- Services: `web`, `api`, `postgres`, `redis`, `minio`, one-shot migration services, optional `judge` profile.
- No source bind mounts, Vite, fixtures, broad host port publication, default credentials, or privileged Judge host mounts.
- Set restart policies for long-lived services after dependencies/migrations succeed. Use volumes, healthchecks, non-root runtime users, resource limits, log rotation, and external TLS reverse proxy.

## Dockerfile Blueprint

| File | Stages | Runtime |
| --- | --- | --- |
| `Dockerfile.web` | pnpm dependency/install and Vite build | unprivileged Nginx serving `dist`, SPA fallback and API proxy |
| `Dockerfile.api` | pnpm workspace production build | minimal Node 22 runtime with compiled workspace artifacts, non-root user |
| `Dockerfile.judge-service` | pnpm workspace production build | separate Node 22 non-root Judge control-plane image |
| `Dockerfile.judge-worker` | Go build per target architecture | separate non-root Go Worker image; no Product DB credentials |
| `Dockerfile.judge-supervisor` | Linux-only trusted rootfs/probe build | separate, security-reviewed Linux image; do not implement until qualification scope approved |

Each Dockerfile needs explicit build context, `.dockerignore`, lockfile-frozen install, SBOM/image scan plan, and non-root user. Judge image design needs security review before implementation.

## One Container vs Multi Container

| Concern | All-in-one | Multi-container Compose |
| --- | --- | --- |
| Isolation and Judge boundary | Violates intended separation | Preserves API/Judge/Sandbox boundaries |
| Rebuild/development speed | Rebuilds unrelated services | Rebuilds one service |
| Persistence/backup | Entangles state and code | Explicit per-service volumes |
| Scaling/logs/health | Opaque | Independent lifecycle and logs |
| Judge security | Unsafe coupling with API secrets | Separate credentials/network/profile |

**Recommendation: multi-container Compose.** All-in-one is not recommended.

## Recommended Architecture

```text
Browser
  |
  v
oj-web (Nginx, public)
  |
  v
oj-api
  +-- oj-postgres (Product DB)
  +-- oj-redis
  +-- oj-minio
  +-- oj-judge-service [judge profile]
          +-- Judge DB (separate credentials/database)
          +-- Go Worker [judge profile]
          +-- Linux Supervisor/Sandbox [judge profile, separate security boundary]
```

Core: Web, API, PostgreSQL, Redis, MinIO, migration services. Optional profile: Judge Service, Worker, Supervisor. Development only: Vite/watch, exposed debug ports, MinIO console, fixtures.

## Judge Profile Recommendation

Use `docker compose up -d` for Web/API/DB/Redis/MinIO plus successful migrations. Provide `docker compose --profile judge up -d` only after Judge image and Linux security qualification complete.

Reason: basic product browsing/admin/storage can start without real execution; Judge must not become a fake or degraded default. Submission endpoint must expose an explicit Judge-unavailable failure state when profile is absent. On Docker Desktop/macOS, omit/disable real Judge profile until target-specific qualification passes.

## Open Source Deployment UX

Target after phases, not current behavior:

```text
git clone <repo>
cd OJPlatform
cp .env.example .env
docker compose up -d
docker compose run --rm migrate
```

Final design should make migration one-shot dependency so normal `up` can be documented safely after it is idempotent. Initial admin must be explicit (`create-admin` command or one-time setup token), require operator-provided strong credential, and never create a weak default account. Document URLs, profile usage, backup/restore, upgrade, rollback, and secret rotation.

## Blockers

1. Product migration runner has no ledger and known full-replay failure around `0020_judge_artifacts`.
2. Judge real execution is Linux/WSL/rootless-runc/systemd/cgroup/rootfs dependent; no Docker Desktop or arm64 qualification exists.
3. Web Vite plugin default hard-codes Windows external path.
4. API/Judge/Web default bindings and URLs use loopback; Compose-specific environment contracts do not yet exist.
5. Existing `.env.example` is local-only and no production Compose secret/bootstrap contract exists.
6. Evaluation fixture does not enforce a loopback database target.
7. No application Dockerfiles, `.dockerignore`, production reverse-proxy configuration, Compose profiles, image CI, backup/upgrade documentation, or public Docker quick start exists.

## Risk Matrix

| Risk | Level | Control before implementation |
| --- | --- | --- |
| Judge container weakens Sandbox isolation | Critical | Security ADR/review, Linux-only qualification, attack tests; never claim Docker Desktop support early |
| Migration races or replay damages fresh startup | High | Ledgered one-shot runner, fresh-volume and upgrade tests |
| Product/Judge DB credential crossing | Critical | Separate databases/roles/networks/secrets, negative checks |
| Secret baked into image or defaults deployed | Critical | `.dockerignore`, secret scan, no `COPY .env`, generated secret contract |
| Bind mount source/plugin failure on macOS/Windows | Medium | Dev profile qualification and documented named-volume strategy |
| arm64 image/runtime drift | High | Per-platform build/test matrix; Judge profile AMD64-only until qualified |
| Published infrastructure ports expose state services | High | Production Compose internal-only defaults |

## Implementation Phases

| Phase | Scope | Risk | Expected output / acceptance criteria |
| --- | --- | --- | --- |
| 1 | Infrastructure Compose modernization: PostgreSQL, Redis, MinIO | Medium | Separate dev/prod infra configs, secret-free examples, volume/health tests; current Runtime Manager unchanged |
| 2 | Migration architecture | High | Ledgered Product/Judge migration jobs, fresh-volume/upgrade/retry tests; `0020` replay issue resolved by approved migration strategy |
| 3 | API image | Medium | Multi-stage non-root image, container `/ready`, DNS configuration, no Product secret leakage |
| 4 | Web image | Medium | Vite build, Nginx SPA/proxy, plugin-path remediation, browser/API integration test |
| 5 | Windows/macOS qualification | Medium | Docker Desktop Intel/Apple Silicon dev and basic Compose evidence; document limitations |
| 6 | Judge Docker design and qualification | Critical | ADR/security review, Linux amd64 image/profile, Worker/Supervisor boundaries, adversarial sandbox evidence |
| 7 | One-command bootstrap | High | Explicit migration/admin/fixture UX, fresh clone smoke test, no unsafe defaults |
| 8 | Production Compose | High | Internal networks, secret injection, backups/restore/upgrade docs, restart/resource policies |
| 9 | GitHub Actions/GHCR | Medium | Multi-arch image build/scans/SBOM/provenance and Compose smoke tests |

## Recommended Phase 1

Start only Infrastructure Compose modernization. Preserve `deploy/docker/compose.yml` behavior until a compatibility plan exists. Phase 1 must not containerize API/Web/Judge, modify current Runtime Manager lifecycle, run migrations, seed data, or move existing volumes. Deliver development/production configuration contracts, health/volume/port tests, `.env` documentation that contains no real secrets, and rollback/ownership guidance.

## Final Status

```text
DOCKER READINESS = PARTIAL
WEB CONTAINERIZABLE = PARTIAL
API CONTAINERIZABLE = PARTIAL
POSTGRES CONTAINERIZABLE = YES
REDIS CONTAINERIZABLE = YES
MINIO CONTAINERIZABLE = YES
JUDGE CONTAINERIZABLE = PARTIAL
WINDOWS DOCKER TARGET = PARTIAL
MAC INTEL TARGET = PARTIAL
MAC APPLE SILICON TARGET = BLOCKED
LINUX AMD64 TARGET = PARTIAL
MULTI-CONTAINER COMPOSE RECOMMENDED = YES
ALL-IN-ONE CONTAINER RECOMMENDED = NO
SAFE TO START PHASE 1 = YES
CURRENT RUNTIME MODIFIED = NO
MAIN MERGE = NOT PERFORMED
```


