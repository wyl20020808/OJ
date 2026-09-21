# OJPlatform Local Runtime

## Shared runtime control

All checkouts control one machine-local runtime named `ojplatform-local`.
Registry, lock, generated secrets, and logs live at
`%LOCALAPPDATA%\OJPlatform\runtime\ojplatform-local`, never in Git.
The registry records checkout owner, process PID, process start time, command
identity, and port. It is written through a temporary file replacement.

`status` treats registry data only as an ownership hint. Web, API, Judge, and
Host Agent also require their live HTTP health and listener identity;
Supervisor requires its live health and WSL user systemd unit; Worker requires
Judge Service registry/heartbeat; infrastructure requires canonical Docker
Compose container, health, published port, network, and a live
published-path readiness probe (PostgreSQL `connect + SELECT 1` on `55432`,
Redis `PING -> +PONG` on `56379`, MinIO `/minio/health/ready` HTTP 200 on
`59000`). Healthy resources owned by another checkout are shown as
`RUNNING_OJPLATFORM_OTHER_CHECKOUT`. An unproven listener is
`BLOCKED_BY_EXTERNAL_OWNER` and is never stopped.

`stop` and `stop -All` use shared ownership, so either checkout can stop the
single runtime. `stop -All` stops named containers only and preserves volumes.

## Infrastructure recovery contract

`scripts/dev-runtime.ps1 start` uses WSL-native Docker in `Ubuntu-24.04`.
The Compose project is always `ojplatform-local`, independent of checkout path.
Infrastructure services are reconciled individually: existing containers whose
container-level evidence **and** published-path protocol probe are both valid
are reused. Missing, stopped, unhealthy, or stale services are started; stale
port/network/Compose metadata is recreated only for that service with
`--force-recreate`.

A running container, a container-level healthcheck, and an accepted TCP
connection are never readiness on their own. The container healthcheck runs
inside the container and cannot see the Windows -> WSL -> port forwarder ->
container path that application processes use, and the port forwarder accepts a
connection before it can reach the container. Startup therefore waits for the
real PostgreSQL/Redis/MinIO protocol answer on the published host port and
prints `STARTING`, per-service `READY (<n>s)`, or `FAILED`, bounded by
`InfraReadyTimeoutSec` (default 120s) with `InfraReadyPollSec` polling (default
2s). Both are configurable from `config/dev-runtime.local.ps1`. Failures emit
the service, container state, health, restart count, publish mapping, host TCP
reachability, probe result, container IP, WSL host-namespace route, Compose
network subnet, recent container log, and the commands to reproduce.

A healthy container whose published path stays dead for `InfraPathStallSec`
(default 20s) is repaired at network level at most once per start: the Compose
network is recreated with `down --remove-orphans` and `up -d` **without `-v`**,
and the presence of `ojplatform-postgres-data` is asserted before and after.
This re-registers the bridge, the port forwarders and the routes, which repairs
the proven fault class where the Compose bridge subnet overlaps the WSL2 host
NAT subnet and the container IP is therefore routed out of `eth0` instead of the
bridge. Connection, transport and PostgreSQL startup failures are transient and
keep waiting or trigger that repair; credential, authentication, missing
database/role, permission and SQL/schema failures fail immediately as
`INFRASTRUCTURE_READINESS_BLOCKED` and are never retried or hidden.

Start performs WSL, Docker daemon, and Compose preflight before waiting for
ports. Failures retain container state and emit a specific code such as
`DOCKER_DAEMON_UNAVAILABLE`, `PORT_MAPPING_MISSING`, `CONTAINER_UNHEALTHY`,
`HOST_PORT_UNREACHABLE`, `PUBLISHED_PATH_UNREACHABLE`,
`INFRASTRUCTURE_READINESS_TIMEOUT`, `INFRASTRUCTURE_READINESS_BLOCKED`,
`NETWORK_CONFIGURATION_STALE`, or `COMPOSE_FAILURE`.
No infrastructure cleanup runs when an application service later fails. Named
PostgreSQL, Redis, and MinIO volumes are never removed by the Runtime Manager.

