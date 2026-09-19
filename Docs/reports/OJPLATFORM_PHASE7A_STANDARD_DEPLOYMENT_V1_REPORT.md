# Phase 7A Standard Deployment Report

Date: 2026-09-19
Status: **PARTIAL** (host execution-cell provisioning blocked by missing root
access on the disposable fresh VM)

## Live Baseline

Canonical `D:\OJPlatform` was on clean `main`; `HEAD` and `refs/heads/main` were
`4bf0935ea5375b2a8eacd28b577934fea347efb1`. Existing stashes and worktrees were
preserved. Feature work ran in the fresh worktree
`D:\OJPlatform-worktrees\phase7a-standard-deployment-v1` on
`codex/phase7a-standard-deployment-v1`.

## Phase 7 Definition

The repository never defined Phase 7. It was formally defined by this task:

```text
Phase 7  = Fresh-Machine Deployment & Bootstrap
Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning
```

The historical `Phase 7–9 NOT STARTED` handoff line was a placeholder with no
scope and no acceptance criteria; it is left unmodified in history.

## Files Changed

- `compose.yaml` - Web plugin build input is now an optional repository-local
  default instead of a hard requirement.
- `.env.production.example` (new) - single production env template.
- `pnpm-workspace.yaml` - removed the dormant `plugins/*` workspace glob.
- `.dockerignore` - excludes the foreign plugin checkout from the main context.
- `deploy/judge-host/install.sh` (new) - the single host provisioning script.
- `deploy/judge-host/systemd/ojplatform-{worker,host-agent,supervisor}.service`
  (new).
- `deploy/judge-host/apparmor/ojplatform-runc` (new).
- `apps/judge-host-agent/package.json` - `build:host` self-contained ESM bundle.
- `package.json` - `build:host-agent:host` entry.
- `plugins/README.md` (new) - plugin acquisition location.
- `README.md` - short production deployment entry.
- `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md` (new) - canonical deployment
  guide.
- `scripts/qualify-production-judge-config.mjs` - drops the plugin-path
  requirement and asserts the decoupling plus the repository-local default.
- `tests/deployment-contract.test.ts` (new) - 12 contract assertions.
- `Docs/OJPLATFORM_CURRENT_HANDOFF.md`, `Docs/PROJECT_STATUS.md` - hot state and
  append-only history.

## Final Deployment Architecture

```text
Docker Compose (only orchestrator)     Host-native (systemd + install.sh)
  web        nginx + SPA (public)        ojplatform-supervisor  (oj-sandbox, 127.0.0.1:19092)
  api        Product API (loopback)      ojplatform-worker      (oj-worker)
  postgres   Product DB (private)        ojplatform-host-agent  (oj-host-agent, 127.0.0.1:13180)
  redis      ACL identities (loopback)   runc sandbox           (kernel namespaces/cgroups/seccomp)
  minio      object storage (private)    compiler rootfs        (root-owned, immutable)
  judge-service / judge-bootstrap / migrate-judge / migrate-product / minio-bootstrap
```

No custom orchestrator, no Docker wrapper CLI, and no shadow status command was
introduced.

## Canonical Compose Commands

```sh
# Core only
docker compose -f compose.yaml -f compose.prod.yaml up -d --build

# Full, including the Judge control plane
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
```

The explicit `-f` list is retained on purpose: `compose.prod.yaml` is an overlay
that must not be silently implied.

## OnlineCodeEditor Acquisition

Method: **EXTERNAL** (unchanged contract, now with a canonical repository-local
location).

- `D:\OJPlatformPlugins\OnlineCodeEditor` is a Git repository with
  `branch=main`, `HEAD=09877bf30a344bfd8d61775d1ee64c8ae61c9f86` and **no
  remote**: `git remote -v` is empty and `.git/config` has no `[remote]` section.
- A Git submodule therefore cannot be pinned without inventing a remote, which
  the task forbids. `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION = BLOCKED`.
- The repository now expects the checkout at `plugins/OnlineCodeEditor`
  (Git-ignored, separate history) and documents the one-line clone.
- Fixed during this phase: the plugin must not be a pnpm workspace package
  (the dormant `plugins/*` glob broke `pnpm install --frozen-lockfile` inside
  image builds) and must not enter the main Docker build context.

## Env Contract

