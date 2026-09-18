# Judge Docker Architecture

## Status

This document is the Phase 6A audit and Phase 6B design baseline. It does not
qualify a production sandbox or authorize moving the Supervisor into Docker.
Current code, not an older diagram, is authoritative.

Phase 6A performed source/configuration inspection and read-only host inspection.
It did not start the Runtime Manager, execute a Submission, alter cgroups,
change `/opt/ojplatform/compiler-rootfs`, restart a Judge process, or modify a
database or Docker volume.

Risk terms are `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, and `INFO`.

## Phase 6B-1 Implementation Status

Phase 6B-1 implements and validates the Dockerized Judge control plane on the
Windows/WSL2 `linux/amd64` lane:

- `Dockerfile.judge-service` has separate non-root migration and minimal runtime
  targets, pinned Node 22.20.0 and pnpm 11.19.0, and no runc, compiler rootfs,
  Docker CLI, or submission execution path.
- Compose profile `judge` now orders `judge-bootstrap`, `migrate-judge`, and
  `judge-service` with health/completion gates. Judge Service receives only its
  runtime Judge DB URL, Judge Redis URL, and service/node tokens; it receives no
  Product DB or MinIO credential.
- Product API uses private Compose DNS `http://judge-service:3100`. Host-native
  Worker/Host Agent can use the loopback-only published port. No public Judge
  ingress, host network/PID, privileged mode, capability, device, or Docker
  socket is added.
- Runtime inspection confirmed UID 100, read-only rootfs, `/tmp` tmpfs,
  `no-new-privileges`, zero effective capabilities, fresh migration, safe second
  startup, dependency-aware readiness, and migration failure gating on isolated
  volumes. Core startup without the profile also passed.
- Judge Service `linux/amd64` image build passed. A `linux/arm64` build attempt
  was blocked by the machine-local Docker Hub/BuildKit TLS timeout and is not
  qualified. This does not change full Judge ARM64 status: `NOT QUALIFIED`.

This phase did not execute a Submission or alter the host execution cell. The
`oj-sandbox` Docker-group and shared ACL-less Worker Redis findings remain open
`HIGH` production blockers. Therefore Judge control-plane Docker is implemented,
but the production Judge remains unqualified.

## Phase 6B-2 Integration Status

Phase 6B-2 validated the control-plane boundary on the Windows/WSL2
`linux/amd64` development lane with an isolated Compose project, Judge database,
Redis prefix, node identities, ports, and temporary workspace:

- Product API uses `JUDGE_SERVICE_INTERNAL_URL` to populate its container-only
  `JUDGE_SERVICE_URL=http://judge-service:3100`; host Worker uses a separate
  `JUDGE_SERVICE_URL=http://127.0.0.1:<published-port>` contract.
- Development Redis and Judge Service host bridges are bound to `127.0.0.1`.
  Redis joins `judge-host` only in the development overlay because the current
  service-mode Worker still writes a liveness key. Production Redis ACL and
  credential isolation remain `HIGH` / open.
- Host-native Worker registered, heartbeated, claimed, and resolved an isolated
  trusted `SAFE_FIXTURE_QUALIFICATION` job through Dockerized Judge Service.
  No user Submission, source compilation, runc lifecycle, or sandbox payload ran.
- Worker readiness now requires current Judge control-plane, Redis, and
  Supervisor protocol preflight status. Dependency loss pauses new claims;
  Judge Service, Redis, and Supervisor-protocol loss and recovery were tested.
- Judge Service readiness now reconnects its intentionally non-retrying Redis
  client after a dependency restart instead of remaining permanently not-ready.
- Supervisor stayed loopback-only. Validation used an isolated protocol harness
  on an alternate loopback port, with all execution endpoints disabled, to prove
  Worker preflight and fail-closed scheduling without touching shared Supervisor,
  rootfs, cgroups, or runc.
- Re-registering the same node ID with a new host-owned incarnation replaced the
  current incarnation and fenced the stale Worker. Delivery remains at-least-once;
  durable lease/incarnation checks reject stale result publication.

Judge Service `/ready` still means Judge DB + Redis readiness, not execution
capacity. Worker `/ready` reports its three direct dependencies. Judge node
records still derive scheduling health mainly from authenticated heartbeat and
capabilities; they do not expose a separate durable `executionReady` field. This
is a `MEDIUM` observability gap, not permission to schedule outside Worker-side
fail-closed checks.

The tested same-host development endpoints are:

```text
container: Product API -> http://judge-service:3100
host:      Worker -> http://127.0.0.1:<Judge port>
host:      Worker -> redis://127.0.0.1:<development Redis port>
host:      Worker -> http://127.0.0.1:19092 (production contract)
```

A future remote execution host must use authenticated private TLS endpoints; it
must not reinterpret `127.0.0.1`, use Compose DNS, or use host networking.

## Trust Boundaries

```text
TRUSTED PRODUCT CONTROL PLANE
  Browser -> Web -> Product API -> Product PostgreSQL / Redis / MinIO
                         |  \
                         |   \ fixed trusted-probe administration only
                         |    `---------------------------> Supervisor loopback
                         | Judge protocol; service token; no Product DB credential
                         v
TRUSTED JUDGE CONTROL PLANE
  Judge Service -> Judge PostgreSQL / Judge Redis
        |
        +---- optional Host Agent control API
        |
        | node protocol; node token; immutable assignment
        v
SEMI-TRUSTED EXECUTION ORCHESTRATION
  Host Agent -> Worker -> loopback Supervisor
                 |             |
                 |             +-- dedicated non-root identity
                 |             +-- rootless runc + cgroup v2 + namespaces
                 |             +-- immutable compiler rootfs
                 |
                 +-- read-only artifact token; materializes verified bytes
                               |
                               v
