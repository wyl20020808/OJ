# OJPlatform Docker Phase 6A Judge Architecture + Sandbox Security Audit V1 Report

## Decision

**DOCKER PHASE 6A JUDGE ARCHITECTURE AUDIT = PASS**

PASS means current topology and security boundaries are understood and a safe
Phase 6B blueprint exists. It does not mean Judge Docker implementation exists,
current WSL is runtime-ready, or the sandbox is production-qualified.

Recommended boundary: containerize Judge Service/control-plane jobs; retain Host
Agent, Worker, Supervisor, rootless runc, cgroup v2, compiler rootfs, and sandbox
lifecycles as a native Linux amd64 execution cell for the first qualified release.
Do not mount Docker socket or widen Supervisor loopback.

## Live Baseline

| Item | Evidence |
| --- | --- |
| Initial canonical branch | `main` |
| Initial HEAD/main | `3e46ff39e21941a6c61bce1c43ca200dfbf53592` |
| Initial working tree | clean |
| Token Optimization finalization | added as a short append-only status record on `main` as `93bb4ad7a4841673578775003ce1fe88533a34d1`; date correction committed without rewriting history as `014ce580790a5decfc25f16113f356f025f04d19` |
| Live main after correction | `014ce580790a5decfc25f16113f356f025f04d19` |
| Phase branch | `codex/docker-phase6a-judge-architecture-v1` |
| Phase worktree | `D:\OJPlatform-worktrees\docker-phase6a-judge-architecture-v1` |
| Phase base | `93bb4ad7a4841673578775003ce1fe88533a34d1` |
| Stashes/worktrees | preserved; no drop/remove/reset/clean/rebase |
| Runtime actions | no Runtime Manager start/restart/stop; no real Submission |
| Data actions | no DB write, user-data change, volume change, rootfs change, or cgroup change |

Only the targeted `Token Optimization V1` section of
`Docs/PROJECT_STATUS.md` was read. One historical report was loaded for required
sandbox evidence: `OJPLATFORM_2C1_CPP20_REAL_EXECUTION_FOUNDATION_REPORT.md`.
Current code and read-only live inspection remained authoritative.

## Judge Current Topology

```text
Product API
  -> authenticated Judge Service
  -> Judge DB + Redis queue/lease/control state
  -> authenticated node assignment
  -> Go Worker
  -> Product artifact read endpoint (verified materialization)
  -> loopback Supervisor
  -> compile rootless runc
  -> validated static ELF
  -> per-testcase runtime rootless runc
  -> Worker verdict derivation
  -> lease-bound Judge completion
  -> durable Product evaluation projection
```

Host Agent at `127.0.0.1:3180` owns fixed Worker templates/process lifecycle.
Supervisor at `127.0.0.1:19092` is Linux/WSL host-side. Current Worker is a
Windows host binary in the local Runtime Manager and reaches the WSL loopback
Supervisor through the local forwarding boundary.

A separate Product API operator path calls Supervisor loopback only for a frozen
catalog of trusted qualification probes. It accepts no contestant source,
command, mount, environment, network, or executable and is not the Submission
execution path. Phase 6B must allow that optional UI to report unavailable
rather than expose Supervisor through a Docker bridge without new authentication.

The durable chain is preserved by Product dispatch rows, Judge Service state,
Redis leases, node incarnation/assignment, immutable hashes, attempt generation,
and idempotent Product publication. Containerization must not replace these
with container-local memory.

## Trust Boundary Diagram

```text
TRUSTED
  Product API -> Judge Service -> Judge DB/Judge Redis
                         |
                         +-> optional Host Agent control

SEMI-TRUSTED / HIGH-RISK ORCHESTRATION
  Host Agent -> Worker -> dedicated non-root Supervisor

SECURITY BOUNDARY
  rootless runc + cgroup v2 + PID/mount/network/IPC/UTS/user namespaces

UNTRUSTED
  compiler workload and contestant executable
```

Product API and Judge Service are trusted control plane. Host Agent, Worker, and
Supervisor are trusted code but high-risk because they process attacker-controlled
bytes and manage execution. Contestant compile/runtime processes are untrusted.

Detailed access/write/elevation contracts are in
`Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`.

## Credential Matrix

