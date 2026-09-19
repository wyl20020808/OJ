# One-Command Production Deployment

`deploy/install.sh` is the supported production entry point for a fresh Ubuntu
x86_64 host.

```sh
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

It is an idempotent bootstrap on top of the standard tooling. Docker Compose
still owns every container; nothing in this path replaces it or hides it.

## Prerequisites

| Requirement | Detail |
| --- | --- |
| OS | Ubuntu 24.04 LTS x86_64 (the qualified baseline). Other Linux distributions are diagnosed but not qualified. |
| Architecture | `x86_64` only. Linux ARM64 is **NOT QUALIFIED** and fails closed. |
| Hardware | >= 2 CPUs, >= 4 GiB RAM, >= 15 GiB free on `/var/lib` |
| Init/system | systemd as PID 1, cgroup v2 unified hierarchy |
| Network | Outbound HTTPS to the Docker repository, GitHub, and container registries |
| Tools | `git`, `curl`, and root (`sudo`). **Node, pnpm and Go are not required.** |
| Docker | Not required beforehand: the installer installs Docker Engine, CLI, containerd, buildx and the Compose v2 plugin from the official Docker repository when they are missing. |

## What the installer does

1. **Preflight** - OS, architecture, root, systemd, cgroup v2, CPU/RAM/disk.
   Unsupported platforms fail closed with an explicit message.
2. **Docker** - reuses a working Docker Engine + Compose v2 when present;
   otherwise installs them from `download.docker.com` and enables the service.
   It never disables a firewall, SELinux/AppArmor, or loosens the Docker socket.
3. **Source** - runs `git submodule sync --recursive` and
   `git submodule update --init --recursive`, then verifies that the plugin HEAD
   equals the gitlink pinned by the checked-out commit. A drifted submodule
   aborts the deployment. The installer never runs `git pull`.
4. **Environment** - creates `.env` from `.env.production.example` when it does
   not exist, replacing every `<set-strong-random-value>` placeholder with a
   cryptographically random value, and sets the file to `0600`. **Secrets are
   never printed.** An existing `.env` is reused untouched, and the installer
   fails closed if a required production value is missing.
5. **Ports** - refuses to start when a required port is held by an unrelated
   process. It never kills another process.
6. **Control plane** - runs
   `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`.
   A build or startup failure propagates its exit status.
7. **Health** - waits (bounded) until `postgres`, `redis`, `minio`, `api`, `web`
   and `judge-service` report healthy, then verifies application endpoints
   (`web /`, `api /ready`, `judge /health`) and that the served Web bundle really
   contains the OnlineCodeEditor. Success is never printed before this gate.
8. **Execution cell** - delegates to `deploy/judge-host/install.sh`, which owns
   the host-native Supervisor, Worker, optional Host Agent and compiler rootfs.

## What it changes on the host

- `/opt/ojplatform` - execution-cell binaries, Host Agent bundle, compiler rootfs
- `/var/lib/ojplatform` - Supervisor sandbox state (owned by `oj-sandbox`)
- `/etc/ojplatform/judge-host.env`, `/etc/ojplatform/supervisor.env` (0600/0640)
- systemd units `ojplatform-worker.service`, `ojplatform-supervisor.service`
  (user unit for `oj-sandbox`), and `ojplatform-host-agent.service` when Node is
  present
- service identities `oj-sandbox`, `oj-worker` and `oj-host-agent`
- a narrow AppArmor `userns` grant for `/usr/bin/runc` when the host restricts
  unprivileged user namespaces

It does not modify the repository checkout, does not run `git pull`, and does
not touch unrelated Docker resources.

## Secrets

`.env` is the single source of production configuration and is generated once.
Compose renders with `${VAR:?}` gates, so a missing value fails the render
instead of silently using a development default.

To rotate a secret: edit `.env`, then re-run `sudo ./deploy/install.sh` and
restart the affected services. Redis ACL identities are
re-applied idempotently by the ACL bootstrap job.

## Ports and volumes

- Public ingress: Web (`OJPLATFORM_WEB_PORT`, default 8080).
- Loopback only: Product artifact API (`3010`), Judge Service (`3100`), Worker
  Redis endpoint (`6379`), Worker health (`19093`), Supervisor (`19092`),
  optional Host Agent (`13180`).
- Private to the Compose network: PostgreSQL and MinIO.
- Named volumes: `postgres-data`, `redis-data`, `redis-acl`, `minio-data`. They
  survive `docker compose down` and reboots; `down -v` deletes data.

## Judge execution cell

Local judging needs the host-native execution cell, which the installer
provisions automatically. The Judge Host Agent is optional: it is installed only
when a Node runtime is already present, or when `--with-host-agent` is given
(which then requires Node). Use `--skip-judge-host` for a control-plane-only
host that relies on Workers running elsewhere.

## Update procedure

```sh
git pull --ff-only
git submodule update --init --recursive
sudo ./deploy/install.sh
```

Git version control stays with the operator: the installer deploys the checked
out commit and never changes it.

## Re-running the installer

Re-running is safe and expected. It reuses the existing `.env` without touching
secrets, reuses the installed compiler rootfs, rebuilds the execution-cell
binaries from the current checkout, rewrites the derived host configuration, and
converges the Compose services. Database migrations are one-shot Compose jobs
that re-run idempotently.

Options:

| Flag | Effect |
| --- | --- |
| `--check` | preflight only; changes nothing |
| `--non-interactive` | accepted for automation (the installer never prompts) |
| `--env-file PATH` | use a different production env file |
| `--skip-docker-install` | fail instead of installing Docker |
| `--skip-judge-host` | control-plane only, no local execution cell |
| `--no-build` | reuse existing images |

## Diagnosis

```sh
sudo ./deploy/doctor.sh
```

`doctor.sh` is strictly read-only. It reports OS/arch, Docker and Compose
versions, repository and submodule commits, env presence and permissions (never
values), Compose service status, execution-cell unit state, `oj-sandbox`
privilege boundaries, loopback endpoint codes, storage usage and listeners, and
ends with `DEPLOY_DOCTOR=PASS` or `DEPLOY_DOCTOR=FAIL`.

## Reboot behaviour

The Compose services use `restart: unless-stopped` and the execution-cell units
are enabled with `Restart=always`, so a reboot requires no manual step. If the
execution cell starts before the control plane, the Worker stays `DEGRADED` and
recovers once Judge Service and Redis are reachable.

## Related references

- `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md` - step-by-step manual path
- `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md` - Judge runbook and secret matrix
- `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md` - control plane and execution cell design