UNTRUSTED
  compile process and contestant program inside separate OCI/runc lifecycles
```

“Trusted” means trusted application code, not an unrestricted host principal.
Worker and Supervisor consume attacker-controlled source, testcase bytes, and
output, so they remain high-risk even though they are not contestant code.
Container isolation and runc are defense layers, not protection against a
kernel zero-day.

### Component access contract

| Component | Trust | May access | Must not access | Credentials | Writable storage | Elevated need |
| --- | --- | --- | --- | --- | --- | --- |
| Product API | trusted | Product DB, Product Redis, MinIO, Judge Service, artifact endpoint; current loopback fixed-probe administration | Judge DB, arbitrary runc command/source execution | Product DB/S3, Judge service token, artifact read token verifier | Product-owned storage | none |
| Judge Service | trusted | Judge DB, Judge Redis, Worker node API, optional Host Agent | Product DB, compiler rootfs, runc, sandbox workspace | Judge DB, Judge Redis, service token, node-token verifier, optional Host Agent token | Judge DB/Redis only | none |
| Host Agent | semi-trusted host control | fixed templates, owned Worker child processes, local state | arbitrary commands from UI, Product/Judge DB, runc | Host Agent token and Worker template secrets | mode `0600` ownership state | host process control for owned Workers only |
| Worker | semi-trusted orchestrator | Judge Service, currently Redis, Product artifact read API, Supervisor | Product/Judge PostgreSQL, MinIO secret, Docker daemon | node token, currently Redis URL, artifact read token, Supervisor artifact token | private temporary artifact files | none |
| Supervisor | high-risk trusted boundary | runc, delegated cgroup v2, compiler rootfs, private staging | DB, Redis, MinIO, Product API, Docker daemon | Supervisor artifact-staging token only | private execution records/staging/workspaces | non-root user namespace and delegated cgroups; no broad capability |
| Compile sandbox | untrusted | read-only compiler rootfs, one private read/write compile workspace | host root, repository, credentials, network, sibling workspace | none | current-job workspace only | none inside host namespace |
| Runtime sandbox | untrusted | copied static executable, stdin, private tmpfs | compiler, source, host files, credentials, network, sibling workspace | none | private tmpfs only | none inside host namespace |

## Current Architecture

### Current call chain

Submission execution uses only the chain below. Separately, the Product API
sandbox-operations module can call Supervisor loopback for a frozen catalog of
trusted qualification probes; it cannot pass contestant source, command, mount,
environment, network, or executable. This administrative side path is not the
Submission path and should not be exposed through a Docker bridge in Phase 6B.

```text
Submission HTTP
  -> Product API persists Submission and durable dispatch row in Product DB
  -> Product API creates immutable JudgeData artifact metadata and calls
     Judge Service POST /v1/jobs with x-judge-service-token
  -> Judge Service persists control state in Judge DB and queue/lease state in Redis
  -> Worker registers, heartbeats, and claims through authenticated node endpoints
  -> Judge Service binds assignment + job + lease token to node incarnation
  -> Worker fetches artifact objects from Product API with read-only artifact token
  -> Worker verifies size/hash and stages testcase input into Supervisor
  -> Worker sends source + immutable execution-set identity to loopback Supervisor
  -> Supervisor preflights host/rootfs and compiles with rootless runc
  -> Supervisor validates static ELF artifact and runs each testcase in a new runc lifecycle
  -> Worker derives deterministic verdict and completes assignment with lease token
  -> Judge Service persists durable result and emits best-effort Redis progress event
  -> Product API reads the durable Judge result and idempotently projects an evaluation
     into Product DB; Redis/SSE remains notification transport, not result authority