| Credential | Judge Service | Host Agent | Worker | Supervisor | Sandbox |
| --- | --- | --- | --- | --- | --- |
| Product DB | no | no | no | no | no |
| Judge DB | yes | no | no | no | no |
| Redis | yes | template carrier today | yes today | no | no |
| Judge service token | verifier | no | no | no | no |
| Judge node token | verifier | template carrier | yes | no | no |
| Artifact read token | no | template carrier | yes | no | no |
| Supervisor artifact token | no | template carrier | yes | verifier | no |
| MinIO/S3 secret | no | no | no | no | no |
| Docker socket | no | no required | no required | no required | forbidden |

No Product DB credential leak to Worker or Sandbox was found. No Judge DB
credential leak to Supervisor/Sandbox was found. Sandbox receives fixed
allowlisted environment only.

`HIGH` deployment risk: current Runtime Manager gives service-mode Worker the
same unrestricted Redis endpoint used by Product/API and Judge Service. The
Worker does not need direct queue access when using Judge Service. Phase 6B
must remove service-mode Worker Redis dependency or use a Judge-only Redis
identity/instance and ACL.

## Database Isolation

PASS for current code boundary:

- Product runtime/migrations use `DATABASE_URL` only.
- Judge migration/bootstrap use `JUDGE_DATABASE_*` only.
- Judge Service requires `JUDGE_DATABASE_URL` and has no Product fallback.
- Worker/Supervisor/Host Agent contain no PostgreSQL configuration/client path.
- Judge Service does not self-migrate.

Phase 6 design retains `judge-bootstrap` then `migrate-judge` one-shot jobs.
Migration architecture was not changed.

## Network Isolation

PASS for current sandbox design and historical WSL evidence:

- each compile/runtime has a network namespace;
- no veth/interface/route/DNS service is attached;
- historical real tests denied external network and host Supervisor loopback;
- no sandbox credential or network mount exists.

Required Phase 6B requalification covers IPv4, IPv6, DNS, host loopback, Docker
bridge gateway, Product API, Judge Service, PostgreSQL, Redis, MinIO, Internet,
and metadata endpoints.

`MEDIUM`: Supervisor execution and fixed-probe APIs rely on loopback rather than
general request authentication. This is acceptable only while binding loopback.
Any Product API/Worker bridge or `0.0.0.0` exposure without a new authenticated
transport is `HIGH` and rejected.

## Filesystem Isolation

PASS for current design and historical WSL evidence:

- compiler rootfs read-only inside OCI;
- per-job mode-`0700` staging/workspace;
- source/testcase exclusive creation and hash checks;
- runtime rootfs contains copied static program, not source/compiler;
- no host root, repository, `.env`, Windows mounts, secrets, SSH keys, MinIO
  credentials, or Docker socket is mounted;
- artifact path, type, owner, static ELF shape, size, and digest are checked;
- cleanup removes only ownership-proven resources.

`MEDIUM`: compile workspace size uses 10 ms userspace monitoring rather than a
kernel quota/`RLIMIT_FSIZE`. Runtime tmpfs is kernel-size-bounded.

## Process Isolation

PASS for current design and historical evidence:

- private PID namespace;
- cgroup `pids.max` 64 compile / 16 runtime;
- wall timeout and output/workspace cancellation;
- `runc delete --force` plus state/path cleanup verification;
- separate compile and testcase lifecycles;
- startup cleans only stale resources with exact ownership metadata.

`MEDIUM`: explicit `RLIMIT_NOFILE` and `RLIMIT_FSIZE` are absent. Phase 6B must
add/qualify bounded file-descriptor and file-size behavior.

## Resource Limits

| Limit | Compile | Runtime | Authority |
| --- | ---: | ---: | --- |
| CPU quota/period | 100 ms / 100 ms | 100 ms / 100 ms | OCI/cgroup v2 |
| wall | 10,000 ms | 2,000 ms | Supervisor timeout + forced cleanup |
| memory | 512 MiB | 64 MiB | OCI/cgroup `memory.max` |
| PIDs | 64 | 16 | OCI/cgroup `pids.max` |
| stdout/stderr | 65,536 bytes each | 65,536 bytes each | bounded buffer + cancellation |
| workspace | 32 MiB | 1 MiB | userspace monitor / tmpfs |
| artifact | 16 MiB | n/a | integrity validator |
| source | 256 KiB | n/a | protocol validator |
| open files/file size | not explicit | not explicit | gap |

