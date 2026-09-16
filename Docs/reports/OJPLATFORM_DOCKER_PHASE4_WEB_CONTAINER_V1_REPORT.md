# Docker Phase 4 Web Container V1 Report

## Live Baseline

Started from clean canonical `main` at `5868c72bf2b6db53e8420932cff8a363b7435aed` with
Phase 1, 2, and 3 integrated. Work is on
`codex/docker-phase4-web-container-v1`; main was not merged.

## Web Build Contract

- Node `22.20.0`; pnpm `11.19.0`; `pnpm --filter @ojplatform/web build`.
- Vite output: `apps/web/dist`.
- Browser API contract remains relative `/api` and `/ready`; no baked API host.
- Vite aliases build the separate OnlineCodeEditor source from
  `OJPLATFORM_ONLINE_CODE_EDITOR_ROOT`.

## OnlineCodeEditor Integration Audit

The plugin is imported by the Web application and requires plugin source,
`plugin.manifest.json`, and its CodeMirror dependencies at Vite build time.
It has no runtime source requirement after bundling. Existing plugin source was
read only; the plugin repository was not changed.

## Plugin Portable Build Contract

Compose receives a required `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT` additional
build context. Docker normalizes that input to `/plugins/OnlineCodeEditor`.
Plugin dependencies are installed in a Linux build stage from its package lock;
the final image receives only Vite static output. Dockerfile, Compose, and Nginx
contain no fixed host drive path.

`PLUGIN ACQUISITION CONTRACT = PARTIAL`: a compatible external checkout is still
required. Distribution redesign is deferred.

## Dockerfile and Nginx

`Dockerfile.web` is multi-stage: plugin dependency install, root pnpm/Vite build,
then `nginxinc/nginx-unprivileged:1.27-alpine` runtime. Runtime listens on 8080.
Nginx supports SPA fallback, static gzip, `/assets/*` immutable cache,
`index.html` no-cache, forwarded proxy headers, `/api/*` proxy with unbuffered
SSE-compatible responses, and `/ready` proxy.

## Compose Web Service

Web waits for API health, uses `read_only: true`, `/tmp` tmpfs, and
`no-new-privileges`. `web-ingress` is non-internal and attached only to Web;
the API and infrastructure remain on internal `infrastructure`. Dev Web binds
loopback only. Production publishes Web only.

## Qualification

Isolated Docker project: `ojplatform-phase4-qualification`; ports `57173` to
`57178`; independent containers, volumes, and networks.

- First Web image build: PASS.
- Second Web image rebuild: PASS.
- Final Web image: `25,275,375` bytes.
- Fresh Core startup: PostgreSQL, Redis, MinIO, migration, API, and Web healthy.
- Migration was applied fresh; restart migration exited `0` as no-op.
- `/`, `/ready`, `/api/auth/capabilities`, `/problems`, and deep links passed.
- API stop left static `/` at `200`; `/api/...` and `/ready` returned `502`.
  API restart restored both to `200`.
- `nginx -t`: PASS. Runtime `id`: uid 101 (`nginx`). Read-only write probe failed
  with read-only filesystem. Runtime has no plugin source, workspace, source maps,
  or host plugin mount.
- Header probes: `index.html` `no-cache`; hashed CSS one-year immutable;
  gzip response encoded.
- Browser/Chrome qualification: root plus Problems, Contests, Blog, Homework,
  and Submissions all returned `200`; all application API requests used Web origin.
  A disposable Guest-created problem loaded `OnlineCodeEditor` and CodeMirror at
  desktop 1440, tablet 768, and mobile 390 with no blank page or fatal console error.
- Phase 2 regression: `pnpm test:migrations` and isolated
  `pnpm qualify:migrations`: PASS.
- Phase 3 regression: API image, health/ready, migration no-op, and runtime role
  boundary remained qualified in the isolated stack.
- Typecheck and architecture gate: PASS. `pnpm test:web` remains FAIL due an
  unrelated baseline `SubmissionHistoryPage` fixture lacking `statistics.trend`.

## Port Policy

- Dev Web: `127.0.0.1:57173` during qualification; loopback-only by contract.
- Dev API: loopback-only by contract.
- Production Web: explicit ingress port, default `8080`.
- Production API, PostgreSQL, Redis, MinIO, and MinIO Console: no host ports.

## Security and Platform Notes

No real user DB or user Docker volume was used or modified. No secrets, `.env`,
plugin source, or source map appeared in the final runtime image. No Judge
runtime was containerized. Windows Docker/Chrome qualification was real.
macOS configuration portability is supported by normalized paths, but no Mac
runtime was tested. ARM64 native dependency install is container-local, but no
ARM64 build was tested.

## Remaining Phase 5 Work

Cross-platform runtime qualification, plugin acquisition/distribution, Vite HMR
container workflow, TLS termination, and all Judge runtime container work remain
out of scope.