```

Relevant implementation:

- `apps/api/src/modules/submission/dispatch.ts`
- `apps/api/src/modules/submission/judge-service-client.ts`
- `apps/api/src/modules/problem-judge-data/artifact.ts`
- `apps/judge-service/src/server.ts` and `app.ts`
- `apps/judge-worker/internal/worker/worker.go`
- `apps/judge-worker/internal/nodeclient/client.go`
- `apps/judge-worker/internal/supervisorclient/`
- `apps/sandbox-supervisor/cmd/supervisor/main.go`
- `apps/sandbox-supervisor/internal/supervisor/`

### Durable evaluation contract

Containerization must preserve:

1. Product dispatch claim/lease and stable client request ID.
2. Judge Service idempotent intake and Judge DB state.
3. assignment identity, node incarnation, attempt generation, and queue lease token;
4. immutable Problem revision, testdata version, artifact/manifest hashes, source hash,
   and execution-set identity;
5. stale/conflicting completion rejection;
6. durable Product projection keyed by Submission, Judge job, evaluation generation,
   attempt generation, and result digest;
7. Redis events as best-effort wakeups only.

No container may replace these durable authorities with in-memory state.

## Credential Boundaries

### Current matrix

| Secret/capability | Product API | Judge Service | Host Agent | Worker | Supervisor | Sandbox |
| --- | --- | --- | --- | --- | --- | --- |
| Product DB URL | yes | no | no | no | no | no |
| Judge DB URL | no | yes | no | no | no | no |
| Redis URL | Product Redis | Judge coordination | via trusted Worker template today | yes today | no | no |
| Judge service token | yes | verifier | no | no | no | no |
| Judge node token | no | verifier | template carrier | yes | no | no |
| Host Agent token | no | optional client | verifier | no | no | no |
| Artifact read token | verifier | no | template carrier | yes | no | no |
| Supervisor artifact token | no | no | template carrier | yes | verifier | no |
| MinIO/S3 secret | yes | no | no | no | no | no |
| Docker socket | no | no | no required | no required | no required | forbidden |

Current source contains no Product/Judge database configuration in Worker,
Host Agent, or Supervisor. Sandbox environments are fixed allowlists and contain
no inherited database, Redis, S3, Judge, or Docker variables.

### Required Phase 6B secret handling

- Inject at runtime through a secret manager or Compose secret file; never bake
  secrets into an image, build argument, label, command line, or committed file.
- Add `_FILE`/file-provider support where Compose secret mounts are used.
- Redact URLs containing userinfo. Never log request headers, tokens, source, or
  environment dumps.
- Use different Product service, Judge node, Host Agent, artifact-read, and
  Supervisor-artifact tokens.
- Production off-loopback token transport requires TLS; mTLS/workload identity is
  recommended.
- Give Worker a Judge-only Redis ACL if direct Redis remains. Preferred 6B design
  removes direct Redis use from service-mode Worker.

### Redis identity / ACL boundary

Phase 6B-3 uses Redis 7.4.1 ACLs on the shared Compose Redis instance. Logical DB
0 is an operational choice, not a security boundary. The default user is disabled.
A one-shot, idempotent bootstrap writes password hashes to the persistent ACL
volume, preserves unknown maintenance users, and starts Redis only after success.
Runtime users receive no `ACL`, `CONFIG`, `MODULE`, `DEBUG`, persistence,
shutdown, database-flush, or other administrative permission.

| Identity | Key scope | Command / channel scope |
| --- | --- | --- |
| Product API | Product rate-limit keys and legacy `oj:judge:*` Product-owned queue keys | exact read/write/list/rate-limit/Lua commands; publish/subscribe only on evaluation and Judge-progress channels |
| Judge Service | `${JUDGE_REDIS_PREFIX}:*` | exact queue/lock/list commands plus `PING`; publish only on `oj:judge-progress-events:v1` |
| Worker | `${JUDGE_REDIS_PREFIX}:workers:*` | `PING` and expiring `SET` only; no read, queue, lease, Pub/Sub, or administration |
| Redis health | no keys or channels | `PING` only |
| Redis admin | all | bootstrap and controlled maintenance only; never injected into API, Judge Service, or Worker |

All Workers currently share one role-level Worker identity. This limits a leaked
Worker credential to heartbeat writes but does not provide per-node attribution.
Passwords are runtime environment inputs and must be distinct, strong, and
URI-safe because Compose forms authenticated Redis URLs. Committed values are
explicit development-only defaults; the production overlay requires external
values. Rotation is environment update plus affected service restart. Immediate
revocation also requires `ACL SETUSER <user> off` and administrative
`CLIENT KILL USER <user>` so already-authenticated connections are closed.

Development publishes Redis on host loopback for the native Worker. Its
`judge-host` attachment remains required because Docker does not realize the host
publication from an internal-only network. Production publishes no Redis port;
a production execution host needs a separately approved private/loopback Redis
endpoint using the Worker URL and credential, never public ingress. Redis ACLs
are the enforcement boundary; application prefixes alone are not.

## Product/Judge Isolation

- Product migrations read only `DATABASE_URL`.
- Judge migrations read only `JUDGE_DATABASE_URL` and reject use of the named
  runtime role as migration owner.
- `judge-bootstrap` creates the Judge database/least-privilege role;
  `migrate-judge` applies the fixed Judge manifest; Judge Service never migrates.
- Judge Service config requires `JUDGE_DATABASE_URL`; no fallback to
  `DATABASE_URL` exists.
- Worker, Host Agent, Supervisor, and Sandbox have no PostgreSQL client path.

Phase 6B must retain one-shot `judge-bootstrap` then `migrate-judge`, followed by
Judge Service. It must not add self-migration to Judge Service.

## runc Sandbox

The current real-execution backend is direct rootless `runc`, not Docker and not
`child_process`/`os/exec` execution of contestant code on the host.

- Supervisor must run as a dedicated non-root user.
- `runc --rootless=true --systemd-cgroup` is fixed by server code.
- Every compile and runtime has a distinct bundle, sandbox ID, cgroup, deadline,
  output buffers, and cleanup check.
- Missing runc, root identity, user manager, cgroup delegation, compiler rootfs,
  or qualified kernel evidence fails as infrastructure failure.
- No host compiler or unsandboxed execution fallback exists.

The Supervisor HTTP server binds only loopback. Its general execution endpoints
have no bearer authentication because loopback is part of the current boundary;
the artifact-staging endpoints additionally require a token. Widening this
listener to `0.0.0.0` would be a `HIGH` security regression and is forbidden.

## cgroup

Current preflight requires:

- cgroup v2 (`/sys/fs/cgroup/cgroup.controllers`);
- running per-user systemd manager and D-Bus user bus;
- manager under `user.slice/user-<uid>.slice/user@<uid>.service`;
- delegated `memory` and `pids` controllers in manager and subtree;
- `runc --systemd-cgroup`;
- finite OCI CPU quota, memory limit, and pids limit;
- observed cgroup path plus `cpu.max`, `memory.max`, and `pids.max` evidence.

A Node/Go wall timer is not treated as cgroup proof. CPU quota is a rate limit
(currently one CPU: quota 100000 microseconds per 100000-microsecond period), not
a total CPU-time counter. Wall timeout separately bounds elapsed execution.

## Namespace

Every current compile/runtime OCI configuration creates:

- PID namespace;
- mount namespace;
- network namespace;
- IPC namespace;
- UTS namespace;
- user namespace with one guest-root-to-dedicated-host-user mapping.

Capabilities are empty and `noNewPrivileges` is true. Host PID, host network,
and host IPC are not used.

## Network Isolation

Current design is default-deny by construction:

- a fresh network namespace is created;
- no veth, bridge attachment, external interface, route, or DNS path is added;
- contestant code receives no network credential;
- historical WSL qualification denied external network and host Supervisor
  loopback access.

Therefore sandbox code must not reach Product API, Judge Service, PostgreSQL,
Redis, MinIO, host network, metadata endpoints, or Internet. Merely omitting a
Docker `networks` stanza is not equivalent; the runc network namespace is the
control.

Phase 6B must verify interface/route/DNS state and deny IPv4, IPv6, loopback-host,
service DNS, bridge gateway, and metadata endpoint access. No test may temporarily
attach the sandbox namespace to a Docker bridge.

## Filesystem Isolation

### Compile

- OCI root is the verified compiler rootfs and is read-only.
- `/dev`, `/proc`, and `/tmp` are private tmpfs/proc mounts with `nosuid`,
  `nodev`, and mostly `noexec`.
- one per-attempt workspace is bind-mounted read/write with `nosuid,nodev,noexec`;
- source and testcase bytes are exclusively created, hash-verified, and bound to
  ownership metadata;
- artifact must be a regular non-symlink static ELF, within the exact build root,
  size-bounded, owner-checked, and hash-checked before and after handoff.

### Runtime

- a minimal private rootfs contains only the copied approved static executable
  and mount points;
- source and compiler are absent;
- `/workspace` and `/tmp` are private tmpfs;
- host root, repository, `.env`, `/mnt/c`, `/mnt/d`, SSH keys, credentials,
  `/run/secrets`, and `/var/run/docker.sock` are not mounted.

Sibling job roots are mode `0700`; the shared sandbox root is traversal-only
`0711`. More importantly, no sibling host directory is mounted into a guest.

`MEDIUM`: compile workspace size is enforced by a 10 ms userspace directory
monitor, not a kernel filesystem quota or `RLIMIT_FSIZE`; overshoot is possible.
Runtime tmpfs is kernel-size-bounded. Phase 6B must decide and qualify a hard
workspace/file-size strategy.

## Process Isolation

- PID namespace makes the guest process PID 1 and hides host PIDs.
- cgroup `pids.max` limits fork/clone fanout.
- wall timeout and output/workspace limit cancellation terminate the runc run.
- cleanup invokes `runc delete --force`, verifies `runc state` is gone, removes
  only ownership-proven paths, and marks any failed cleanup as infrastructure
  failure.
- Supervisor startup audits and removes only stale resources carrying matching
  ownership metadata; foreign/unknown paths are preserved.
- compile and every testcase runtime use separate lifecycles, preventing a
  background process from becoming the next testcase process.

`MEDIUM`: OCI `RLIMIT_NOFILE` and `RLIMIT_FSIZE` are not configured. Memory,
pids, tmpfs/workspace, output, and wall controls reduce impact but do not replace
explicit descriptor/file limits.

## Resource Limits

| Resource | Compile | Runtime | Enforcement |
| --- | ---: | ---: | --- |
| CPU rate | 100 ms / 100 ms period | 100 ms / 100 ms period | OCI/cgroup v2 `cpu.max` |
| Wall time | 10,000 ms | 2,000 ms | Go context timeout, then forced runc cleanup |
| Memory | 512 MiB | 64 MiB | OCI + cgroup v2 `memory.max` |
| PIDs | 64 | 16 | OCI + cgroup v2 `pids.max` |
| stdout | 65,536 bytes | 65,536 bytes | bounded Supervisor buffer; cancellation on limit |
| stderr | 65,536 bytes | 65,536 bytes | bounded Supervisor buffer; cancellation on limit |
| workspace | 32 MiB | 1 MiB | compile userspace monitor; runtime tmpfs |
| artifact | 16 MiB | n/a | Supervisor file validation |
| testcase input | 100 MiB each | 100 MiB each | contract + bounded transfer |
| source | 256 KiB | n/a | contract + hash validation |
| open files | not explicit | not explicit | inherited host limit; Phase 6B gap |
| file size | not explicit | tmpfs/workspace bounds only | Phase 6B gap |

JudgeData contains per-testcase logical time/memory values, but the current
artifact execution path enforces the fixed Supervisor profile above. `MEDIUM`:
per-testcase logical limits are not yet mapped to kernel limits. Docker resource
limits on Worker/Supervisor cannot substitute for per-sandbox limits.

## Syscall and Privilege Policy

Current OCI policy:

- empty bounding/effective/inheritable/permitted/ambient capabilities;
- `noNewPrivileges=true`;
- user namespace and non-root host mapping;
- seccomp exists with default allow and explicit denial of `mount`, `umount2`,
  `pivot_root`, `setns`, `unshare`, `ptrace`, `bpf`, and `perf_event_open`;
- masked/read-only sensitive `/proc` paths;
- no host devices or Docker socket mounted.

`MEDIUM`: current seccomp is a narrow denylist, not a production-qualified
allowlist, and names only `SCMP_ARCH_X86_64`. `clone` remains available subject
to namespaces and `pids.max`. Phase 6B must derive policy from observed compiler
and static-runtime workloads; it must not paste an Internet profile blindly.

## Compiler Rootfs

Current profile:

- ID: `cpp20-gcc-13-v1`;
- Ubuntu 24.04 pinned OCI base digest;
- GCC/G++ 13.3.0 (`13.3.0-6ubuntu2~24.04.1`);
- host path: `/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1`;
- expected identity:
  `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`;
- root-owned and no writable non-symlink path;
- complete file/link/type/mode/owner manifest revalidated before real execution;
- fixed compiler argv; no user flags, shell, package download, or host compiler.

Live Phase 6A read-only inspection found the identity sidecar and manifest digest
matching, root ownership, and no writable path. The containing ext4 mount is
writable, so file ownership/mode plus full startup verification—not mount
read-only state—protect integrity.

Current compiler/runtime is amd64-specific. Only static C++20 is implemented.
Python, Java, dynamic binaries, SPJ, and interactive execution are not current
qualified toolchains.

## Worker

Worker is Go 1.22 source. It:

- registers frozen capabilities and node incarnation;
- preflights Supervisor before becoming ready;
- claims authenticated assignments from Judge Service in service mode;
- validates assignment/job/lease identity;
- fetches only hash-addressed artifact objects through a read-only Product API;
- sends source/testcase bytes, never arbitrary host paths or commands;
- derives verdict and completes through lease-bound node endpoints.

Current Worker assumes Supervisor loopback. `127.0.0.1` inside a Worker container
is the Worker container, not the Linux host. Therefore Worker is not safely
containerizable without a new narrow transport boundary.

Phase 6B recommendation: keep Worker host-native with Supervisor for the first
qualified Docker release. Separately change service-mode Worker so it does not
require Redis. Containerized Worker remains a later option after transport,
authentication, readiness, and network regression qualification.

## Supervisor

Supervisor is the sandbox security boundary and should remain a native Linux
host service in Phase 6B. It needs direct access to:

- rootless `runc`;
- dedicated user/systemd user manager and D-Bus socket;
- delegated cgroup v2 hierarchy;
- immutable compiler rootfs;
- private ext4 staging/workspace and execution-record paths.

Putting it in an ordinary Docker container adds nested namespaces/cgroups and
tempts use of `--privileged`, `CAP_SYS_ADMIN`, host cgroup mounts, host PID, or
Docker socket. None is approved. A future dedicated Supervisor image requires a
separate security ADR and Linux qualification; Docker Desktop is not a target.

## Host Agent

Host Agent owns fixed Worker templates and local child lifecycle. UI/API input
selects only trusted template and node ID; executable/args/env remain local
configuration. It persists mode-`0600` state and refuses to adopt a live PID
after restart without a child handle and independently proven identity.

Because it starts/stops host processes, containerizing it would require a host
process manager API, host PID namespace, or equivalent broad control. Phase 6B
keeps it host-native and loopback/private. It must never receive a Docker socket.
Judge Service can run without Host Agent; manual/static Worker mode is the safe
first Compose boundary.

## Containerization Options

| Option | Description | Security | Operations/portability | Decision |
| --- | --- | --- | --- | --- |
| A | Judge Service + Worker containers; Supervisor host service | breaks current loopback assumption; bridge exposure needs auth | easier image distribution, harder host transport and artifact routing | defer |
| B | Judge Service + Worker + Supervisor containers | nested cgroup/systemd/runc pressure; likely broad privileges | poor Docker Desktop behavior; hard to debug/qualify | reject for 6B |
| C | Judge Service container; Worker + Supervisor native Linux execution cell | preserves qualified loopback/runc/cgroup boundary | clear split; host prerequisites remain | acceptable |
| D | C plus host-native Host Agent optional; remove service-mode Worker Redis; Compose owns only Judge control plane | least credential/privilege change and preserves elastic control option | best first open-source/production path; requires documented host bootstrap | recommended |

Docker-in-Docker and `/var/run/docker.sock` are not accepted solutions.
Controlling Docker is root-equivalent on typical hosts and far broader than
calling rootless runc in the dedicated execution environment.

## Recommended Architecture

```text
Docker Compose internal networks
  Product API ---- Judge Service ---- Judge DB / Judge Redis
       ^                 |
       | HTTPS/private   | HTTPS or host-loopback published port
       | artifact read   v
       +----------- Linux Judge host execution cell ----------------+
                   Host Agent (optional, host-native)                |
                       -> Worker (host-native, no Product/Judge DB)   |
                           -> 127.0.0.1 Supervisor                    |
                               -> rootless runc sandboxes             |
                   no Docker socket; no broad Linux capabilities -----+