CPU quota controls consumption rate, not total CPU time. Wall timeout is a
separate control. A Node/Go timeout alone is never reported as OS isolation.

`MEDIUM`: JudgeData per-testcase logical time/memory values are not currently
mapped to variable kernel limits; artifact runs use the fixed Supervisor profile.

## Sandbox Preflight

PASS for fail-closed code behavior:

- rejects root Supervisor;
- requires systemd cgroup driver/rootless mode;
- requires `XDG_RUNTIME_DIR`, user D-Bus, running systemd user manager;
- requires cgroup v2 memory/pids delegation;
- requires runc;
- verifies exact rootfs path, identity, version, command template, complete
  manifest, root ownership, and non-writability;
- each real execution reruns preflight;
- missing kernel evidence becomes infrastructure failure, not CE/RE/verdict;
- no host-execution fallback exists.

`MEDIUM`: Worker `/ready` can become stale after startup; Supervisor and Host
Agent lack clean liveness/readiness separation. Phase 6B health design fixes this.

## runc / cgroup / namespace

Current OCI contract:

- `runc --rootless=true --systemd-cgroup`;
- cgroup v2 finite CPU/memory/pids controls and observed evidence;
- PID, mount, network, IPC, UTS, and user namespaces;
- empty capability sets;
- `noNewPrivileges=true`;
- masked/read-only sensitive proc paths;
- seccomp present.

`MEDIUM`: seccomp is default-allow with eight denied syscall families and only
`SCMP_ARCH_X86_64`, not a production-qualified allowlist.

## Compiler Rootfs

Current live read-only evidence:

- Ubuntu 24.04/G++ 13 profile `cpp20-gcc-13-v1`;
- `/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1`;
- root owner, mode `0555`, no writable or non-root-owned path found;
- sidecar identity equals current content-manifest SHA-256:
  `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`;
- containing ext4 filesystem is writable; startup full-tree validation remains
  essential.

COMPILER ROOTFS INTEGRITY = PASS for current asset/configuration plus historical
runtime evidence. Current support is static C++20 only and amd64-specific.

## Host Agent

Host Agent is a fixed-template process owner, not a sandbox. It:

- accepts template/node selection only;
- never accepts executable/args/env from browser request;
- tracks child PID/incarnation/nonce;
- persists mode-`0600` state;
- refuses unsafe PID adoption after restart;
- can remain absent while Judge Service runs in manual/static Worker mode.

Containerizing it would require host process authority. Phase 6B keeps it
host-side/private and gives it no Docker socket.

## Worker

Worker has no Product/Judge DB access. It owns node token, artifact read token,
Supervisor staging token, and currently Redis URL. It verifies assignments,
leases, artifacts, hashes, and Supervisor results.

Current Supervisor URL must be loopback for real execution. Inside a Worker
container `127.0.0.1` no longer identifies host Supervisor. Worker is therefore
`PARTIAL` for containerization until a narrow authenticated transport exists.
Recommended first release keeps Worker host-side.

Worker capability currently advertises `architecture: amd64` unconditionally;
ARM64 support is not qualified.

## Supervisor

Supervisor is Linux-host sandbox boundary. It needs dedicated non-root identity,
systemd user bus/delegation, cgroup v2, runc, rootfs, and private Linux paths.
It does not need database, Redis, MinIO, Product/Judge service, or Docker daemon
credentials.

Ordinary Supervisor containerization would add nested cgroup/namespace complexity
and pressure toward broad privileges. It is not recommended for Phase 6B.

`HIGH`: live WSL user `oj-sandbox` belongs to `docker` group. Code does not use
Docker socket and sandbox cannot see it, but the trusted Supervisor account has
unnecessary root-equivalent daemon capability. No host change was made in 6A.
A no-Docker-group identity is mandatory for 6B production-intent qualification.

## Dockerization Options

| Option | Result |
| --- | --- |
| A: Judge Service + Worker containers, host Supervisor | defer; current loopback and unauthenticated Supervisor transport do not cross container boundary safely |
| B: Judge Service + Worker + Supervisor containers | reject for 6B; nested runc/cgroup/systemd and broad-privilege risk |
| C: Judge Service container, Worker + Supervisor host-side | acceptable; preserves current security boundary |
| D: C plus optional host Host Agent and removal of Worker Redis | recommended |

