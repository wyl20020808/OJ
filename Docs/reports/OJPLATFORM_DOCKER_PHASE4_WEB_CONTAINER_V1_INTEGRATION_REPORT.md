# Docker Phase 4 Web Container V1 Integration Report

## Live Baseline

Live inspection at task start on 2026-09-17:

- `git branch --show-current` = `main`
- `git rev-parse HEAD` = `5868c72bf2b6db53e8420932cff8a363b7435aed`
- `git rev-parse refs/heads/main` = `5868c72bf2b6db53e8420932cff8a363b7435aed`
- `git status --short` = clean (no tracked or untracked changes)
- `git stash list` = 3 pre-existing stashes, preserved untouched
- `git worktree list` = 131 registered worktrees before this task, all preserved

No historical `main` hash was used as truth. Phase 1, 2, and 3 were already integrated.

## Feature Topology

`codex/docker-phase4-web-container-v1` live tip = `8d982bf4b8c6641b85114a553f72f18ac24ef10`.

```
* 8d982bf (codex/docker-phase4-web-container-v1) test/docs: qualify web docker deployment
* a748aaa feat: containerize web runtime with nginx
* 5868c72 (main) docs: record Docker Phase 3 integration
```

- `git merge-base main <feature>` = `5868c72` (live main tip).
- `git rev-list --count main..feature` = `2`.
- `git merge-base --is-ancestor a748aaa main` = false; `git merge-base --is-ancestor 8d982bf main` = false.
- Exactly two commits exist beyond main, and both are Phase 4. Both were classified as belonging to this task. No unrelated commit was mixed in, so no early STOP was required.
- Feature diff scope vs live main: 13 files (`Dockerfile.web`, `deploy/nginx/web.conf`, `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml`, `apps/web/vite.config.ts`, `apps/web/src/app/App.tsx`, `apps/web/src/services/api.ts`, `.env.example`, `.env.compose.example`, `Docs/deployment/DOCKER_WEB.md`, `Docs/PROJECT_STATUS.md`, Phase 4 report).

`ALREADY IN MAIN = NO`.

## Integration Method

Fresh candidate worktree `D:\OJPlatform-worktrees\docker-phase4-web-container-v1-integration-v1` on new branch `codex/docker-phase4-web-container-v1-integration-v1` was created from live `main` at `5868c72`. The old feature worktree was not reused.

Integration used a normal `--no-ff` merge:

```
git merge --no-ff --no-edit -m "merge: integrate Docker Phase 4 Web container V1" codex/docker-phase4-web-container-v1
```

Result: merge commit `b18bea8579de43bac327cd4102224bae0df9f279` with parents `5868c72` (live main) and `8d982bf` (feature tip).

No squash, no cherry-pick, no rebase, no history rewrite. Because live main was the merge base, the merge was a clean three-way merge that created a true merge commit while preserving complete feature history.

## Conflicts

None. `Merge made by the 'ort' strategy` reported 13 files changed with zero conflicts.

`git diff --stat 8d982bf HEAD` is empty, proving the integrated tree is byte-identical to the qualified feature tip.

`git status --short` in the candidate is clean.

## Semantic Resolutions

No conflict resolution was required, so no ours/theirs or whole-file resolution was used.

Protected Phase 1/2/3 content was verified not to regress:

- `Dockerfile.api`, `apps/api`, `apps/migrations`, `packages` — unchanged by the merge (`git diff --name-only 5868c72 HEAD` lists only the 13 Phase 4 files).
- `compose.yaml` change is purely additive: an API `healthcheck` (required by Web's `depends_on: service_healthy`) plus the new `web` service and non-internal `web-ingress` network. PostgreSQL, Redis, MinIO, `migrate-product`, and the `judge` profile services are untouched.
- `compose.dev.yaml` change is purely additive: Web loopback port only. API dev-ingress, API loopback port, and infrastructure loopback ports are untouched.
- `compose.prod.yaml` change is purely additive: Web ingress plus `restart` policy. No host port was added for API, PostgreSQL, Redis, MinIO, or MinIO Console.

## Environment Constraints

Docker does not run on the Windows host for this repository. Real qualification used the WSL2 Docker Engine (`Ubuntu-24.04`, Docker server `29.7.2`, Compose `v5.5.0`, buildx `v0.36.1`), matching the Phase 3 integration environment.

Two environment blockers were encountered and worked around without touching product files:

1. `# syntax=docker/dockerfile:1` in `Dockerfile.web` requires BuildKit to resolve the Dockerfile frontend from `auth.docker.io`. Direct access timed out (`dial tcp 128.242.240.91:443: i/o timeout`). The daemon is configured with `HTTPProxy=http://127.0.0.1:10808`, and probing showed direct access failing while proxied access succeeded (`proxy_authdocker=200` in 0.43s). The frontend image was pre-pulled through the daemon proxy, after which resolution succeeded.
2. Build-stage `pnpm install` / `npm ci` network access does not inherit the daemon proxy, and direct npm registry access is heavily degraded (many `ETIMEDOUT`; the first API build failed at `pnpm deploy --legacy` on `@esbuild/linux-x64` metadata fetch). A qualification-only Compose overlay (`proxy-overlay.yaml`, created in the WSL temp directory, never committed) set `build.network: host` plus `HTTP_PROXY`/`HTTPS_PROXY` build args, making the host proxy reachable from build containers. The same product `Dockerfile.web` and `Dockerfile.api` were built; only build-container networking differed.

No daemon configuration, host proxy configuration, or product file was modified.

## OnlineCodeEditor Build Contract

`PLUGIN BUILD PATH PORTABLE = YES`.

- `apps/web/vite.config.ts` default is now `../OnlineCodeEditor`, not a fixed `D:/OJPlatformPlugins/OnlineCodeEditor`.
- `Dockerfile.web` normalizes the plugin to container paths: `ENV OJPLATFORM_ONLINE_CODE_EDITOR_ROOT=/plugins/OnlineCodeEditor`, with `COPY --from=online-code-editor /src /plugins/OnlineCodeEditor/src`.
- Compose receives a required host-side `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT` additional build context; the host path never enters the image.
- A repository-wide search found no fixed host drive path in `Dockerfile.web`, `deploy/nginx/web.conf`, `compose*.yaml`, or `apps/web/vite.config.ts`.
- `scripts/dev-runtime.ps1` still contains its legacy `D:\OJPlatformPlugins\OnlineCodeEditor` host value. That is the preserved host-based development path and was deliberately not modified.
- `vitest.config.ts` still contains a pre-existing hardcoded `D:/OJPlatform-worktrees/submission-live-eval-plugin-v2` alias. It is untouched by Phase 4 (`git diff --name-only 5868c72 HEAD -- vitest.config.ts` is empty) and is not part of the Docker build path.

Build evidence: `pnpm --filter @ojplatform/web build` transformed 400 modules inside the image build, which includes the external OnlineCodeEditor source mounted at `/plugins/OnlineCodeEditor`. The plugin build path is portable.

## Dockerfile Integrity

`Dockerfile.web` after merge:

- `plugin-dependencies` stage: `node:22.20.0-alpine`, `npm ci --omit=dev` against the plugin's own lockfile.
- `build` stage: `node:22.20.0-alpine`, `corepack install -g pnpm@11.19.0`, `COPY . .`, `pnpm install --frozen-lockfile`, plugin source/manifest/node_modules copied to `/plugins/OnlineCodeEditor`, then `pnpm --filter @ojplatform/web build`.
- `runtime` stage: `nginxinc/nginx-unprivileged:1.27-alpine`, only `deploy/nginx/web.conf` and `/workspace/apps/web/dist` copied in. `EXPOSE 8080`.

Frozen lockfile is used. The whole repository is not copied into the runtime stage. Vite production build is used; no dev server, no HMR client.

## Nginx Validation

`nginx -t` executed inside the running qualification Web container:

```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

`NGINX CONFIG = PASS`.

The configuration keeps SPA fallback, `/api/` reverse proxy, `/ready` reverse proxy, `/assets/` immutable cache, `index.html` no-cache, gzip (`text/plain text/css application/javascript application/json image/svg+xml`), and forwarded headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`), plus `Upgrade`/`Connection` for existing SSE and disabled proxy buffering.

## SPA Fallback

Direct `GET` against the published Web origin (browser-refresh semantics, not client-side navigation):

| Path | Status | Content-Type | SPA shell |
| --- | --- | --- | --- |
| `/` | 200 | text/html | yes |
| `/problems` | 200 | text/html | yes |
| `/blog` | 200 | text/html | yes |
| `/contests` | 200 | text/html | yes |
| `/homework` | 200 | text/html | yes |
| `/submissions` | 200 | text/html | yes |

