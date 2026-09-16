# Docker Phase 3 API Container V1 Integration Report

## Live Main Before

`5891377` (`docs: record Docker Phase 2 integration`), clean canonical root.

## Feature Branch Tip

`0867f8d` on `codex/docker-phase3-api-container-v1`. It contains exactly
`9b15f2b`, `da5b4ed`, and `0867f8d` after main; all are Phase 3 scoped.

## Integrated Commits / Method / Conflicts

Fresh worktree branch `codex/docker-phase3-api-container-v1-integration-v1`
merged feature with normal `--no-ff` as `c5e0cf6`. No conflicts or semantic
overrides. Docker daemon proxy remains user-managed and absent from repository.

## Dockerfile / Migration / Judge Integrity

Candidate image builds Node 22 API bundle with frozen lockfile and production
deployment closure. Runtime is non-root, read-only, tmpfs-backed, and
no-new-privileges. Product migration remains one-shot and gates API through
`service_completed_successfully`. Judge bootstrap/migration remains optional
profile-only; default stack started no Judge runtime and no Product URL enters
Judge environment.

## Real Integration Qualification

Disposable project `ojplatform-phase3-integration-qualification` used separate
volumes, network, ports, and synthetic credentials. It was removed with
`down -v` after evidence capture.

- Candidate image build: PASS, `sha256:bfac84309508e9501b88ecd4819e06af4cde24829f31a6d7bbc85008f926a62f`, 62,646,450 bytes.
- Migration failure gate: wrong synthetic credential exited 1; API did not start.
- Fresh DB migration/API: PASS; `/health` and `/ready` HTTP 200.
- Connectivity: API used `postgres:5432`, `redis:6379`, `minio:9000`; bucket exists.
- Runtime role: `ojplatform_runtime`; DDL denied with PostgreSQL `42501`.
- Second startup: `down` without `-v`, migration no-op, health/ready 200.
- Redis failure: health 200, ready 503; recovery restored ready 200.
- Shutdown: API exit 0, no OOM kill.
- Dev ingress: actual `127.0.0.1:14010` API mapping; production renders no ports or `dev-ingress`.

## Regressions

Compose base/dev/prod render, `pnpm test:migrations` (4/4),
`pnpm qualify:migrations`, `pnpm test:api` (4/4), typecheck, build, and
architecture checks passed. `scripts/dev-runtime.ps1` remains unmodified.

## Main After

Validated candidate `c5e0cf6` is ready to advance unchanged to `main`.

```text
DOCKER PHASE 3 MERGE = PASS
API IMAGE BUILD = PASS
API NON_ROOT = PASS
API CONTAINER HEALTH = PASS
API /READY = PASS
POSTGRES CONNECTIVITY = PASS
REDIS CONNECTIVITY = PASS
MINIO CONNECTIVITY = PASS
PRODUCT MIGRATE SERVICE = PASS
JUDGE MIGRATE CONTRACT = PASS
FRESH DB → MIGRATE → API = PASS
SECOND START MIGRATION NO-OP = PASS
MIGRATION FAILURE BLOCKS API = PASS
PRODUCT RUNTIME CREDENTIAL ISOLATION = PASS
DEV API PORT LOOPBACK ONLY = YES
PROD INFRA PORTS PRIVATE = YES
PROD API PORT PRIVATE = YES
DEPENDENCY FAILURE READINESS = PASS
GRACEFUL SHUTDOWN = PASS
REAL SECRETS BAKED INTO IMAGE = NO
PHASE1 INFRA REGRESSION = PASS
PHASE2 MIGRATION REGRESSION = PASS
LEGACY RUNTIME PRESERVED = YES
REAL CURRENT USER DB MODIFIED = NO
REAL USER DATA DELETED = NO
WINDOWS REAL DOCKER VERIFIED = YES
TYPECHECK = PASS
API BUILD = PASS
FOCUSED TESTS = PASS
SAFE TO START PHASE 4 = YES
PHASE 4 STARTED = NO
```
