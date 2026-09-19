# Phase 7A Standard Deployment Report

Date: 2026-09-19
Status: **PARTIAL** — all deployment and E2E acceptance passed; the only open
item is OnlineCodeEditor acquisition, which is blocked by a missing
authoritative plugin remote.

## Live Baseline

Canonical `D:\OJPlatform` stayed on clean `main`
(`4bf0935ea5375b2a8eacd28b577934fea347efb1`) and was never modified or merged.
Work happened on `codex/phase7a-standard-deployment-v1` in
`D:\OJPlatform-worktrees\phase7a-standard-deployment-v1`.

## Phase 7 Definition

The repository never defined Phase 7. This task defined it:

```text
Phase 7  = Fresh-Machine Deployment & Bootstrap
Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning
```

The historical `Phase 7–9 NOT STARTED` handoff text was a scope-less placeholder
and is left unmodified in history.

## Final Deployment Architecture

```text
Docker Compose (only orchestrator)          Host-native (systemd + install.sh)
  web         nginx + SPA (public 8080)       ojplatform-supervisor (oj-sandbox, 127.0.0.1:19092)
  api         Product API (127.0.0.1:3010)    ojplatform-worker     (oj-worker)
  postgres    private                         ojplatform-host-agent (oj-host-agent, 127.0.0.1:13180)
  redis       loopback for the Worker         rootless runc sandbox
  minio       private                         immutable compiler rootfs (root:root 0555)
  judge-service (127.0.0.1:3100) + one-shot bootstrap/migration jobs
```

No custom orchestrator, Docker wrapper, or shadow status CLI was introduced.
Operators use `docker compose`, `systemctl` and `journalctl`.

## Canonical Commands

```sh
docker compose -f compose.yaml -f compose.prod.yaml up -d --build            # Core
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
sudo ./deploy/judge-host/install.sh                                          # execution cell
```

`MAIN_DEPLOY_COMMAND_COUNT = 2`; clone, `cp .env.production.example .env` and
editing it are acquisition/configuration, not orchestration.

## Env Contract

`.env.production.example` remains the single user-edited file: REQUIRED/OPTIONAL
sections, `<set-strong-random-value>` placeholders, no real or demo production
secret, no machine-specific absolute path. A contract test fails if the template
and `compose.prod.yaml` ever diverge. `install.sh` derives
`/etc/ojplatform/judge-host.env` and `/etc/ojplatform/supervisor.env` from it.

## OnlineCodeEditor Acquisition

`BLOCKED`. `D:\OJPlatformPlugins\OnlineCodeEditor` is a Git repository
(`branch=main`, `HEAD=09877bf30a344bfd8d61775d1ee64c8ae61c9f86`) with **no
remote**: `git remote -v` is empty and `.git/config` has no `[remote]` section.
A pinned submodule is therefore impossible without inventing a remote, which the
task forbids. Method stays **EXTERNAL** with the documented repository-local
location `plugins/OnlineCodeEditor`, which is Git-ignored and excluded from the
main Docker build context.

## Linux Host Provisioning

`deploy/judge-host/install.sh` is the only custom deployment script: strict
mode, `umask 0027`, root required, idempotent, fail-closed, never echoes
secrets, never prunes Docker resources, never grants a privileged group (and
removes one if found), and restores repository ownership afterwards.

## oj-sandbox Provisioning

System user with primary group only; `docker/sudo/adm/disk/root` membership is
actively removed and verified. Linger plus the running user manager provide
`cpu memory pids` delegation (verified: `Delegate=yes`,
`DelegateControllers=cpu memory pids`). Docker socket is unreadable.

## Host Agent / Worker / Supervisor Installation

- Host Agent: single ESM bundle built with a pinned on-demand
  `esbuild@0.28.2` and `fastify@5.12.1` deployed beside it at
  `/opt/ojplatform/host-agent`, made readable with `chmod -R a+rX`.
- Worker: `go build -trimpath` to `/opt/ojplatform/bin/ojplatform-worker`, run
  by `ojplatform-worker.service` as `oj-worker`.
- Supervisor and trusted probe: `go build -trimpath` to
  `/opt/ojplatform/bin`, run by the `oj-sandbox` user unit
  `ojplatform-supervisor.service` with `-listen 127.0.0.1:19092`.

All three systemd units live in `deploy/judge-host/systemd/`.