```

Initial Phase 6B may colocate the execution cell and Compose daemon on one Linux
amd64 machine only if:

- the dedicated Supervisor account is not in `docker`, `sudo`, `root`, `disk`,
  or other privileged groups;
- only narrow loopback/private service ports are published;
- Product/Judge DB credentials never enter Worker/Supervisor environments;
- Docker storage, repository, and secrets are not mounted into sandbox paths;
- host resource capacity accounts for Core and Judge contention;
- security regression passes after every boundary change.

Production recommendation is separate Judge execution hosts from Web/API/DB.
Colocation is a development/small-install option, not preferred production
isolation.

### Current host privilege finding

`HIGH`: Phase 6A live WSL inspection found `oj-sandbox` in group `docker`. This
grants the trusted Supervisor account broad Docker-daemon capability on that
host even though code does not use the socket and sandboxes do not mount it.
It contradicts least privilege and blocks production qualification. Phase 6A
does not alter the host. Phase 6B qualification must use a dedicated execution
identity with no Docker-group membership and prove the Supervisor still works.

## Linux Requirements

### Required

- native Linux kernel with namespaces and cgroup v2;
- `linux/amd64` for current qualified toolchain;
- rootless-capable runc compatible with current OCI config;
- dedicated non-root Supervisor identity with no broad groups;
- user namespace support and the current one-entry UID/GID map;
- systemd user manager, user bus, linger where needed, and delegated memory/pids
  controllers (`Delegate=yes`);
- writable local Linux filesystem supporting ownership, modes, symlink checks,
  exclusive create, atomic rename, and private directories;
- immutable root-owned compiler rootfs at the exact profile path;
- enough CPU/RAM/disk for compile/runtime limits plus concurrency;
- private TLS/loopback connectivity to Judge Service and Product artifact API.

### Recommended

- dedicated physical/VM Judge host separate from Product DB/API;
- dedicated Judge Redis ACL/instance;
- ext4/xfs local workspace, not Windows/SMB/NFS shared storage;
- firewall default deny for Judge host except required control/artifact paths;
- resource and residue monitoring; synchronized clock; audited patch process;
- signed/versioned Worker, Supervisor, and rootfs artifacts.

### Optional

- Host Agent/autoscaling for multiple local Worker processes;
- hardware virtualization/VM layer for stronger tenant isolation;
- future mTLS/workload identity.

## Windows/WSL Status

Historical real evidence exists for Ubuntu 24.04 WSL2 on `linux/amd64`:
rootless runc, namespaces, cgroup v2 memory/pids, network/filesystem/process
attacks, cleanup, and GCC 13 rootfs were qualified in earlier phases.

Phase 6A live read-only evidence:

- Ubuntu 24.04.4 LTS, `x86_64`;
- cgroup v2 with cpu/memory/pids controllers;
- `runc 1.4.3`;
- nonzero user namespace capacity;
- rootfs identity/manifest match and no writable/non-root-owned path;
- current Supervisor/Worker/Judge services were not running;
- current `oj-sandbox` user bus could not be contacted;
- `oj-sandbox` currently belongs to `docker` group.

Thus WSL is `PARTIAL`: historically qualified development evidence, not current
Phase 6 runtime qualification and not equivalent to a production Linux server.
Windows native execution is not a sandbox target; Windows may run Core and host
the qualified WSL development environment.

## macOS Boundary

`JUDGE MAC REAL EXECUTION = BLOCKED / NOT A CURRENT TARGET`.

macOS Docker Desktop runs a Linux VM but does not satisfy or prove the current
host user/systemd delegation, exact runc, rootfs, cgroup, and cleanup boundary.
Do not weaken isolation or use privileged Docker-in-Docker to make it run.
macOS remains supported for Web/API/Core development only until a separate real
Linux Judge host is connected.

## ARM64 Boundary

| Component | Classification | Reason |
| --- | --- | --- |
| Judge Service Node code | `PORTABLE / NEEDS BUILD` | Node code is architecture-neutral; native `linux/arm64` image/dependency closure untested |
| Host Agent Node code | `PORTABLE / NEEDS BUILD` | process semantics need Linux arm64 runtime tests |
| Worker Go source | `NEEDS BUILD` | Go can target arm64, but registration hardcodes `architecture: amd64` |
| Supervisor Go source | `NEEDS BUILD / UNKNOWN` | seccomp hardcodes `SCMP_ARCH_X86_64`; runc/cgroup behavior unqualified |
| runc/host | `NEEDS BUILD` | arm64 runc/kernel availability is host-specific |
| compiler rootfs/profile | `AMD64 ONLY` | current exported rootfs/identity and GCC profile were built/qualified on amd64 |
| end-to-end Judge | `NOT QUALIFIED` | no native arm64 build or security regression evidence |

Do not publish an arm64 Judge image or capability until a distinct arm64
rootfs identity, seccomp architecture, Worker capability, and full real-host
matrix pass.

## Compose Judge Profile

Future `docker compose --profile judge up -d` should add only the Judge control
plane in the first safe release:

1. existing Core: `web`, `api`, `postgres`, `redis`, `minio`, `migrate-product`;
2. one-shot `judge-bootstrap`;
3. one-shot `migrate-judge`;
4. long-lived `judge-service`;
5. no Supervisor container;
6. no Host Agent container;
7. no Worker container until its Supervisor transport is qualified.

The command must report that real execution additionally requires the documented
Linux execution-cell units and successful host preflight. Compose success alone
must not claim Judge execution readiness.

A later optional Worker container may join restricted `judge-control` and
`artifact-read` networks only. It must not join the database network, receive
DB/S3 secrets, mount host paths, use host network/PID, or access Docker socket.

## Judge Service Container Blueprint

`Dockerfile.judge-service` design:

- multi-stage build from pinned Node `22.20.0` image and pnpm `11.19.0`;
- build a Judge-Service-only production dependency closure/bundle;
- runtime image contains no repository, compiler, runc, rootfs, Product migration,
  or development toolchain;
- dedicated non-root UID/GID, read-only root filesystem, `/tmp` tmpfs;
- no Linux capabilities, `no-new-privileges`, no devices, no host namespaces;
- receives only Judge DB runtime URL, Judge Redis URL/ACL, service/node tokens,
  optional Host Agent endpoint/token, and normal tuning;
- listens `0.0.0.0` inside Compose but is reachable only on private network and,
  when needed by host Worker, a host-loopback-bound published port;
- `/health` means process alive; `/ready` means Judge DB and Judge Redis ready;
- separate execution-capacity status reports whether a qualified node exists;
- never receives Product DB URL, migration owner credential, S3 secret, or Docker
  socket.

## Worker Container Blueprint

Deferred image design:

- Go 1.22 multi-stage build with reproducible, versioned binary;
- runtime non-root/distroless-style image with CA certificates and writable
  private `/tmp` tmpfs only;
- no shell/package manager where operationally practical;
- no Product/Judge DB or MinIO credential;
- node token and scoped artifact-read token through secret files;
- no Redis credential in service mode;
- restricted egress only to Judge Service, artifact API, and authenticated
  Supervisor transport;
- `/health` for process; `/ready` rechecks Judge Service and Supervisor execution
  capability, not only startup state;
- architecture capability derived from build/runtime, never hardcoded incorrectly;
- no Docker socket, privileged mode, capabilities, devices, host PID, or host
  network.

## Supervisor Connectivity

Current safe execution contract is Worker and Supervisor on the same Linux host
over `127.0.0.1:19092`. Product API also uses that loopback endpoint only for
fixed trusted-probe administration in the host Runtime Manager topology. A
containerized Product API must report that optional qualification control as
unavailable unless a separately authenticated private transport is designed;
Docker host-gateway access is not added merely to preserve this operator UI.

Options for a future container Worker:

| Transport | Assessment |
| --- | --- |
| `host-gateway` TCP | easy, but breaks current loopback-only server and requires narrow bind/firewall + strong authentication/TLS |
| Unix socket shared into Worker | preferred future option; filesystem permissions are narrow, but Supervisor server/client require implementation and peer/ownership tests |
| dedicated private bridge | possible only with authenticated protocol and no exposure to Core/ingress networks; Supervisor container issue remains |
| host network | rejected; excessive visibility and poor portability |
| bind `0.0.0.0` without auth | rejected, `HIGH` regression |
| keep Worker host-side | recommended for Phase 6B; preserves qualified loopback boundary |

## Health Model

| Component | Liveness | Dependency readiness | Execution readiness |
| --- | --- | --- | --- |
| Judge Service | event loop/HTTP alive | Judge DB + Judge Redis | at least one current qualified node; separate status |
| Worker | process/health server alive | Judge Service registration/heartbeat and artifact API reachable | fresh Supervisor preflight, rootfs/runc/cgroup capability true |
| Supervisor | HTTP process alive | record/staging roots usable | non-root, user bus/systemd, runc, cgroup delegation, rootfs integrity, cleanup preflight |
| Host Agent | HTTP process alive | state readable and no unresolved ownership error | enabled template executable/hash valid and host capacity available |

Current gaps:

- Worker preflights Supervisor only at startup; `/ready` can become stale.
- Supervisor combines capability in `/v1/health` and lacks a distinct `/ready`.
- Host Agent `/health` does not prove persisted state/template readiness.

These are `MEDIUM` operational risks. Actual execution still reruns Supervisor
preflight and fails closed; health semantics must be fixed before orchestration
uses them for scheduling.

## Fail-Closed Rules

Real execution must be rejected or returned as verdict-free infrastructure
failure when any of these is missing or mismatched:

- real-execution feature gate;
- dedicated non-root identity;
- user namespace or required PID/mount/network/IPC/UTS namespace;
- runc or expected runc mode;
- systemd user manager/user bus/cgroup v2 delegation;
- finite CPU/memory/pids limits or observable kernel evidence;
- exact compiler rootfs path, identity, full manifest, ownership, mode, compiler
  version, or command-template hash;
- safe private workspace/staging ownership and canonical paths;
- source/testcase/artifact hash or immutable identity;
- cleanup verification;
- authenticated control/artifact transport.

Forbidden fallback: host compiler, `node:child_process`, Go `os/exec` of user
binary outside runc, Docker socket execution, relaxed namespace, inherited host
network, or unbounded execution.

## Threat Model

### Attacker

Contestant controls source text and can influence compiler workload, runtime
syscalls, process behavior, memory/CPU/output use, and judged stdout/stderr.
Contestant may submit repeatedly and concurrently and may know public topology.

### Protect

- Linux host/kernel control plane and Docker daemon;
- Product and Judge credentials/databases;
- Redis and MinIO/object storage;
- other submissions and their source/testdata/output;
- compiler rootfs and trusted binaries;
- Judge assignment, lease, verdict, and durable publication integrity;
- service availability and cleanup.

### Out of scope

- unknown kernel/runc/systemd zero-days;
- malicious trusted operators/host root;
- physical host compromise;
- production multi-region HA, SPJ, interactive judging, and unimplemented
  language toolchains.

## Docker Privilege Matrix

| Container | privileged | capabilities | devices | cgroup mount | host PID | host network | Docker socket |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Judge Service | no | none | none | no | no | no | no |
| Worker (future) | no | none | none | no | no | no | no |
| Host Agent | not containerized | n/a | n/a | n/a | n/a | n/a | no |
| Supervisor | not containerized in 6B | n/a | n/a | host-native delegated user cgroup | n/a | loopback only | no |
| Sandbox OCI | no broad host privilege | empty capability sets | private tmpfs `/dev` only | per-job delegated cgroup | private PID | private network | forbidden |

Any proposal requiring `--privileged`, `CAP_SYS_ADMIN`, host PID/network, broad
host devices, writable host cgroup mount, or Docker socket is a `CRITICAL`
design smell and requires an ADR/security review rather than normal Phase 6B
implementation.

## Secrets and Logging

Required structured fields: request ID, submission ID, evaluation generation,
Judge job ID, assignment ID, node ID/incarnation, artifact ID, sandbox outcome,
raw limit facts, resource usage/evidence, cleanup result, and verdict.

Never log source bytes, expected output, testcase secret data, lease token,
service/node/artifact tokens, environment dumps, database URLs with userinfo,
S3 secrets, or raw authorization headers. Log error class and safe diagnostic,
not secret-bearing dependency strings.

## Artifact Flow

```text
MinIO/S3
  -> Product API verifies Product authorization and immutable JudgeData metadata
  -> token-protected read-only artifact endpoint streams exact object
  -> Worker disables redirects, bounds size, verifies headers/length/SHA-256,
     writes a private temporary file, and sets it read-only
  -> authenticated loopback Supervisor staging copies/verifies stdin into
     Supervisor-owned private storage
  -> Sandbox receives only testcase stdin; it never receives MinIO/API secrets
  -> Worker fetches expected output and derives verdict outside Sandbox
  -> all temporary material is released/removed