No Nginx 404 for any deep link. `SPA FALLBACK = PASS`.

Note: `/blog` returns the SPA shell correctly, but the React router has no `/blog` route (`apps/web/src/app/App.tsx` route table falls through to `not-found`), so the SPA renders its "页面不存在" component. This is a pre-existing product routing gap unrelated to Phase 4 Docker work: the merge changed only the `judgeData` call inside `App.tsx`, and the feature diff contains no routing change. It is recorded as a FOLLOW-UP, not a Phase 4 defect.

## API Reverse Proxy

Through the Web origin only:

| Path | Status | Content-Type |
| --- | --- | --- |
| `/api/home` | 200 | application/json |
| `/api/problems` | 200 | application/json |
| `/api/contests/home-summary` | 200 | application/json |

`{"recentProblems":[]}`, `{"items":[],...}`, `{"running":[],...}` returned from the real API. `API REVERSE PROXY = PASS`.

## Ready Reverse Proxy

`/ready` on the Web origin proxies real API readiness, not a static stub:

- Healthy: `200` with `{"status":"ok","dependencies":{"postgres":"ok","redis":"ok","storage":"ok"}}`.
- Redis stopped: `503` with `{"status":"not_ready","dependencies":{"postgres":"ok","redis":"unavailable","storage":"ok"}}`.
- Redis restarted: `200` again on the first poll.
- API stopped: `/ready` `504`, `/api/home` `502`, static `/` still `200`.

`READY REVERSE PROXY = PASS`.

## Static Assets

Referenced from the served `index.html`:

- `/assets/index-BVuGdKkb.js` — 200, `application/javascript`, 1,436,476 bytes.
- `/assets/index-ClWUb16-.css` — 200, `text/css`, 321,001 bytes.
- KaTeX fonts (`woff`, `woff2`, `ttf`), `blog-mountain-hero.png`, `problem-library-banner.png`, and homework SVG assets are present in the runtime image and served under `/assets/` or the document root.

No 404, no wrong base path. Bundle inspection of the served JavaScript:

```
127.0.0.1:3010 = 0
localhost:3010 = 0
file:///       = 0
D:\            = 0
C:\            = 0
vite/client    = 0
@vite/client   = 0
@react-refresh = 0
```

`STATIC ASSETS = PASS`.

## Web Runtime Security

From the running Web container:

- `id` → `uid=101(nginx) gid=101(nginx)`, `WEB NON_ROOT = PASS`.
- `HostConfig.ReadonlyRootfs=true`, `SecurityOpt=[no-new-privileges:true]`, `Tmpfs=/tmp`.
- Write probe: `touch: /qual-write-probe: Read-only file system`; `/tmp` works (`TMP_WRITABLE`).
- Processes run as `nginx` only (master + workers), no root process.
- Healthcheck state `healthy` with three consecutive `ExitCode 0` results.

`WEB READ_ONLY = PASS`. Hardening was preserved, not weakened, by integration.

## Production Port Privacy

`docker compose -f compose.yaml -f compose.prod.yaml config` rendered from the integrated tree:

| Service | Host ports |
| --- | --- |
| web | `0.0.0.0:57173->8080` (only core public ingress) |
| api | none |
| postgres | none |
| redis | none |
| minio | none |
| migrate-product | none |
| judge-bootstrap / migrate-judge | not rendered (profile `judge`) |

`PROD WEB INGRESS = PASS`, `PROD API PORT PRIVATE = YES`, `PROD INFRA PORTS PRIVATE = YES`, Judge not running.

## Development Port Policy

`docker compose -f compose.yaml -f compose.dev.yaml config` and the live container bindings agree:

| Service | Host binding |
| --- | --- |
| web | `127.0.0.1:57173` |
| api | `127.0.0.1:57174` |
| postgres | `127.0.0.1:57175` |
| redis | `127.0.0.1:57176` |
| minio | `127.0.0.1:57177` / `127.0.0.1:57178` |

`HostConfig.PortBindings` confirms `HostIp=127.0.0.1` for every service, including the API. No `0.0.0.0` binding in development.

`DEV WEB PORT LOOPBACK ONLY = YES`, `DEV API PORT LOOPBACK ONLY = YES`.

The base `compose.yaml` alone publishes no host ports at all.

## Fresh Core Qualification

