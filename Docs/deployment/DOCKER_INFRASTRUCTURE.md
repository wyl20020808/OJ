# Docker Infrastructure

## Requirements

- Docker Desktop or Docker Engine
- Docker Compose v2

This Phase 1 path owns PostgreSQL, Redis, and MinIO only. It is separate from
the existing Windows Runtime Manager and `deploy/docker/compose.yml`.

## Development Start

Create a local ignored `.env.compose` from `.env.compose.example`, set local
development credentials, then run:

```text
docker compose --env-file .env.compose -f compose.yaml -f compose.dev.yaml up -d
```

The same YAML and `docker compose` commands work on Windows, macOS, and Linux.
The Compose files do not invoke WSL, PowerShell, or batch files.

## Development Stop

```text
docker compose --env-file .env.compose -f compose.yaml -f compose.dev.yaml down
```

`down` preserves named volumes and their data.

> Warning: `docker compose ... down -v` removes Docker volumes and permanently
> deletes local PostgreSQL and MinIO data. Do not use it for normal shutdown.

## Ports

Development publishes loopback-only ports, each overrideable in `.env.compose`:

| Service | Host variable | Default | Container port |
| --- | --- | ---: | ---: |
| PostgreSQL | `OJPLATFORM_POSTGRES_PORT` | 55432 | 5432 |
| Redis | `OJPLATFORM_REDIS_PORT` | 56379 | 6379 |
| MinIO API | `OJPLATFORM_MINIO_PORT` | 59000 | 9000 |
| MinIO Console | `OJPLATFORM_MINIO_CONSOLE_PORT` | 59001 | 9001 |

## Environment

`.env.compose.example` is a non-secret template. Never commit `.env.compose`
or production credentials. Production must inject distinct `POSTGRES_PASSWORD`,
`MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD` values through the deployment
environment or a secret manager.

## Volumes

- `postgres-data` persists PostgreSQL at `/var/lib/postgresql/data`.
- `minio-data` persists MinIO objects at `/data`.
- Redis remains transient in Phase 1. Queue recovery persistence, Redis
  authentication, and TLS require a later production design decision.

## Health Checks

- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- MinIO: documented `/minio/health/ready` endpoint

## Production Contract

Validate production rendering with deployment credentials supplied outside the
repository:

```text
docker compose --env-file /secure/path/production.env -f compose.yaml -f compose.prod.yaml config
```

`compose.prod.yaml` publishes no PostgreSQL, Redis, MinIO API, or MinIO Console
host ports. All three services are on the internal Compose network. Phase 1
does not Dockerize Web, API, Judge, Worker, migrations, or fixtures.