## Recommended Design

Containerized:

- `judge-bootstrap` one-shot;
- `migrate-judge` one-shot;
- non-root read-only Judge Service;
- Product/Core infrastructure already in Compose.

Native Linux amd64 execution cell:

- optional Host Agent;
- Worker;
- loopback Supervisor;
- rootless runc/cgroup/namespaces;
- compiler rootfs and private execution storage.

Phase 6B should remove direct Redis from service-mode Worker, use host-loopback or
private TLS for Judge Service/artifact API, and keep Supervisor at loopback.

Production should separate Judge hosts from Product API/DB hosts. Development or
small installations may colocate only with dedicated identities, no Docker-group
Supervisor, private ports, capacity isolation, and complete regression evidence.

## Privilege Matrix

| Component | privileged | CAP_SYS_ADMIN/SETUID/SETGID | devices/cgroup host mount | host PID/network | Docker socket |
| --- | --- | --- | --- | --- | --- |
| Judge Service container | no | none | none | no | no |
| future Worker container | no | none | none | no | no |
| Host Agent | host-native | no broad capability | none | owned children only | no |
| Supervisor | host-native non-root | no broad capability | delegated user cgroup only | loopback host process | no |
| runc sandbox | no | empty OCI sets | private `/dev`; per-job cgroup | private PID/network | forbidden |

Any design requiring privileged mode, `CAP_SYS_ADMIN`, host PID/network, writable
host cgroup mount, broad devices, or Docker socket is a `CRITICAL` design smell.

## Docker Socket Decision

DOCKER SOCKET REQUIRED = NO.

Judge Service, Worker, Supervisor, and Sandbox must not mount
`/var/run/docker.sock`. Docker-in-Docker is also rejected. Supervisor directly
manages its restricted rootless runc environment.

## Threat Model

Attacker: untrusted contestant source and executable, including repeated and
concurrent submissions.

Protected: host, Docker daemon, other submissions, credentials, Product/Judge
DB, Redis, MinIO, rootfs/toolchain integrity, Judge lease/result authority,
network, and availability.

Out of scope: unknown kernel/runc/systemd zero-days, malicious host root/physical
access, production HA, SPJ, interactive judging, and unimplemented languages.
Container isolation is not absolute.

## Windows / WSL Qualification Status

Historical evidence: real Ubuntu 24.04 WSL2 amd64 runc/cgroup/namespaces and
C++20 security tests passed in earlier phases.

Phase 6A read-only live evidence:

- Ubuntu 24.04.4 LTS, `x86_64`;
- cgroup v2; cpu/memory/pids controllers;
- `runc 1.4.3`;
- user namespace capacity nonzero;
- rootfs identity/perms present;
- no Judge listeners/processes found;
- current `oj-sandbox` user manager was unreachable and Supervisor inactive;
- `oj-sandbox` has Docker-group membership.

Status: `PARTIAL`. WSL is development evidence, not a production Linux server.
No Phase 6A real execution was run.

## macOS Boundary

`JUDGE MAC REAL EXECUTION = BLOCKED / NOT TARGET`.

macOS may run Core. Docker Desktop VM behavior does not prove current dedicated
Linux identity, systemd delegation, runc, cgroup, rootfs, and cleanup contract.
No workaround using privileged containers or Docker socket is accepted.

## ARM64 Boundary

| Component | Status |
| --- | --- |
| Judge Service | portable source; native image not tested |
| Host Agent | portable source; Linux arm64 process behavior not tested |
| Worker | needs arm64 build and capability fix; currently advertises amd64 |
| Supervisor | unknown/needs build; seccomp hardcodes x86_64 |
| runc | host-specific arm64 build required |
| compiler rootfs/GCC profile | AMD64 ONLY current artifact |
| end-to-end Judge | NOT QUALIFIED |

LINUX ARM64 JUDGE TARGET = NOT QUALIFIED.

## Judge Profile Blueprint

Initial `docker compose --profile judge up -d`:

- Core services;
- `judge-bootstrap`;
- `migrate-judge`;
- Judge Service.

It must not start Supervisor/Host Agent/Worker containers in first safe release.
Real execution additionally requires documented Linux host units and successful
execution preflight. Compose health is not execution readiness.

Future Worker image is allowed only after service-mode Redis removal and secure
Supervisor transport. It gets no DB/S3/Docker credentials or host mounts.