## Compiler Rootfs

Built by the unchanged, digest- and snapshot-pinned
`scripts/phase2c1-prepare-compiler-rootfs.sh`; `install.sh` reuses an existing
rootfs, verifies `root:root` plus the absence of any writable non-symlink path,
and refuses identity drift unless `--allow-rootfs-identity-drift` is given.
Built identity matched the reviewed canonical value exactly:
`191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.

## systemd

`ojplatform-worker.service` and `ojplatform-host-agent.service` are system units
(`User=oj-worker` / `User=oj-host-agent`, `Restart=always`,
`NoNewPrivileges=yes`); the Supervisor is a user unit
(`WantedBy=default.target`, `NoNewPrivileges=yes`). All three were verified
`active` and `enabled`, and recovered automatically after a reboot.

## Security Gates

15 gates, all failing-closed: sandbox group membership, Docker socket,
Worker Docker group, rootfs owner, rootfs immutability, trusted binaries,
sandbox/Worker executable bits, Host Agent readability, Worker Redis prefix vs
ACL, unit users, secret file modes, sandbox env readability, sandbox cgroup
delegation, loopback-only Supervisor listener, and Supervisor liveness.

## Fresh VM Qualification

Disposable full clone `OJPlatform-Phase7A-FreshDeploy-V1` (base VM and
`clean-base` snapshot untouched). The clone started with no repository, no
Go/Node/pnpm, no Docker volumes and no images. A genuine fresh acquisition was
performed from Git bundles, including the plugin at `plugins/OnlineCodeEditor`.

Verified on that machine:

- `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  completed in a single pass; all six long-lived services healthy; all five
  one-shot jobs (`redis-acl-bootstrap`, `minio-bootstrap`, `migrate-product`,
  `judge-bootstrap`, `migrate-judge`) exited 0.
- Only Web published publicly; API 127.0.0.1:3010, Judge Service 127.0.0.1:3100,
  Worker Redis 127.0.0.1:6379, Worker health 127.0.0.1:19093, Host Agent
  127.0.0.1:13180, Supervisor 127.0.0.1:19092; PostgreSQL and MinIO private.
- `sudo ./deploy/judge-host/install.sh` completed with **all 15 gates OK** and
  `execution cell provisioning complete`.
- Worker `/ready` returned `control_plane=true, redis=true, supervisor=true`.
- Judge Service `/v1/execution-readiness` returned `EXECUTION_READY` /
  `QUALIFIED_CAPACITY_AVAILABLE`, `registeredNodes=1`, `schedulableNodes=1`,
  `availableSlots=1`.

Environment note: the VMware NAT DNS forwarder was briefly unresponsive and
recovered without a host configuration change; one `up -d --build` recreate hit
a transient Docker daemon health-check session failure under load
(`session healthcheck failed: Unavailable`), with no OOM and no containerd
error. Re-running the same command converged cleanly.

## Real Judge Smoke

Real Product API traffic produced all five verdicts through immutable JudgeData
artifacts -> Judge Service -> Worker -> Supervisor -> rootless runc:

```text
REAL_JUDGE_AC  = PASS   REAL_JUDGE_WA  = PASS   REAL_JUDGE_CE  = PASS
REAL_JUDGE_RE  = PASS   REAL_JUDGE_TLE = PASS
```

Only synthetic submissions were used.

## Editor Browser Smoke

PASS. In headless Chrome against the deployed VM, the solve page mounted real
CodeMirror DOM (`.cm-editor`, `.cm-content`, `.cm-gutters`, one `cm-line`),
accepted typed input (`#include <iostream> int main(){return 0;}`), and produced
zero page errors. A screenshot was captured. This is a DOM-level result, not a
bundle-content check.

## Second Compose Run

PASS (single pass, 23.5 s, idle host): all six services healthy, all five
one-shot jobs exited 0 again, and data counts were identical before and after
(`submissions=10`, `problems=7`, `users=7`). No ACL reset, no migration
duplication, no data loss.

## Second install.sh Run

PASS. Reported `SECOND_INSTALL_RUN=PASS` with existing users
("user oj-sandbox already exists"), reused compiler rootfs, refreshed derived
host env files, and all 15 gates OK. No duplicate user/unit errors, no secret
reset, no permission drift, no Docker-group regression, no rootfs corruption.

