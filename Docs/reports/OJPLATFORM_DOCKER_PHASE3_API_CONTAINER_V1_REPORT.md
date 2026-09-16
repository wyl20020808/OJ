# Docker Phase 3 API Container V1 Report

## Live Baseline

Feature worktree started clean from `main` `5891377`, which includes Phase 2 ledger
integration. No canonical root, stash, existing worktree, real DB, or volume changed.

## API Build Contract

Node engine: `>=22.20.0 <25`; pnpm: `11.19.0`; TypeScript root build: `pnpm build`.
Audit found plain `dist` output retains workspace specifiers and is not a standalone
Node entry. Phase 3 therefore adds an esbuild Node 22 bundle for container runtime.

## Files Changed

`Dockerfile.api`, `.dockerignore`, Compose base/dev/prod, Product runtime-role init
script, API bundle command/dependency, Compose example, deployment guide, report, and
project status.

## Dockerfile Architecture

Root `Dockerfile.api` is required because API build, workspace dependencies, Product
migration manifests, and Judge migration scripts share repository root. Build stage
uses frozen pnpm install, TypeScript build, Node bundle, and production deploy. Runtime
stage copies only bundle, production dependencies, formal migration scripts/manifests,
and Product SQL migrations. API declares `pg` directly because those formal scripts run
from image root rather than inside the database workspace package. Its container bundle
also declares external storage/cache/database runtime modules directly, so production
deployment closure contains every unresolved Node package.

## Image Build

BLOCKED. WSL Docker daemon has no local `node:22.20.0-alpine` image and fails registry
metadata resolution because configured proxy `127.0.0.1:10809` refuses connections.
Global Docker proxy settings were not changed.

## Image Contents

Static design excludes `.git`, host node_modules, `.env`, build caches, Goals, reports,
logs, and screenshots from build context. No image filesystem inspection is possible
until base image access is repaired.

## Non-Root Runtime

Dockerfile creates and selects non-root `ojplatform`; Compose adds read-only filesystem,
`/tmp` tmpfs, and `no-new-privileges`. Runtime `id` remains BLOCKED with image build.

## Docker Ignore

PASS static audit. Required workspace, lockfile, TypeScript, API, package, and migration
sources remain in context.

## Environment Contract

API uses Compose DNS (`postgres`, `redis`, `minio`) and `HOST=0.0.0.0`. Product runtime
and migration database URLs are separate service injection contracts.

## Product Migration Service

IMPLEMENTED, not runtime-qualified: one-shot `migrate-product` runs formal Phase 2 CLI,
waits for healthy PostgreSQL, has no seed/API command, and gates API start.

## Judge Migration Contract

IMPLEMENTED, not runtime-qualified: optional `judge` profile has `judge-bootstrap` then
`migrate-judge`; it does not start any Judge runtime process or share Product URL vars.

## Compose Dependency Graph

PostgreSQL/Redis/MinIO healthy; Product migration success; API start. Judge profile is
not part of default core startup.

## Product Runtime Credential Boundary

Fresh Product volumes initialize a non-superuser runtime role. Isolated PostgreSQL
qualification verified its `rolsuper`, `rolcreatedb`, and `rolcreaterole` flags are all
false and `CREATE TABLE` fails with schema permission denied. API receives runtime URL,
not PostgreSQL initializer/migration URL. Existing DB role provisioning is deployment
work, so complete production isolation is not yet container-runtime-qualified.

## PostgreSQL Connectivity

BLOCKED by image build.

## Redis Connectivity

BLOCKED by image build.

## MinIO Connectivity

BLOCKED by image build.

## Bucket Bootstrap

API code retains `ensureBucket`; container proof blocked.

## API Health

BLOCKED by image build.

## API Readiness

BLOCKED by image build.

## Fresh Database Qualification

BLOCKED by image build; no shared or real DB was used.

## Second Startup / Migration No-op

BLOCKED by image build.

## Dependency Failure Qualification

BLOCKED by image build.

## Graceful Shutdown

BLOCKED by image build.

## Production Port Privacy

Static PASS: dev API publish is loopback only; production adds no API/infrastructure port.

## Windows Qualification

PARTIAL: WSL Docker Compose base/dev/prod configuration renders. Actual image/network
qualification is blocked by Docker daemon proxy.

## macOS Portability

Config portable: Dockerfile and Compose use no Windows path, PowerShell, or WSL command.
No Mac runtime was tested.

## amd64 / arm64 Notes

Image installs dependencies inside Linux image; host node_modules are ignored. amd64 WSL
is current target. arm64 runtime remains unverified.

## Legacy Runtime Compatibility

Legacy `scripts/dev-runtime.ps1` unchanged.

## Security / Secrets Audit

No `.env` is copied by Docker context and no secret build args exist. Image history and
filesystem confirmation are blocked; no real secret was printed or committed.

## Tests

Static Compose base/dev/prod config: PASS. API bundle: PASS (731.2 kB; no workspace
specifier remains). `pnpm deploy --legacy --filter @ojplatform/api --prod`: PASS.
`pnpm typecheck`, `pnpm build`, `pnpm test:architecture`, and `pnpm test:migrations`
(4/4) passed. Full disposable `pnpm qualify:migrations` passed all Product/Judge ledger,
0020, adoption, transaction/retry, checksum, concurrency, and wrapper cases.

## Image Size

BLOCKED by image build.

## Commits

- `9b15f2b feat: containerize product api runtime`
- Documentation/report commit follows this qualification record.

## Remaining Phase 4 Work

Repair Docker registry access, then perform actual image build/rebuild, fresh isolated
Compose qualification, HTTP/readiness/dependency/shutdown/security checks, and update
this report before any integration.

DOCKER PHASE 3 API CONTAINER = PARTIAL

API IMAGE BUILD = FAIL

API NON_ROOT = FAIL

API CONTAINER HEALTH = FAIL

API /READY = FAIL

POSTGRES CONNECTIVITY = FAIL

REDIS CONNECTIVITY = FAIL

MINIO CONNECTIVITY = FAIL

MINIO BUCKET BOOTSTRAP = FAIL

PRODUCT MIGRATE SERVICE = PARTIAL

JUDGE MIGRATE CONTRACT = PARTIAL

FRESH DB → MIGRATE → API = FAIL

SECOND START MIGRATION NO-OP = FAIL

MIGRATION FAILURE BLOCKS API = FAIL

PRODUCT RUNTIME CREDENTIAL ISOLATION = PARTIAL

REAL SECRETS BAKED INTO IMAGE = NO

API LOGS EXPOSE SECRETS = NO

DEV API PORT LOOPBACK ONLY = YES

PROD INFRA PORTS PRIVATE = YES

PROD API PORT PRIVATE = YES

GRACEFUL SHUTDOWN = FAIL

PHASE1 INFRA REGRESSION = PASS

PHASE2 MIGRATION REGRESSION = PASS

LEGACY RUNTIME PRESERVED = YES

REAL CURRENT USER DB MODIFIED = NO

REAL USER DATA DELETED = NO

WINDOWS REAL DOCKER VERIFIED = NO

MAC REAL RUNTIME VERIFIED = NO

MAC CONFIG PORTABLE = YES

WEB CONTAINERIZED = NO

JUDGE RUNTIME CONTAINERIZED = NO

TYPECHECK = PASS

API BUILD = PASS

FOCUSED TESTS = PASS

SAFE TO START PHASE 4 = NO

MAIN MERGE = NOT PERFORMED
