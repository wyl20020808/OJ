# Docker Phase 3 API Container V1 Report

## Status

`PASS` — Windows-hosted Ubuntu 24.04 WSL2 Docker Engine runtime qualification
completed on `codex/docker-phase3-api-container-v1` at `da5b4ed`, plus the
dev-only ingress correction made during qualification.

## Docker Registry / Proxy Recovery

Initial qualification was blocked before API image execution: Docker daemon's
systemd drop-in still referenced `http://127.0.0.1:10809`, while xray had moved
to `127.0.0.1:10808`. Direct Docker Hub HTTPS timed out. Windows xray listener,
WSL loopback reachability, HTTP CONNECT, Docker Hub registry `401`, and auth
endpoint `404` were verified before changing daemon configuration.

User backed up `/etc/systemd/system/docker.service.d/proxy.conf`, changed only
Docker daemon proxy port to `10808`, reloaded systemd, restarted Docker. No
global proxy, xray configuration, user container, volume, database, or Runtime
Manager setting changed. Docker Engine `29.7.2` then pulled
`node:22.20.0-alpine` successfully.

BuildKit bridge build containers cannot use WSL host-loopback proxy themselves.
Qualification used temporary standard Docker proxy build arguments with
`--network host`; they were not written to repository files or runtime image.

## Implementation Adjustment

Real Docker evidence found API attached only to Compose `internal: true`
network received requested port binding but no active published endpoint in this
Engine. `compose.dev.yaml` now attaches only `api` to `dev-ingress`. Product
infrastructure network stays internal; production Compose neither includes
`dev-ingress` nor publishes API or infrastructure ports. Rendered dev config
and actual API mapping both bind only `127.0.0.1`.

## Image Qualification

- Base image pull/inspect: PASS.
- API build and rebuild: PASS.
- Image: `sha256:99c9a87b9a4e51953bd676102babda9ccb89cc5611b9f112f6d1cdfeb4a28513`.
- Size: `62,647,369` bytes (about 59.7 MiB).
- Runtime identity: `uid=100(ojplatform) gid=101(ojplatform)`.
- Runtime: `read_only=true`, `/tmp` tmpfs, `no-new-privileges:true`.
- `/app` write denied; `/tmp` temporary write passed.
- Export/history audit found no `.env`, `.git`, Goals, reports, host workspace
  `node_modules`, private-key files, or secret-bearing history.
- API log audit found no database URL, password, access key, or secret key.

## Isolated Runtime Qualification

Project `ojplatform-phase3-qualification` used separate Compose network,
PostgreSQL volume, MinIO volume, non-default loopback ports, synthetic
credentials. It never used Runtime Manager resources, legacy volumes, real DB,
or real bucket.

Fresh `postgres`, `redis`, `minio` healthchecks passed. `migrate-product`
applied 39 Product migrations. Ledger had 39 rows with 39 distinct checksums;
`0020_judge_artifacts` had exactly one row. Second migration returned
`Migration product up to date`.

Wrong synthetic migration credential made `migrate-product` exit `1`; Compose
did not start `api` because of `service_completed_successfully`. Correct
credential then migrated and started API.

API used `postgres:5432`, `redis:6379`, `minio:9000`; `/health`, `/ready`,
`/api/home`, `/api/problems`, `/api/contests/home-summary` returned HTTP 200.
Readiness reported all dependencies `ok`; qualification bucket existed. API
PostgreSQL `current_user` was `ojplatform_runtime`; `CREATE TABLE` was denied
with `42501`. Redis and MinIO stops kept `/health` 200, changed `/ready` to
503, and recovered to 200 after restart. API SIGTERM shutdown exited 0 without
OOM kill in three seconds.

After `docker compose down` without `-v`, new containers reused isolated
volumes: migration was no-op, ledger remained 39, bucket persisted, `/health`
and `/ready` returned 200.

## Judge Boundary / Regression

`judge-bootstrap` and `migrate-judge` remain optional `judge` profile services;
their rendered environment has only `JUDGE_*` variables. Default stack started
no Judge Service, Worker, Host Agent, Supervisor, or Sandbox. Full disposable
migration qualification passed Product/Judge isolation plus Judge fresh/second
run cases.

- Compose base/dev/prod render: PASS.
- `pnpm test:migrations`: PASS, 4/4.
- `pnpm qualify:migrations`: PASS.
- `pnpm test:api`: PASS, 4/4.
- `pnpm typecheck`, `pnpm build`, `pnpm test:architecture`: PASS.

## Final Qualification Matrix

```text
DOCKER PHASE 3 API CONTAINER = PASS
DOCKER REGISTRY ACCESS = PASS
DOCKER PROXY ROOT CAUSE = IDENTIFIED
DOCKER PROXY = 127.0.0.1:10808
API IMAGE BUILD = PASS
API IMAGE REBUILD = PASS
API NON_ROOT = PASS
API CONTAINER HEALTH = PASS
API /READY = PASS
POSTGRES CONNECTIVITY = PASS
REDIS CONNECTIVITY = PASS
MINIO CONNECTIVITY = PASS
MINIO BUCKET BOOTSTRAP = PASS
PRODUCT MIGRATE SERVICE = PASS
JUDGE MIGRATE CONTRACT = PASS
FRESH DB → MIGRATE → API = PASS
SECOND START MIGRATION NO-OP = PASS
MIGRATION FAILURE BLOCKS API = PASS
PRODUCT RUNTIME CREDENTIAL ISOLATION = PASS
REAL SECRETS BAKED INTO IMAGE = NO
API LOGS EXPOSE SECRETS = NO
IMAGE SIZE = 62,647,369 bytes
DEV API PORT LOOPBACK ONLY = YES
PROD INFRA PORTS PRIVATE = YES
PROD API PORT PRIVATE = YES
DEPENDENCY FAILURE READINESS = PASS
GRACEFUL SHUTDOWN = PASS
READ_ONLY FILESYSTEM = PASS
PHASE1 INFRA REGRESSION = PASS
PHASE2 MIGRATION REGRESSION = PASS
LEGACY RUNTIME PRESERVED = YES
REAL CURRENT USER DB MODIFIED = NO
REAL USER DATA DELETED = NO
WINDOWS REAL DOCKER VERIFIED = YES
MAC REAL RUNTIME VERIFIED = NO
MAC CONFIG PORTABLE = YES
WEB CONTAINERIZED = NO
JUDGE RUNTIME CONTAINERIZED = NO
TYPECHECK = PASS
API BUILD = PASS
FOCUSED TESTS = PASS
SAFE TO START PHASE 4 = YES
MAIN MERGE = NOT PERFORMED
```

## Cleanup

Only `ojplatform-phase3-qualification` containers, networks, volumes removed
after report update. API qualification image remains local; legacy Docker
resources remain untouched.