`.env.production.example` is the single user-edited file. It is grouped into
OPTIONAL and REQUIRED sections, uses `<set-strong-random-value>` placeholders,
contains no real or demo production secret and no machine-specific absolute
path, and documents every variable that `compose.prod.yaml` gates. A contract
test fails if the template and the overlay ever diverge.

## Linux Host Provisioning

`deploy/judge-host/install.sh` is the only custom script. Responsibilities:
prerequisite gates, service identities, AppArmor user-namespace grant, host
directories and ownership, Worker/Supervisor/Host Agent builds, compiler rootfs,
protected env files, systemd installation and post-install security gates.

Safety properties implemented and tested: `set -euo pipefail`, `umask 0027`,
root required, idempotent, existing secrets never overwritten, no destructive
Docker cleanup, never grants the `docker` group, removes a privileged group if
found, fails closed on security-gate failure, never echoes secrets.

## oj-sandbox Provisioning

Created as a system user with only its primary group; `docker`, `sudo`, `adm`,
`disk` and `root` membership is actively removed. Linger and the user manager are
enabled so the Supervisor keeps delegated cpu/memory/pids controllers. A fresh
process is checked for Docker-socket readability and group membership.

## Host Agent Installation

Self-contained ESM bundle (`esbuild`, Node 22) installed at
`/opt/ojplatform/host-agent/dist/server.mjs`, run by the
`ojplatform-host-agent.service` unit as `oj-host-agent`. Bundling avoids
`pnpm deploy --prod`, which would otherwise leave the operator's workspace in a
production-only state.

## Worker Installation

`go build -trimpath` from `apps/judge-worker` into
`/opt/ojplatform/bin/ojplatform-worker`, root-owned mode 0755, run by
`ojplatform-worker.service` as `oj-worker`. No database, MinIO or Docker
credential is present; `REAL_SUBMISSION_EXECUTION=true`, Redis URL, Judge
Service URL and artifact tokens come from `/etc/ojplatform/judge-host.env`
(0600).

## Supervisor Installation

`go build -trimpath` for both `cmd/supervisor` and `cmd/trusted-probe` into
`/opt/ojplatform/bin`, root-owned mode 0755. Installed as a systemd **user** unit
for `oj-sandbox` with `ExecStart=... -listen 127.0.0.1:19092`, reading
`/etc/ojplatform/supervisor.env` (0640 `root:oj-sandbox`).

## Compiler Rootfs

`install.sh` reuses an existing rootfs by default, rebuilds only with
`--rebuild-rootfs`, and calls the unchanged
`scripts/phase2c1-prepare-compiler-rootfs.sh` (digest- and snapshot-pinned).
It re-verifies `root:root` ownership and the absence of any writable
non-symlink path, and fails closed when the identity differs from
`191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2` unless
`--allow-rootfs-identity-drift` is given after manual manifest review.

## systemd Units

`deploy/judge-host/systemd/` is now the authoritative source. Worker and Host
Agent are system units with `Restart=always`, `NoNewPrivileges=yes` and no
`User=root`. Supervisor is a user unit (`WantedBy=default.target`) so it keeps
the user manager's delegated controllers. All three recover automatically after
a reboot and fail closed when the control plane is unavailable.

## Security Gates

`install.sh` fails when any of these fail: `oj-sandbox` group membership, Docker
socket readability, Worker Docker-group membership, rootfs ownership, rootfs
immutability, trusted binary ownership/mode, unit users, secret file modes,
Supervisor loopback-only listener, Supervisor liveness.

## Fresh Machine Guide

`Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md` is the single entry point:
prerequisites, clone, env, two deploy commands, verification, operations,
plugin acquisition, upgrade, reboot behaviour and troubleshooting. `README.md`
links to it and shows the core commands.

## Fresh VM Qualification

Disposable full clone `OJPlatform-Phase7A-FreshDeploy-V1` created from the base
VM (base VM and `clean-base` snapshot untouched). The clone had no repository,
no Go/Node/pnpm, and no Docker volumes. A genuine fresh acquisition was
performed: `git clone -b codex/phase7a-standard-deployment-v1 <bundle>` plus
`git clone -b main <plugin bundle> plugins/OnlineCodeEditor`.

Verified on that machine:

- `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  completed in 2m11s from an empty machine.
- Six long-lived services healthy; five one-shot jobs (`redis-acl-bootstrap`,
  `minio-bootstrap`, `migrate-product`, `judge-bootstrap`, `migrate-judge`)
  exited 0.
- Only Web published publicly (`0.0.0.0:8080`); API `127.0.0.1:3010`,
  Judge Service `127.0.0.1:3100`, Worker Redis `127.0.0.1:6379`; PostgreSQL and
  MinIO unpublished.
- `web /` 200, `web /ready` 200 (Nginx → API), API `/health` 200.
- CodeMirror editor assets bundled into the Web image.

Environment note: Docker image pulls initially failed because the VMware NAT DNS
forwarder was unresponsive; it recovered without any host configuration change.
DNS is a host environment prerequisite, not a repository defect.

## Command Count

```text
MAIN_DEPLOY_COMMAND_COUNT = 2
  1. docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
  2. sudo ./deploy/judge-host/install.sh
```

`git clone`, `cp .env.production.example .env` and `$EDITOR .env` are
acquisition/configuration, not orchestration. No hidden manual `sudo` steps are
required outside `install.sh`.

## Core Deployment

Verified on the fresh VM by render (`migrate-product`, `postgres`, `redis`,
`redis-acl-bootstrap`, `minio`, `minio-bootstrap`, `api`, `web` only) and by the
full run where the Core services all became healthy.

## Full Deployment

Control plane: **PASS** on the fresh VM. Host execution cell: **NOT RUN** (see
blockers).

## Browser / Editor Smoke

**PARTIAL.** Bundle-level verification passed (CodeMirror assets present in the
served Web image, `/` and `/ready` return 200 through Nginx). A DOM-level
browser smoke was **NOT RUN**: no browser is available inside the disposable VM.

## Real Judge Smoke

**NOT RUN.** Independent of the verdicts, the execution cell could not be
provisioned, so `AC`, `WA`, `CE`, `RE` and `TLE` were not exercised on this
machine. Native Linux amd64 real verdict evidence from Phase 6B-6 remains
authoritative and is unchanged by this phase.

## Reboot Recovery

**NOT RUN** for the host units (not installed). Compose services are declared
`restart: unless-stopped`.

## Second Compose Run

**NOT RUN** on the fresh VM.

## Second install.sh Run

**NOT RUN** on the fresh VM. Idempotency is implemented (existing users,
directories, secrets and env files are reconciled rather than replaced) and
static contract tests assert it, but it was not executed end to end.

## Security Regression

**PASS (no regression).** No sandbox, Supervisor, Worker, seccomp, rlimit,
cgroup, Redis ACL or Compose security boundary was weakened. The compose change
only turns a hard requirement into a documented default, and the plugin is now
excluded from the main build context. `PRODUCTION_JUDGE_QUALIFIED = YES` and
`LINUX_AMD64_FULL_JUDGE = QUALIFIED` are unchanged. Worker/Supervisor Go tests,
`go vet`, focused Vitest (73/73), typecheck and the architecture gate pass;
repository-wide red gates remain the same pre-existing baseline debt.

## Remaining Gaps

1. `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION = BLOCKED`: no authoritative Git
   remote exists for the plugin repository, so no pinned submodule is possible.
2. Host execution-cell provisioning, real judge verdicts, reboot recovery and
   the second-run checks are **NOT RUN** because the disposable fresh VM has no
   root access for the `ojplatform` user (no root SSH key, no passwordless
   sudo). This is an environment blocker, not an implementation gap.
3. DOM-level editor smoke not executed (no browser inside the VM).

## Handoff

Updated: Phase 7 and Phase 7A are defined, Phase 7A is PARTIAL / FEATURE BRANCH,
the blocker and the exact next action are recorded, and Phase 5 Mac / ARM64 /
Mac Judge boundaries are preserved. Handoff is 91 lines.

## Commit

- `62ca93d` - `feat: standardize fresh-machine production deployment`
- `4a58d0b` - `fix: keep the plugin checkout out of the workspace and build context`
- Current worktree changes (this report, handoff, PROJECT_STATUS) are committed
  with the phase record.

## Next Action

Grant root on the Phase 7A fresh VM (or run
`sudo ./deploy/judge-host/install.sh` there), then complete: execution-cell
start, `EXECUTION_READY`, real AC/WA/CE/RE/TLE, one guest reboot, a second
Compose run and a second `install.sh` run. Resolve the OnlineCodeEditor remote
question before claiming acquisition PASS.