## Security Regression Matrix

Phase 6B matrix is defined for:

- network denied: Internet, DNS, loopback host, bridge gateway, metadata, API,
  PostgreSQL, Redis, MinIO, Judge Service;
- memory, CPU/time, pids, output, workspace/file, and open-file limits;
- filesystem escape and host/repository/secret/Docker-socket denial;
- sibling workspace denial;
- credential absence in environment/files/proc;
- background process, zombie, timeout, and cgroup cleanup;
- rootfs/link/mode/owner/version/hash tamper fail-closed;
- Supervisor crash/restart and exact owned-residue recovery;
- malformed/oversized/stale/conflicting submissions/results;
- concurrent submissions with distinct cgroups/bundles/workspaces;
- transport authentication and off-loopback TLS rules;
- sandbox preflight failures with no unsandboxed fallback;
- durable retry/duplicate/stale Product projection behavior;
- runtime image/socket/capability/namespace inspection.

Dangerous tests must use a disposable Linux host/VM and isolated test data.

## Phase 6B Plan

### 6B-1 Judge Service image

Scope: pinned Node 22.20.0 multi-stage build, production closure, non-root
read-only runtime, Judge-only secrets, health/readiness. Acceptance: isolated
Judge DB/Redis starts and Core credentials/socket/capabilities are absent.
Model: Terra for mechanics; Sol + High for boundary review.

### 6B-2 Worker decision implementation

Scope: host-native Worker first; remove Redis requirement in Judge-Service mode;
versioned host unit and scoped artifact/Judge routes. Acceptance: no DB/MinIO or
Product Redis capability and unchanged lease/durable behavior. Model: Sol + High.

### 6B-3 Supervisor connectivity

Scope: preserve loopback; add fresh readiness semantics; design Unix socket for
any future container Worker. Acceptance: no broad bind, host network/PID,
privilege, or Docker socket. Model: Sol + High.

### 6B-4 Linux sandbox qualification

Scope: disposable native Linux amd64 host, dedicated no-Docker-group user,
rootfs/runc/systemd/cgroup preflight. Acceptance: real kernel evidence and no
production claim beyond tested profile. Model: Sol + High.

### 6B-5 Security regression

Scope: full matrix including new file/FD/transport rows. Acceptance: no skipped
or configuration-only row reported PASS; cleanup and residue audit complete.
Model: Sol + High.

### 6B-6 Compose Judge profile

Scope: one-shot Judge DB jobs + Judge Service/private networks/secrets/docs;
explicit external execution-cell state. Acceptance: Core regression, two clean
control-plane startups, no false execution-ready claim. Model: Terra mechanics,
Sol + High final review.

## Risks

| ID | Severity | Finding / required action |
| --- | --- | --- |
| J6A-01 | HIGH | `oj-sandbox` currently has Docker-group membership. Remove from qualification identity before production-intent tests; never pass socket to sandbox. |
| J6A-02 | HIGH | Shared unrestricted Redis would expose Product Redis capability to Worker in production. Remove direct service-mode Redis or isolate with Judge ACL/instance. |
| J6A-03 | HIGH | Container Worker cannot use current loopback Supervisor. Never solve by unauthenticated `0.0.0.0`, host network, or Docker socket; retain host Worker or implement authenticated Unix/private transport. |
| J6A-04 | MEDIUM | Worker/Supervisor/Host Agent readiness can be stale or conflate liveness. Implement execution readiness. |
| J6A-05 | MEDIUM | seccomp is x86_64 default-allow denylist, not production-qualified allowlist. Derive/qualify from workload. |
| J6A-06 | MEDIUM | no explicit `RLIMIT_NOFILE`/`RLIMIT_FSIZE`; compile workspace uses sampled userspace monitor. Add and test hard bounds. |
| J6A-07 | MEDIUM | per-testcase logical time/memory limits are not mapped to variable kernel controls. Preserve fixed qualified maximums until safely implemented. |
| J6A-08 | MEDIUM | Supervisor general execution API relies on loopback without bearer auth. Keep loopback; authenticate any new transport. |
| J6A-09 | INFO | current toolchain and Worker capability are amd64-only; ARM64 Judge not qualified. |
| J6A-10 | INFO | WSL historical qualification is not native production Linux qualification. |