## Reboot Recovery

PASS. After `systemctl reboot`, with no installer re-run: the Docker stack
returned healthy, both system units came back `active`, the Supervisor answered
`/v1/health` with `200`, Redis ACL still authenticated the Worker identity while
the default user stayed denied (`NOAUTH`), `oj-sandbox` still had primary group
only with an unreadable Docker socket, the compiler rootfs kept `root:root 0555`
and the canonical identity, data counts were unchanged, and Judge Service
reported `EXECUTION_READY` again.

## Post-Reboot Judge Smoke

PASS for all five verdicts (`AC`, `WA`, `CE`, `RE`, `TLE`) after the reboot,
proving the execution cell genuinely recovered rather than merely keeping a
process alive.

## Security Regression

PASS. No sandbox, Supervisor, Worker, seccomp, rlimit, cgroup, Redis ACL or
Compose security boundary was weakened. `PRODUCTION_JUDGE_QUALIFIED = YES` and
`LINUX_AMD64_FULL_JUDGE = QUALIFIED` are unchanged. Worker/Supervisor Go tests
and `go vet`, 64 focused Vitest tests, typecheck, build, architecture gate,
production Compose render, and shellcheck (0 warnings) all pass; repository-wide
red gates remain the same pre-existing baseline debt.

## Files Changed

`compose.yaml`, `.env.production.example`, `pnpm-workspace.yaml`,
`.dockerignore`, `deploy/judge-host/install.sh`,
`deploy/judge-host/systemd/*.service`, `deploy/judge-host/apparmor/ojplatform-runc`,
`apps/judge-host-agent/package.json`, `package.json`, `plugins/README.md`,
`README.md`, `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md`,
`scripts/qualify-production-judge-config.mjs`,
`tests/deployment-contract.test.ts`, handoff, PROJECT_STATUS, this report.

## Defects Found And Fixed During Qualification

Each was reproduced and then fixed with executed evidence:

1. `seccomp` capability check matched `/proc/self/status` case-sensitively
   (`Seccomp:`) and failed closed on a valid kernel.
2. `unit_dir` assignment was accidentally joined with the next command, and ten
   `gate "$gate_x"` call sites were unbound-variable bugs under `set -u`.
3. `install.sh` was stored with CRLF line endings, breaking its shebang.
4. The OnlineCodeEditor checkout was a dormant `pnpm-workspace.yaml` glob and
   entered the main Docker build context, breaking
   `pnpm install --frozen-lockfile` inside image builds.
5. Host Agent bundling required workspace `node_modules` and could not resolve
   `fastify` on a pristine checkout.
6. `umask 0027` left the Go binaries at `0750` (Supervisor `203/EXEC`) and the
   Host Agent dependency tree unreadable (`ERR_MODULE_NOT_FOUND`).
7. `/etc/ojplatform` was not traversable by the unprivileged user manager
   ("Failed to load environment files: No such file or directory").
8. The Worker queue prefix did not match the Compose Redis ACL prefix, causing
   `NOPERM` on the heartbeat key and a permanently `DEGRADED` Worker.
9. Derived host env files were frozen at first write, which would have hidden
   fix 8 forever.
10. The Supervisor readiness gate raced process startup; it now polls up to 120 s.
11. Two untyped helpers in `tests/deployment-contract.test.ts` broke the
    production API image build through `tsconfig.build.json`.
12. A root install could leave a root-owned `.git/index` in an operator
    checkout; the installer now restores the repository owner.

## Remaining Gaps

1. `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION = BLOCKED` (no authoritative
   plugin remote). This is the single reason Phase 7A is PARTIAL rather than
   PASS.
2. `install.sh` requires a Go/Node/pnpm toolchain on the host, which it does not
   install itself. Documented as a prerequisite with an actionable failure
   message; not automated by design.
3. Linux ARM64 and macOS remain out of scope (`NOT QUALIFIED` / `NOT TARGET`).

## Commit

Phase 7A feature commits on `codex/phase7a-standard-deployment-v1`; see
`git log` on that branch. `main` was not merged.

## Next Action

Decide the OnlineCodeEditor remote/acquisition policy, then have an Integration
Lead review and integrate the Phase 7A feature commits from the latest live
`main`. Do not start Phase 7B, ARM64 or Mac work without an explicit decision.