Isolated project `ojplatform-phase4-integration-qualification`, isolated networks, isolated volumes, isolated ports `57173`–`57178`, synthetic credentials (`qualsyntheticpg`, `qualsyntheticminio`), and a qualification-only bucket `ojplatform-phase4-integration-qualification`. No real dev database, no Runtime Manager, no legacy volume, and no user MinIO bucket was used.

Fresh start order from empty volumes: PostgreSQL, Redis, MinIO → `migrate-product` → `api` → `web`. Result:

- `postgres`, `redis`, `minio`: healthy.
- `migrate-product`: applied all migrations from scratch, `migrate_exit=0`.
- `api`: healthy, `/health` 200, `/ready` 200.
- `web`: healthy, `/` 200, `/ready` 200, `/api/home` 200.

One earlier attempt failed because the synthetic `S3_ACCESS_KEY` did not match the MinIO root user; the API exited with `InvalidAccessKeyId`. The synthetic credentials were aligned and the project was fully reset (`down -v`, guard-checked) before the successful fresh start. This was a qualification-configuration mistake, not a product defect.

`FRESH CORE STACK = PASS`.

## Browser Root

Real Chrome (system `chrome.exe`) through Playwright at 1440×900 against `http://127.0.0.1:57173`:

- `/` status 200, `#root` rendered 6,766 characters of HTML, title `OJPlatform`, navbar present.
- Real product content rendered (`AlgoOJ 首页 题库 比赛 团队 作业 博客 评测`, hero, announcements, daily problem, recommended lists).

Not curl-only. `BROWSER ROOT = PASS`.

## Browser Deep Links

All six representative routes were loaded by direct browser navigation and React mounted in every case:

| Route | Status | `#root` HTML length | nav/header elements |
| --- | --- | --- | --- |
| `/` | 200 | 6,766 | 2 |
| `/problems` | 200 | 11,039 | 4 |
| `/blog` | 200 | 1,456 | 3 |
| `/contests` | 200 | 5,738 | 6 |
| `/homework` | 200 | 23,506 | 14 |
| `/submissions` | 200 | 12,634 | 4 |

No blank page. No fatal console error. `/blog` mounts the SPA's own not-found component as described above.

`BROWSER DEEP LINKS = PASS`.

## Browser API Through Web Origin

27 application API requests were observed. Every one originated from the Web origin, for example:

```
GET http://127.0.0.1:57173/api/notifications/unread-count
GET http://127.0.0.1:57173/api/home
GET http://127.0.0.1:57173/api/contests/home-summary
GET http://127.0.0.1:57173/api/discussion/posts?limit=3&type=ANNOUNCEMENT
GET http://127.0.0.1:57173/api/auth/me
GET http://127.0.0.1:57173/ready
GET http://127.0.0.1:57173/api/problems?offset=0&limit=15&sort=publicNumber&order=asc
GET http://127.0.0.1:57173/api/tags
```

`directApiLeaks = 0`. No browser request went directly to `127.0.0.1:3010`.

`BROWSER API THROUGH WEB ORIGIN = PASS`.

## Console / Network Audit

- Fatal console matches: `0` (no chunk load error, no CORS error, no module resolution error, no React fatal error, no Vite HMR or `@vite/client`, no `@react-refresh`).
- `pageErrors`: `0`.
- Failed requests: `0`.
- Total console errors: 12, all identical `Failed to load resource: the server responded with a status of 401 (Unauthorized)` caused by genuinely unauthenticated endpoints (`/api/auth/me`, `/api/notifications/unread-count`) for a guest session. These are expected authorization responses, not defects.

`BROWSER CONSOLE = PASS`.

## OnlineCodeEditor Runtime

Qualification used a disposable Guest account and a disposable qualification Problem created inside the disposable database (allowed by this task):

- `POST /api/auth/guest/continue` → 200, guest session established, `oj_csrf` cookie present.
- `POST /api/problems` → 201, `publicNumber=2`, `publicId=P0002`, `slug=qual-phase4-editor-1789622484205`, visibility `public`, status `published`.
- Navigated to `/problems/qual-phase4-editor-1789622484205` (the problem detail page mounts `ProblemSolveEditorSlot` when the statement tab is active).

Result inside the real Docker-served bundle:

- `.online-code-editor-host` count = 1, inner HTML length = 6,155.
- `.cm-editor` count = 1, `.cm-content` count = 1 — CodeMirror mounted.
- Route console errors: none. Page errors: none.
- No module resolution error, no chunk 404.

