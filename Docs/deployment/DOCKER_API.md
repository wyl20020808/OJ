# API Docker Deployment

## Build

Build from repository root so pnpm workspace packages and migration manifests are
available to the multi-stage `Dockerfile.api`:

```sh
docker build -f Dockerfile.api -t ojplatform/api:local .
```

The build uses pinned Node `22.20.0-alpine`, pinned pnpm `11.19.0`, frozen lockfile
installation, TypeScript build, and an esbuild Node 22 API bundle. The same image
contains only production runtime dependencies, the API bundle, and formal Product/
Judge migration scripts.

## Development Start

Copy `.env.compose.example` to an ignored `.env`, set non-placeholder local values,
then use the Phase 1 Compose files:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d api
```

Development publishes API only on `127.0.0.1:${OJPLATFORM_API_PORT:-3010}`.

## Migration

`migrate-product` is a one-shot service. It runs only `node scripts/migrate.mjs up`,
waits for PostgreSQL health, writes the Phase 2 ledger, and never seeds data or starts
the API. `api` waits for its successful completion.

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate-product
```

`judge-bootstrap` and `migrate-judge` are optional `judge` profile contracts only.
They never start Judge Service, Worker, Host Agent, Supervisor, or Sandbox.

## API Start

The API container uses `HOST=0.0.0.0`, `PORT=3010`, internal DNS names `postgres`,
`redis`, and `minio`, a read-only filesystem, `/tmp` tmpfs, `no-new-privileges`, and
a non-root `ojplatform` user.

## Health

`GET /health` proves API process liveness.

## Ready

`GET /ready` performs PostgreSQL, Redis, and MinIO checks. API startup also ensures
the configured S3 bucket exists. A dependency outage may leave `/health` alive while
`/ready` returns HTTP 503.

## Environment

`migrate-product` receives `PRODUCT_MIGRATION_DATABASE_URL` through its
`DATABASE_URL` contract. `api` receives `PRODUCT_RUNTIME_DATABASE_URL` through its
own `DATABASE_URL`. Do not put either value in source control or image build args.

Production also requires explicit S3 credentials and bucket variables. The example
file contains placeholders only.

## Database Roles

Fresh Compose Product volumes create a non-superuser `PRODUCT_RUNTIME_DB_USER` role.
It has application table and sequence access; PostgreSQL initializer credentials are
not injected into API. Migration/admin and runtime URLs are separate deployment
contracts. Existing databases need operator-reviewed role provisioning before adopting
this contract.

## MinIO

API uses `S3_ENDPOINT=http://minio:9000`. Development defaults reuse local MinIO
bootstrap credentials; production should provide a scoped S3 identity.

## Redis

API uses `REDIS_URL=redis://redis:6379` over the internal Compose network.

## Development Ports

PostgreSQL, Redis, MinIO, and API ports are loopback-only in `compose.dev.yaml`.

## Production Network

`compose.prod.yaml` publishes neither infrastructure nor API ports. Future Web or
proxy services must reach API over the internal Compose network.

## Shutdown

Use `docker compose ... down` to preserve volumes, or `stop api` for API-only graceful
shutdown. Do not use `-v` outside an explicitly disposable qualification project.

## Data Persistence

PostgreSQL and MinIO use named volumes. Restarting `migrate-product` is ledger-based
and must not replay historical migrations.

## Troubleshooting

Inspect migration job logs before API logs. `migrate-product` failure intentionally
blocks API startup. `/ready` identifies unavailable dependencies without exposing
credentials.

## What Is Not Dockerized Yet

Web, Judge Service runtime, Worker, Host Agent, Supervisor, and Sandbox remain outside
Phase 3.