```

Sandbox must never access MinIO directly. Worker materialization minimizes the
sandbox view and keeps storage credentials in Product API only.

## Open-Source Deployment Model

- `docker compose up -d`: Core on Windows, macOS, or Linux.
- `docker compose --profile judge up -d`: Judge control plane only in initial
  Phase 6B.
- real Judge execution: additional Linux amd64 host setup, dedicated user,
  rootfs installation/verification, systemd delegation, Supervisor/Worker units,
  and security preflight.
- Windows/macOS one-command real Judge execution is not promised.

## Security Regression Plan

Phase 6B must use isolated fixtures and a goal-owned environment. Do not use
real user Submissions, databases, runtime processes, containers, or volumes.

| Area | Required evidence |
| --- | --- |
| network denied | IPv4/IPv6 Internet, DNS, loopback host, bridge gateway, API, PostgreSQL, Redis, MinIO, Judge Service, metadata endpoints denied |
| memory | configured `memory.max`, pressure/OOM event, cleanup |
| CPU/time | finite `cpu.max`, wall timeout, no surviving process |
| pids | fork fanout reaches `pids.max`, no host/sibling impact |
| filesystem | host root/repo/`.env`/secrets/Docker socket/SSH keys/compiler-host paths denied; rootfs read-only |
| sibling isolation | concurrent job cannot read/write sibling workspace/input/output |
| credentials | sandbox env/files/proc contain no Product/Judge/Redis/S3/Judge tokens |
| background cleanup | daemon/fork/zombie attempts gone before next testcase |
| output | stdout and stderr limits cancel and retain bounded evidence |
| file/FD | file size/workspace and open-file exhaustion are kernel/qualified bounded |
| timeout cleanup | cgroup, runc state, mount, bundle, workspace, and process absent |
| crash recovery | Supervisor restart classifies owned residue, preserves foreign paths, fails closed on ambiguity |
| malformed input | oversized/malformed/unknown fields, paths, hashes, identities, and stale leases rejected pre-execution |
| concurrency | distinct cgroups/bundles/workspaces; independent limits and cleanup |
| rootfs | changed file/link/mode/owner/version/identity/path prevents readiness |
| preflight | missing runc, cgroup, namespace, user bus, rootfs, writable workspace, or cleanup capability prevents scheduling/execution |
| transport | non-loopback plaintext/token exposure and unauthenticated Supervisor requests rejected |
| Docker boundary | no socket/capability/host namespace in image and runtime inspection |
| durable result | retry/duplicate/stale result cannot corrupt current Product evaluation |

Dangerous exploit tests require a dedicated disposable Linux host/VM and explicit
security qualification plan. Phase 6A runs none.

## Phase 6B Blueprint

### 6B-1: Judge Service image

- Scope: production dependency closure, non-root read-only image, health/ready,
  Judge-only config/secrets, architecture/image tests.
- Risk: dependency omission or Product credential accidentally included.
- Acceptance: image starts with isolated Judge DB/Redis, rejects Product DB env
  contract, no socket/capability, liveness/readiness semantics pass.
- Model: Terra for mechanical Dockerfile work; GPT-5.6 Sol + High for credential
  and boundary review.

### 6B-2: Worker host/container decision implementation

- Status: implemented and controlled-runtime validated on Windows/WSL2 amd64.
- Scope: host-native Worker, explicit container/host endpoint domains,
  dependency-aware Worker readiness, Redis/Judge restart recovery, and preserved
  loopback Supervisor contract.
- Current debt: service-mode Worker still uses Redis for liveness; removal was
  not mixed with this integration phase, so dedicated ACL/credential isolation
  remains the next `HIGH` blocker.
- Acceptance: Worker has no DB/MinIO credential; current shared Redis access is
  explicit debt. Durable assignment and incarnation fencing pass, and the
  loopback Supervisor contract remains.
- Model: GPT-5.6 Sol + High.

### 6B-3: Supervisor connectivity

- Scope: retain host loopback for initial release; specify Unix-socket design if
  future Worker container is pursued; separate liveness/readiness.
- Risk: accidental `0.0.0.0`, unauthenticated bridge exposure, stale readiness.
- Acceptance: no broad bind, Docker socket, host network/PID, or privilege;
  missing Supervisor capability makes Worker unready.
- Model: GPT-5.6 Sol + High.

### 6B-4: Linux sandbox qualification

- Scope: disposable native Linux amd64 host, dedicated unprivileged identity,
  no Docker group, exact rootfs/runc/systemd/cgroup prerequisites.
- Risk: host/kernel-specific behavior and destructive residue.
- Acceptance: preflight and full security matrix with real kernel evidence;
  no production-ready claim beyond tested host profile.
- Model: GPT-5.6 Sol + High.

### 6B-5: Security regression

- Scope: execute the matrix above on isolated data, add missing file/FD/transport
  tests, verify cleanup and durable result behavior.
- Risk: tests intentionally stress resources.
- Acceptance: all required rows pass or Phase remains partial; no skipped row is
  reported as pass.
- Model: GPT-5.6 Sol + High.

### 6B-6: Compose Judge profile

- Scope: add Judge Service after existing bootstrap/migrate jobs, private
  networks, secrets, profiles, docs, and explicit external execution-cell state.
- Risk: Compose health mistaken for execution readiness or secrets exposed in
  environment/history.
- Acceptance: Core regression passes; Judge control plane starts twice cleanly;
  Compose alone does not claim real execution; no Core Dockerfile/Nginx/migration
  redesign.
- Model: Terra for Compose mechanics; GPT-5.6 Sol + High final security review.
