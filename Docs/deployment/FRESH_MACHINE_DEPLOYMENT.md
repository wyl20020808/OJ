# Fresh Machine Deployment

Single entry point for deploying OJPlatform on a new Linux amd64 machine.
Everything here is standard Docker Compose plus one host provisioning script.

```text
Containers (Docker Compose): Web, Nginx, API, PostgreSQL, Redis, MinIO,
                             Judge Service, Product/Judge migrations
Host-native (systemd):       Supervisor, Worker, Host Agent, rootless runc
```

Docker Compose is never hidden behind a wrapper. The host script exists only for
what Compose cannot own on a Linux host.

## Prerequisites

| Requirement | Detail |
| --- | --- |
| Host | Native Linux `x86_64`. WSL2 and containers-of-containers are not qualified hosts. |
| Kernel | >= 6.8 with user/PID/mount/network/IPC/UTS namespaces and seccomp |
| Init | systemd >= 255, cgroup v2 unified hierarchy |
| Sandbox | `runc` >= 1.4.3, OCI >= 1.3, libseccomp >= 2.5.5 |
| Docker | Docker Engine + Compose v2 plugin (`docker compose`) |
| Build tools | Go, Node.js 22, pnpm 11.19.0 (host binaries and rootfs build) |
| Storage | Local ext4/xfs with Unix ownership semantics and monitored free space |

Check the host before installing:

```sh
sudo ./deploy/judge-host/install.sh --check
```

## Deploy

Two commands after the repository is on the machine.

```sh
# 1. Compose control plane (Web, API, PostgreSQL, Redis, MinIO, Judge Service)
cp .env.production.example .env   # first time only
$EDITOR .env                      # replace every <...> placeholder

docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build

# 2. Native execution cell (Supervisor, Worker, Host Agent, compiler rootfs)
sudo ./deploy/judge-host/install.sh
```

Order matters: the control plane must be reachable before the Worker registers.
The Worker fails closed and retries, so the reverse order is recoverable but
noisier.

For a Core-only deployment without judging, omit `--profile judge` and skip
step 2:

```sh
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

For a Judge control plane with no local execution host, run step 1 only and
register a Worker from another machine.

## Verify

```sh
docker compose -f compose.yaml -f compose.prod.yaml --profile judge ps

systemctl status ojplatform-worker.service ojplatform-host-agent.service
sudo -u oj-sandbox env XDG_RUNTIME_DIR=/run/user/$(id -u oj-sandbox) \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u oj-sandbox)/bus \
  systemctl --user status ojplatform-supervisor.service

# Judge Service reports EXECUTION_READY only after a qualified Worker registers.
curl -fsS -H "x-judge-service-token: $JUDGE_SERVICE_TOKEN" \
  http://127.0.0.1:3100/v1/execution-readiness
