# Web Docker Deployment

## Architecture

`web` is a non-root Nginx static container. Browser traffic reaches React SPA
and same-origin `/api/*` through this container. Nginx reaches `api` only on
the internal Compose network; PostgreSQL, Redis, MinIO, and API stay private in
production.

## Build

Image uses Node `22.20.0`, pnpm `11.19.0`, frozen root lockfile, and
unprivileged Nginx runtime. Dependencies install in Linux image layers; host
`node_modules`, `.env`, Git metadata, reports, and build output stay excluded.

The plugin is a pinned submodule at `plugins/OnlineCodeEditor`, which is the
default build input, so a normal build needs nothing set. To build against a
different checkout, set `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT`:

```text
docker compose -f compose.yaml -f compose.dev.yaml build web
```

For direct Docker builds, pass the same checkout as named `online-code-editor` context.

## OnlineCodeEditor Build Input

OnlineCodeEditor remains a separate repository. Compose receives its path from
`OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT`; Docker normalizes it to
`/plugins/OnlineCodeEditor`. Plugin package lock installs in the build
stage and Vite bundles source. Final Nginx image contains generated static
output only, not plugin source or its `node_modules`.

Plugin acquisition is handled by the submodule (`git clone --recurse-submodules`
or `git submodule update --init --recursive`); see `plugins/README.md`.
Package distribution, submodules, and release automation are deferred.

## Nginx

Nginx listens on container `8080` as non-root. It proxies `/api/*` to `api:3010`
and `/ready` to `api:3010/ready`, preserving forwarded headers. API buffering is
disabled for existing SSE. Static liveness remains separate from API readiness.

## SPA Routing

Non-file routes fall back to `index.html`. `/problems`, `/contests`, `/blog`,
`/homework`, `/profile/...`, and `/submissions/...` mount React after direct
load. `/api/*` and `/ready` remain explicit proxy locations, never SPA fallback.

## Development Start

Copy `.env.compose.example` to untracked `.env.compose`, set plugin checkout
path for current OS, then run:

```text
docker compose --env-file .env.compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Open `http://127.0.0.1:${OJPLATFORM_WEB_PORT:-5173}`. This phase uses a
production-like Web image; Vite HMR is deferred.

## Production Start

Use an operator-owned production environment file and prebuilt `OJPLATFORM_WEB_IMAGE`:

```text
docker compose --env-file /secure/production.env -f compose.yaml -f compose.prod.yaml up -d
```

TLS remains an outer reverse-proxy concern. Production Compose publishes only
Web ingress, default `8080`.

## Ports

Development publishes Web `127.0.0.1:5173` by default and preserves existing
loopback-only API and infrastructure ports. Production publishes Web `8080`;
API, PostgreSQL, Redis, MinIO, and MinIO Console have no host ports.

## Cache

`index.html` uses `Cache-Control: no-cache`. Hashed `/assets/*` use one-year
immutable cache. gzip covers text, CSS, JavaScript, JSON, and SVG.

## Health

Web health checks static `/`, not API readiness. `/ready` is API readiness
proxy. Runtime uses `read_only: true`, `/tmp` tmpfs, and `no-new-privileges`.

## Troubleshooting

If Compose reports missing build context, set
`OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT`. Inspect `docker compose logs web api`
before treating `/ready` failure as Web failure.

## Cross-Platform Paths

Only the host-provided context variable has an OS path. Dockerfile, Nginx, and
Compose use normalized container paths and no fixed host drive. Apple Silicon
runtime qualification remains separate.

## What Is Not Dockerized Yet

Judge Service runtime, Worker, Host Agent, Supervisor, Sandbox, TLS termination,
and Vite HMR workflow remain outside this phase.