No `CRITICAL` current sandbox escape, credential leak to Sandbox, unsandboxed
fallback, or Docker-socket mount was found.

## Validation

- `git diff --check`: PASS.
- focused Judge Service/Host Agent/artifact/Product bridge Vitest: PASS, 41 tests.
- Judge Worker `go test ./...`: PASS, 80 tests across 10 packages.
- Judge Worker `go vet ./...`: PASS.
- Supervisor Linux `go vet ./...` in Ubuntu 24.04 WSL2: PASS.
- architecture dependency gate: PASS.
- Supervisor tests on Windows: expected platform-incompatible result, 40 passed,
  5 failed, 42 skipped; trusted-probe uses Linux syscalls and cannot build for
  Windows. This is not Judge target evidence.
- generic Supervisor unit suite in WSL: 2 pre-existing context-sensitive failures
  (`user.slice` expectation and a root-gate test using absent `/trusted/probe`);
  no Supervisor source was changed. Real tests remained skipped and were not used
  as Phase 6A evidence.
- read-only WSL host/rootfs inspection: completed; no runtime started.

No dangerous exploit, real Submission, or runtime qualification test was run.

## Files Changed

- `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`
- `Docs/reports/OJPLATFORM_DOCKER_PHASE6A_JUDGE_ARCHITECTURE_SECURITY_AUDIT_V1_REPORT.md`
- `Docs/PROJECT_STATUS.md`
- `Docs/OJPLATFORM_CURRENT_HANDOFF.md`

Separate prerequisite finalization on `main` changed only
`Docs/PROJECT_STATUS.md`: record commit `93bb4ad`, followed by date correction
`014ce58` without history rewrite. Phase branch was created between those commits
from `93bb4ad`; it contains the same corrected date.
No Core Dockerfile, Compose, migration, Nginx, runtime, sandbox code, rootfs,
cgroup, database, or user data was modified by Phase 6A.

## Commit

Phase branch: `codex/docker-phase6a-judge-architecture-v1`.

Audit closure commit: the commit containing this report; exact SHA is recorded
in the final task response. Main merge was not performed.

## Final Status

```text
DOCKER PHASE 6A JUDGE ARCHITECTURE AUDIT = PASS
CURRENT JUDGE ARCHITECTURE UNDERSTOOD = YES
TRUST BOUNDARIES DEFINED = YES
PRODUCT DB CREDENTIAL LEAK TO WORKER = NO
PRODUCT DB CREDENTIAL LEAK TO SANDBOX = NO
JUDGE DB CREDENTIAL LEAK TO SANDBOX = NO
DOCKER SOCKET REQUIRED = NO
SANDBOX NETWORK ISOLATION = PASS
SANDBOX FILESYSTEM ISOLATION = PASS
SANDBOX PROCESS ISOLATION = PASS
CGROUP RESOURCE ISOLATION = PASS
FAIL-CLOSED PREFLIGHT = PASS
COMPILER ROOTFS INTEGRITY = PASS
JUDGE SERVICE CONTAINERIZABLE = YES
WORKER CONTAINERIZABLE = PARTIAL
HOST AGENT CONTAINERIZABLE = NO
SUPERVISOR CONTAINERIZABLE = PARTIAL
RECOMMENDED JUDGE DEPLOYMENT = Containerized Judge control plane; native Linux amd64 Host Agent/Worker/Supervisor/rootless-runc execution cell; no Docker socket
WINDOWS/WSL JUDGE TARGET = PARTIAL
MAC JUDGE TARGET = BLOCKED / NOT TARGET
LINUX AMD64 JUDGE TARGET = PARTIAL
LINUX ARM64 JUDGE TARGET = NOT QUALIFIED
SECURITY REGRESSION MATRIX DEFINED = YES
SAFE TO START PHASE 6B = YES
PHASE 6B RECOMMENDED MODEL = GPT-5.6 SOL + HIGH
REAL SUBMISSION EXECUTED = NO
REAL USER DB MODIFIED = NO
REAL USER DATA DELETED = NO
MAIN MERGE = NOT PERFORMED
```

The PASS isolation rows are based on current code, configuration, and prior real
WSL qualification cited above. Phase 6A did not rerun dangerous/runtime tests.
Linux amd64 remains `PARTIAL` until Phase 6B native-host qualification and the
listed HIGH/MEDIUM deployment gaps are closed.