`ONLINE CODE EDITOR BUILD = PASS`, `ONLINE CODE EDITOR RUNTIME = PASS`.

Initial attempt navigated to `/problems/<slug>/submit`, which renders the legacy `SubmissionForm` (a plain textarea), not the editor slot; that was a qualification-script targeting error, corrected to the detail route.

## Second Startup

`docker compose down` (no `-v`):

- All containers removed, networks removed.
- Volumes `ojplatform-phase4-integration-qualification_postgres-data` and `..._minio-data` persisted.

Second start:

- All services healthy again.
- `migrate-product` reported `Migration product up to date`, `migrate_exit=0` — no-op.
- `/`, `/problems`, `/blog`, `/contests`, `/homework`, `/submissions` all 200.
- `/api/home`, `/api/problems`, `/ready` all 200.
- MinIO volume still mounted at `/var/lib/docker/volumes/ojplatform-phase4-integration-qualification_minio-data/_data` with the `ojplatform-phase4-integration-qualification` bucket directory intact — data persisted.

`SECOND START = PASS`.

## Web Health / Shutdown

- Live healthcheck state: `healthy`.
- `docker compose stop web` → clean exit, `after_stop_status=exited`, `exitcode=0`.
- `docker compose start web` → `poll_1 web_health=healthy`, `/` 200, `/problems` 200.

`WEB CONTAINER HEALTH = PASS`.

## Phase 3 Regression

- API image build: `api_build_rc=0`; API image rebuild: `api_rebuild_rc=0`.
- `/health` on the API origin: 200. `/ready`: 200, then 503 on Redis outage, then 200 on recovery.
- Runtime DB role isolation: `CREATE TABLE qual_ddl_probe(id int)` as `ojplatform_runtime` → `ERROR: permission denied for schema public`. Role session works (`current_user=ojplatform_runtime`, `current_database=ojplatform`). `rolsuper=f, rolcreatedb=f, rolcreaterole=f`.
- `migrate-product` second run: no-op, exit 0.
- API port privacy in production and API loopback-only in development were re-verified.
- API dev-ingress network still present in the dev overlay.

`PHASE3 API REGRESSION = PASS`.

## Phase 2 Regression

- `pnpm test:migrations` → `migrations_rc=0`.
- `pnpm qualify:migrations` (disposable, via the built-in WSL tunnel to the qualification Postgres) → rc 0 with:

```
status PASS, productFresh PASS, productSecondRun PASS, product0019ToLatest PASS,
rootCause0020 "42P07:judge_artifacts", existingDatabaseAdoption PASS,
adoptionFailClosed PASS, legacyRuntimeLedgerCompatibility PASS, judgeFresh PASS,
judgeSecondRun PASS, productJudgeIsolation PASS, judgeRuntimePrivilegeBoundary PASS,
runtimeManagerCompatibility PASS, failureRollback PASS, retrySafety PASS,
checksumMutation PASS, concurrentMigrators "PASS (WAIT)"
```

Migration ledger, checksum mutation detection, `0020` root-cause behavior, failure rollback, and concurrent-migrator advisory locking are all unchanged.

`PHASE2 MIGRATION REGRESSION = PASS`.

## Phase 1 Regression

Base, development, and production Compose configurations all render successfully (`config` rc 0 for each):

- PostgreSQL, Redis, and MinIO definitions unchanged and still on the internal `infrastructure` network.
- Base configuration publishes no host ports.
- Development keeps loopback-only infrastructure ports; production keeps infrastructure ports private.

`PHASE1 INFRA REGRESSION = PASS`.

## Focused Tests

Run in the integration candidate on Windows with pnpm 11.19.0 and Node 22.20.0:

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | PASS (`rc=0`) |
| `pnpm build` | PASS (`rc=0`) |
| `pnpm test:architecture` | PASS (`rc=0`) |
| `pnpm test:migrations` | PASS (`rc=0`) |
| `pnpm test:web` | 11 passed, 1 failed (pre-existing baseline) |
| `pnpm lint` | 8 pre-existing errors |
| `pnpm format:check` | 29 files (pre-existing; one fewer than main) |
| targeted Prettier on the 3 Phase 4 code files | PASS (`All matched files use Prettier code style!`) |
| targeted ESLint on the 3 Phase 4 code files | PASS (no output, rc 0) |
| `git diff --check` | clean |

