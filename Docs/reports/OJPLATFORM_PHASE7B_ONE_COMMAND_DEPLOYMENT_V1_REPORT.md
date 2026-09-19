# Phase 7B One-Command Production Deployment Report

Date: 2026-09-19
Status: **PARTIAL (checkpoint)** — the implementation and local contract gates
pass; the fresh-host qualification loop (public remote, fresh Ubuntu bootstrap,
Judge/browser E2E, reboot, idempotency) and the integration/publication steps
are not finished and are recorded precisely below so the next session resumes
from this commit without leaving anything half-applied on `main`.

## Baseline

- Live `main` at task start and at checkpoint:
  `56a68e74ea43e7f3045589362d50b585fae3faa3` (clean, unmodified, not merged).
- Phase 7B feature branch `codex/phase7b-one-command-deployment-v1` in
  `D:\OJPlatform-worktrees\phase7b-one-command-deployment-v1`.
- OnlineCodeEditor remote `https://github.com/wyl20020808/OnlineEditor.git`
  (public), submodule `plugins/OnlineCodeEditor` pinned at
  `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`.
- The three existing stashes and all worktrees were preserved.

## What was implemented

### 1. Host build-toolchain removal (`98c3648`)

`deploy/judge-host/install.sh` no longer requires Go, Node or pnpm on the host:

- Worker, trusted probe and Supervisor are compiled in a pinned
  `golang:1.22-bookworm` builder container (matches `go 1.22` in `apps/*/go.mod`,
  `CGO_ENABLED=0`, `GOPROXY=off`, repository mounted read-only at `/src`, output
  written directly to `/opt/ojplatform/bin`).
- The Host Agent is now **optional**. It is the only host-native Node process,
  so Node is required only when the agent is actually installed. `auto` (the
  default) installs it when a Node runtime already exists; `--with-host-agent`
  requires it; `--skip-host-agent` disables it. When it is not installed the
  unit, its gates and its environment steps are skipped, and a previously
  installed unit is removed.
- pnpm is gone: the bundle is produced with `npx --yes esbuild@0.28.2` and the
  single runtime dependency is installed with `npm --prefix ... install
  --omit=dev` (npm ships with Node).

Executed evidence: the builder produced `ojplatform-supervisor` (5.8 MB),
`ojplatform-worker` (6.1 MB) and `trusted-probe` (2.2 MB), all
`ELF 64-bit LSB executable, x86-64, statically linked, stripped`, and the
supervisor binary runs and prints its usage.

### 2. One-command installer (`abaae1a`)

`deploy/install.sh` (mode 100755) is an idempotent bootstrap on top of the
standard tooling. Docker Compose remains the only orchestrator. Order:

1. preflight — Linux only, **x86_64 only** (ARM64 fails closed), systemd,
   cgroup v2, >= 2 CPU, >= 4 GiB RAM, >= 15 GiB free on `/var/lib`;
2. Docker — reuses a working Engine + Compose v2, otherwise installs
   `docker-ce docker-ce-cli containerd.io docker-buildx-plugin
   docker-compose-plugin` from `download.docker.com` and enables the service;
   never disables a firewall or loosens the Docker socket;
3. source — `git submodule sync/update --init --recursive`, then verifies the
   plugin HEAD equals the pinned gitlink and aborts on drift; never runs
   `git pull`, `git checkout` or `git reset`;
4. environment — creates `.env` (0600) from the production template with
   `openssl rand`/`/dev/urandom` secrets, never prints them, reuses an existing
   file untouched and fails closed on a missing required value;
5. ports — refuses to start when a required port is held by an unrelated
   process; never kills a process;
6. control plane — the documented
   `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`;
7. health — bounded wait for `postgres`, `redis`, `minio`, `api`, `web`,
   `judge-service` to be healthy, then application endpoint checks and a real
   check that the served bundle contains the OnlineCodeEditor; success is never
   printed before this gate;
8. execution cell — delegates to `deploy/judge-host/install.sh` (no duplicated
   Judge logic), or `--skip-judge-host` for a control-plane-only host.

Flags: `--check`, `--non-interactive`, `--env-file`, `--skip-docker-install`,
`--skip-judge-host`, `--no-build`, `--help`.

### 3. Read-only doctor (`6ad205a`, `635eab6`)