Before recreating an infrastructure service, Runtime Manager reconciles its
expected host port (`55432`, `56379`, or `59000`). It records Docker container
identity and project/service labels, checks WSL and Windows listeners, removes
only stale/duplicate `ojplatform-local` containers, and waits for release
before Compose retry. Other Docker resources fail with
`PORT_OWNED_BY_OTHER_DOCKER_RESOURCE`; external processes fail with
`PORT_OWNED_BY_EXTERNAL_PROCESS`; missing owner evidence fails closed with
`PORT_OWNER_UNKNOWN`. Bind retries are limited and report
`PORT_BIND_FAILED` with service and port. Docker proxy cleanup is targeted to
the identified listener only.

After readiness passes, `scripts/judge-service-bootstrap.mjs` prepares the Judge
role and database. It is idempotent and retries only explicit transient
connection failures with bounded exponential backoff (1s, 2s, 4s, 8s; five
attempts). Authentication, credential, missing database/role, permission and
SQL/schema failures fail immediately and are never retried. Before reporting
success it connects to the Judge database as the Judge role with the configured
password (`SELECT 1`), so a credential the Judge runtime cannot use is a loud
failure instead of a silent state change. The Runtime Manager reports a failure
as `JUDGE_DATABASE_BOOTSTRAP_FAILED` and no longer uses a 30s process budget for
this step.

Normal `stop` stops application services and preserves infrastructure.
`stop -All` additionally stops PostgreSQL, Redis, and MinIO without removing
volumes. Worker reservation/capacity failures remain separate from
infrastructure port conflicts (`HOST_WORKER_CAPACITY_CONFLICT` versus
`INFRA_PORT_CONFLICT`).

启动：
双击 `OJPlatform-Start.bat`

重启：
双击 `OJPlatform-Restart.bat`

停止：
双击 `OJPlatform-Stop.bat`

状态：
双击 `OJPlatform-Status.bat`

日志：
双击 `OJPlatform-Logs.bat`

诊断：
双击 `OJPlatform-Doctor.bat`

正式本地地址是 `http://127.0.0.1:5173`。Product API 使用 `3010`，Judge Service 使用 `3100`，Host Agent 使用 `3180`，Supervisor 使用 `19092`。Judge Admin 通过 Product API 的管理边界提供，不直接暴露 Host Agent 凭据。

Supervisor 由 WSL `Ubuntu-24.04` 中的 non-root `oj-sandbox` 运行，并由命名的 `systemd-run --user` unit `ojplatform-local-supervisor.service` 承载（`Delegate=yes`）。Runtime Manager 会在启动前清理仅属于 OJPlatform qualification 的 stale failed scopes，并显式传递 `XDG_RUNTIME_DIR`/D-Bus user bus；不会清理无关 systemd units。Product API 与 Judge Service 在迁移完成后可并行启动，Host Agent 仍等待 Judge Service `ready`，最终 Web 等待 Worker ONLINE、API 和 Web readiness。

高级命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 start -Verify
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 stop
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 stop -All
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 restart
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 restart -All
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 logs
powershell -ExecutionPolicy Bypass -File scripts/dev-runtime.ps1 doctor
```

首次使用前，请确保系统安装与项目声明一致的 `pnpm@11.19.0`。Runtime Manager 会在启动时自动加入 Windows 用户 npm bin 目录（`%APPDATA%\npm`），因此双击 BAT 不依赖 Codex 会话的临时 PATH。如本机 Supervisor、trusted probe、C++20 compiler rootfs 或 Worker 二进制不在默认路径，复制 `config/dev-runtime.local.ps1.example` 为 `config/dev-runtime.local.ps1` 并填写本机路径和已验证的 rootfs identity。该文件和 `.runtime/` 被 Git 忽略；本地 token 由 Runtime Manager 生成并保存于 `.runtime/secrets.json`。默认 `MANUAL` pool 模式下，Start 通过 Judge Service -> Host Agent -> trusted template 确保至少一个 `REAL_SANDBOXED_EXECUTION` Worker ONLINE；不会直接启动 Worker。`AUTOMATIC` 模式应由正式 pool policy 决定节点数量。

Runtime Manager 只管理当前 `D:\OJPlatform` checkout 写入的 `.runtime` 状态和由它记录的进程。它不会使用全局 `taskkill node.exe`、`kill all go` 或 Docker prune。普通 Stop/Restart 保留 PostgreSQL、Redis、MinIO；只有 `-All` 才停止基础设施。启动过程会记录 `.runtime/state.json` 中的阶段耗时和 `.runtime/logs/` 中的统一日志。

新 Codex 会话处理“启动网站”时，应优先使用本 Runtime Manager；除非 Manager 本身故障，不应重新手工编排整套服务。
