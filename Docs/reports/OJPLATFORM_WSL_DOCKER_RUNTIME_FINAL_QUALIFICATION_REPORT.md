# OJPlatform WSL Docker + Runtime Final Qualification

Date: 2026-09-04

## Result

`WSL DOCKER + RUNTIME QUALIFICATION = PASS`

No product code was changed. Qualification used the existing
`codex/runtime-port-reconciliation-v1` worktree at `fa82b981a0063961080a0e8ffc0d8682b9445369`.

## Docker Access

- WSL distro: `Ubuntu-24.04`
- User: `oj-sandbox` (`uid=1000`)
- Docker group: exists (`gid=989`); user is a member after repair
- Socket: `root:docker`, `srw-rw----`
- Root cause: `USER_GROUP_PERMISSION`; initial `docker ps` returned `permission denied while trying to connect to the docker API`
- Repair: `usermod -aG docker oj-sandbox` executed as WSL root, followed by `wsl --shutdown`
- `docker ps` without sudo: PASS
- `docker version` client/server: PASS
- `docker info`: PASS

## Feature Runtime

The Runtime Manager completed real starts against WSL-native Docker:

- PostgreSQL: READY, `55432`
- Judge DB: READY
- Redis: HEALTHY, `56379`; `redis-cli ping` returned `PONG`
- MinIO: READY, `59000`
- Product API, Judge Service, Supervisor, Host Agent, Web: RUNNING
- Worker: ONLINE, HEALTHY, `REAL_SANDBOXED_EXECUTION`
- Repeated start: PASS with `REUSE`
- Normal stop: PASS; infrastructure preserved
- Start after normal stop: PASS
- `stop -All`: PASS; containers stopped and named volumes preserved
- Start after `stop -All`: PASS after Docker network state reset
- Stale Redis/MinIO created containers were classified as stale OJPlatform resources, removed by targeted cleanup, and recreated; no volume removal
- No `HOST_CAPACITY_EXHAUSTED` during qualified feature runtime

The first post-`stop -All` restart hit a transient Docker bind error with no
listener present. After targeted removal of the failed containers and Docker
daemon restart, port ownership returned to `FREE` and startup passed. No
unrelated container was removed.

## Current Checkout Check

`D:\OJPlatform` has no local `main` branch; current checkout is
`codex/unified-judge-runtime-integration-v1` at `60e4fa2da30130b16fd64b54cd86e2c5330b516b`.
Its single requested start passed after stopping one precisely identified stale
Worker process (`D:\OJPlatform\\.runtime\\bin\\judge-worker.exe`, no active jobs),
which had caused `HOST_CAPACITY_EXHAUSTED`. Status then showed all services
RUNNING and Worker ONLINE/HEALTHY. A final normal stop left infrastructure
running and application services stopped.

## Safety and Repository State

- Data volumes preserved: YES (`ojplatform-postgres-data`, `ojplatform-redis-data`, `ojplatform-minio-data`)
- Unrelated Docker resources touched: NO
- Code modified: NO
- New commit: NONE
- Feature worktree tracked clean: YES
- Root checkout pre-existing untracked artifacts preserved: YES
- Services left running: infrastructure only; application services stopped by final requested `stop`

## Not Run

- Deliberate stale Redis test was not separately fabricated; the observed
  stale-container recovery during the real stop/start cycle served as the safe
  equivalent. No destructive data test was performed.
- No diagnostic code change was made because qualification did not require it.