`deploy/doctor.sh` (mode 100755) inspects an existing deployment and never
changes the host. It reports host/OS/arch/cgroup, Docker and Compose versions,
repository and submodule commits, env presence/mode and required-value coverage
(values never printed), Compose service status, Worker/Host Agent units, the
Supervisor user unit, `oj-sandbox` privilege boundaries, loopback endpoint codes
for web/api/judge/worker, storage and `docker system df`, and listeners, ending
with `DEPLOY_DOCTOR=PASS` or `DEPLOY_DOCTOR=FAIL`. Without root it degrades the
identity-assuming checks to informational lines instead of false failures and
still verifies the loopback Supervisor listener.

### 4. Contract tests (`638c1b1`)

`tests/production-install-contract.test.ts` (13 tests) asserts: executable
one-command installer, Compose as the only orchestrator with no private
container lifecycle, fail-closed unsupported platform/resource handling,
Docker installed from the official repo only when needed and without weakening
host security, pinned-submodule acquisition with no `git pull`, one-time secret
generation that never prints secrets, port-conflict refusal, the health gate
ordering before success, doctor delegation and read-only doctor behaviour, no
host Node/pnpm/Go requirement, retention of the documented two-command manual
path, and no machine-specific paths in the docs.

`tests/deployment-contract.test.ts` was extended to 26 tests covering the new
toolchain contract and the optional Host Agent.

### 5. Documentation (`75cbbbe`)

`README.md` now leads with the one-command quick start, the doctor, and the
update procedure, and still documents the manual two-command path.
`Docs/deployment/ONE_COMMAND_DEPLOYMENT.md` documents prerequisites, what the
installer does and changes, the Docker bootstrap, secrets, ports, volumes, the
Judge execution cell, the update procedure, re-run behaviour, diagnosis and
reboot behaviour.

## Validation executed

| Gate | Result |
| --- | --- |
| `bash -n` on `install.sh`, `doctor.sh`, `judge-host/install.sh` | PASS |
| shellcheck (`-x -S warning`) on all three scripts | PASS, 0 warnings |
| Go builder produces static amd64 binaries in Docker | PASS (executed) |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm typecheck` / `pnpm build` | PASS |
| `pnpm test:architecture` | PASS |
| ESLint on changed test files | PASS |
| Prettier on changed docs/tests | PASS |
| `tests/deployment-contract.test.ts` + `tests/production-install-contract.test.ts` | 39/39 PASS |
| Focused regression (judge service container, redis ACL, judge qualification, sandbox qualification) | PASS |
| `scripts/qualify-production-judge-config.mjs` | PASS |
| `git diff --check` | PASS |
| `deploy/doctor.sh` on the real Ubuntu 24.04 VM | PASS (exit 0, supervisor loopback verified) |

## Not finished (blocking a Phase 7B PASS)

1. **Full one-command run on a host.** `sudo ./deploy/install.sh` was not
   executed end to end: the dedicated VM's `ojplatform` account has no
   passwordless sudo, so the agent cannot run the privileged installer without
   an operator action. Everything before the privileged step (`--check`
   preflight on the VM clone, submodule acquisition from GitHub, doctor) was
   executed.
2. **Fresh host without Docker.** The available disposable VM already has
   Docker, so the Docker-bootstrap branch is implemented and statically tested
   but not exercised on a host where Docker is absent.
3. **Judge E2E and browser E2E on the fresh Phase 7B host**, the reboot test,
   and the second-run idempotency test all depend on (1).
4. **Public remote publication.** `https://github.com/wyl20020808/OJ.git` is
   still unpublished; the security/history audit and the push were not
   performed in this session.
5. **Integration and final public-remote fresh-host test.** Because (1)–(4) are
   open, nothing was merged into `main`; `main` is untouched at `56a68e7`.

Nothing partial was left on `main`; all Phase 7B work is committed on the
feature branch and the worktree is clean.

## Next action

Start the next session here:

1. Ask the operator for one privileged action on the disposable VM
   (`sudo bash <script>` running `deploy/install.sh`), then complete
   Judge E2E, browser E2E, reboot survival and the second installer run.
2. Run the secret/history audit and publish the then-current known-good `main`
   to `https://github.com/wyl20020808/OJ.git` (no force, `main` only).
3. Integrate the Phase 7B feature branch into the latest live `main` with a
   `--no-ff` merge after the full gate, push `main`, and repeat the loop from a
   clean VM that has no Docker, Node, pnpm or Go, cloning only from the public
   remote.