```

Expected: `ONLINE` -> `EXECUTION_READY`, `availableSlots` > 0.

## Operations

Use standard tooling. There is no project-specific status CLI.

```sh
docker compose -f compose.yaml -f compose.prod.yaml --profile judge logs -f api web judge-service
journalctl -u ojplatform-worker.service -f
journalctl -u ojplatform-host-agent.service -f
```

## OnlineCodeEditor

The Web image bundles the editor, but the plugin is a separate repository that
is **not** published to any remote this project controls, so it cannot be
fetched by `git clone --recurse-submodules`. Provide a compatible checkout at
the repository-local default path:

```sh
git clone <your OnlineCodeEditor remote> plugins/OnlineCodeEditor
ls plugins/OnlineCodeEditor/plugin.manifest.json   # sanity check
```

`plugins/` is Git-ignored on purpose: the plugin keeps its own repository and
history. Override the location if the checkout lives elsewhere:

```sh
OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT=/srv/OnlineCodeEditor
```

Only the `web` image consumes this path. Core-only and Judge-only Compose
operations work without it.

## Upgrade

```sh
git pull
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
sudo ./deploy/judge-host/install.sh
```

Both commands are idempotent. Re-running Compose does not reset Redis ACLs, user
data, or migrations. Re-running the installer reconciles ownership, binaries and
units without touching existing secrets or environment files.

Rebuild the compiler rootfs explicitly when changing the pinned toolchain:

```sh
sudo ./deploy/judge-host/install.sh --rebuild-rootfs
```

## Reboot behaviour

The Compose stack is `restart: unless-stopped`; the native units are
`Restart=always` and enabled. No manual step is required after a reboot. If the
execution cell starts before the control plane, the Worker stays `DEGRADED` and
recovers on its own.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `install.sh` refuses with "must run as root" | Run it with `sudo`. |
| "Go toolchain is required" / "Node.js is required" | Install the build prerequisites; they are the only things `install.sh` does not install itself. |
| "cgroup v2 controller ... unavailable" | Boot the kernel with cgroup v2 and no `cgroup_no_v1=cpu` style overrides. |
| "seccomp is unavailable in this kernel" | The kernel must be built with `CONFIG_SECCOMP`; the installer reads the `Seccomp:` field of `/proc/self/status`. |
| AppArmor user-namespace error | Re-run the installer; it loads a narrow `userns` grant for `runc` only when the host restricts unprivileged user namespaces. |
| Supervisor unit: "Failed to load environment files: No such file or directory" | `/etc/ojplatform` must be traversable by `oj-sandbox`; the installer sets `root:oj-sandbox 0750` and verifies readability as that identity. |
| Supervisor unit fails with `203/EXEC` | Installed binaries must be `root:root 0755` so `oj-sandbox` can execute them; `umask 0027` would otherwise leave them `0750`. |
| Host Agent restarts with `ERR_MODULE_NOT_FOUND: fastify` | Its dependency tree must be readable by `oj-host-agent`; the installer applies `chmod -R a+rX` under `/opt/ojplatform/host-agent`. |
| Worker stays `DEGRADED` with `redis:false` | `QUEUE_PREFIX` must equal the Redis ACL prefix; the installer derives it from `JUDGE_REDIS_PREFIX` because the ACL only grants `~<prefix>:workers:*`. |
| Worker never leaves `DEGRADED` | `journalctl -u ojplatform-worker.service`; verify Judge Service readiness and the Worker Redis loopback port. |
| `EXECUTION_READY` never appears | Supervisor health, Worker registration, and the `OJ_JUDGE_NODE_ID` value in `/etc/ojplatform/judge-host.env`. |
| Web image build fails on the plugin context | The OnlineCodeEditor checkout is missing; see above. |
| Rootfs identity drift reported | Compare `<rootfs>.content-manifest.txt`, then re-run with `--allow-rootfs-identity-drift` after review. |
| `up -d --build` recreate fails with "cannot stop container" | Transient Docker daemon health-check session failure under load; re-run the same command. An idle-host run converges in a single pass. |

## Verified end-to-end

This procedure was executed on a brand-new disposable Ubuntu 24.04.5 amd64 VM
with no repository, no toolchain and no Docker volumes. Results:

- `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  completed in a single pass; all six long-lived services healthy and all five
  one-shot bootstrap/migration jobs exited 0.
- Only Web was publicly published; API, Judge Service, Worker Redis and the
  Supervisor were loopback-only.
- `sudo ./deploy/judge-host/install.sh` completed with all 15 security gates OK.
- Worker readiness reported `control_plane/redis/supervisor = true` and Judge
  Service reported `EXECUTION_READY` with one schedulable node and one slot.
- Real submissions through the Product API produced `AC`, `WA`, `CE`, `RE` and
  `TLE` verdicts from the rootless runc sandbox.
- The OnlineCodeEditor mounted as real CodeMirror DOM in a browser.
- A second Compose run and a second `install.sh` run were idempotent with no
  data loss, and a guest reboot restored the whole stack and answered
  `EXECUTION_READY` without re-running the installer.

## Related references

- `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md` - production runbook and secret matrix
- `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md` - control-plane and execution-cell design
- `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` - repeatable native qualification checklist
- `Docs/deployment/DOCKER_INFRASTRUCTURE.md`, `DOCKER_API.md`, `DOCKER_WEB.md` - per-component details