`TYPECHECK = PASS`, `WEB BUILD = PASS`, `FOCUSED TESTS = PASS` (no new failure introduced by Phase 4).

## Known Baseline test:web Failure

The `pnpm test:web` failure is proven pre-existing:

```
FAIL tests/web.test.tsx > Web platform shell > renders submission history and safely displays source as text
 ❯ SummaryCards apps/web/src/features/submissions/SubmissionHistoryPage.tsx:211:30
```

Executed on the pre-merge live `main` (`D:\OJPlatform`, branch `main`, HEAD `5868c72bf2b6db53e8420932cff8a363b7435aed`, `main_testweb_rc=1`): the identical test fails at the identical `statistics?.trend.map` line with the same unhandled `TypeError: Cannot read properties of undefined (reading 'map')`.

On the candidate the result is identical: `12 tests | 1 failed`, `11 passed`. The fixture is missing `statistics.trend`. Phase 4 touches none of `tests/web.test.tsx`, `SubmissionHistoryPage.tsx`, or its fixture.

`lint` and `format:check` failures are also pre-existing and were measured on the same pre-merge main:

- `main_lint_rc=1` with the same 8 errors in the same files: `apps/api/src/modules/code-run/routes.ts` (2), `apps/judge-service/src/projection.ts` (1), `apps/web/src/plugins/online-code-editor.d.ts` (5). None is a Phase 4 file.
- `main_format_rc=1` with 30 files; the candidate reports 29. The only difference is `apps/web/vite.config.ts`, which Phase 4 **fixed** — `Compare-Object` shows no newly unformatted file.

Scope was not expanded to repair `SubmissionHistoryPage`, `code-run/routes.ts`, `projection.ts`, or `online-code-editor.d.ts`. These remain pre-existing baseline debt.

## Main After

`refs/heads/main` was advanced to the validated candidate by fast-forward from the canonical root. The candidate contained the `--no-ff` merge commit and this documentation commit, so the feature's complete history is preserved on `main`.

- `main` ref = integration candidate tip.
- Canonical root `D:\OJPlatform` checked out on `main` with `HEAD == refs/heads/main`.
- Tracked working tree clean; user untracked files, stashes, and worktrees untouched.

## Canonical Root State

`D:\OJPlatform` remained the canonical root throughout. Feature work and all testing happened in the isolated worktree; the canonical root was only fast-forwarded after every gate passed. No user modification was overwritten, no destructive Git command was used, and no force operation was performed.

## Remaining Stashes / Worktrees / User Files

- 3 pre-existing stashes preserved unchanged: `codex-preserve-user-infra-before-wave4f-merge`, `codex-preserve-user-project-status-before-discussion-hub-merge`, `codex-preserve-user-project-status-before-team-merge`.
- All 131 pre-existing worktrees preserved, including the Phase 4 feature worktree at `D:\OJPlatform-worktrees\docker-phase4-web-container-v1` and the new integration candidate at `D:\OJPlatform-worktrees\docker-phase4-web-container-v1-integration-v1`.
- Real development containers `ojplatform-local-postgres-1`, `ojplatform-local-redis-1`, `ojplatform-local-minio-1` are preserved in their original exited state. No `ojplatform-local` volume was touched.
- Qualification images `ojplatform/web:ojplatform-phase4-integration-qualification` and `ojplatform/api:ojplatform-phase4-integration-qualification` were left in place, consistent with how the Phase 2 and Phase 3 qualification images were previously retained. The task scoped cleanup to containers, networks, and volumes.
- `scripts/dev-runtime.ps1` was not modified and the real Runtime Manager was not started.

## Qualification Cleanup

Only project `ojplatform-phase4-integration-qualification` was removed (`down -v --remove-orphans`, guarded by an explicit project-name assertion):

- containers: all removed
- networks: `_infrastructure`, `_dev-ingress`, `_web-ingress` all removed
- volumes: `_postgres-data`, `_minio-data` both removed

Verification after cleanup: no containers, no volumes, no networks matching the project name. The disposable qualification Problem was stored only in the removed `postgres-data` volume. No legacy volume, real development data, or other qualification project was deleted.

## Remaining Phase 5 Work

Out of scope and not started: cross-platform (macOS/ARM64) runtime qualification, OnlineCodeEditor plugin acquisition and distribution, Vite HMR container workflow, TLS termination, Judge runtime containerization, CI/CD, and GHCR image publishing.

`PHASE 5 STARTED = NO`.
