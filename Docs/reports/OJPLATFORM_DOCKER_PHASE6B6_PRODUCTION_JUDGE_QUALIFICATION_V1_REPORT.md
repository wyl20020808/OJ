# Docker Phase 6B-6 Production Judge Qualification Report

## Live Baseline

- Canonical main was clean at `9a4868f4dca7052ae6d8a73347982c386fe70655`.
- Feature branch/worktree: `codex/docker-phase6b6-production-qualification-v1` / `D:\OJPlatform-worktrees\docker-phase6b6-production-qualification-v1`.
- Phase 6B-1 through 6B-5: PASS / MERGED.
- Known HIGH blockers (Worker Redis ACL and `oj-sandbox` Docker group): RESOLVED.
- Starting findings: CRITICAL 0, HIGH 0, MEDIUM 3.

## Files Changed

- Supervisor OCI policy: explicit NOFILE/FSIZE limits, expanded dangerous-syscall denylist, disk preflight, fail-closed workspace accounting, deterministic root/non-root and cgroup tests.
- Judge Service: authenticated durable-node execution-readiness endpoint.
- Production Compose: required Judge secrets and bounded log rotation.
- Production config qualification script and static tests.
- Three bounded file/descriptor fixtures plus expanded seccomp fixture/harness.
- Production deployment, native qualification handoff, compensating-control record, architecture/handoff/status/report documentation.

## Qualification Environment

- Host: Windows with Ubuntu 24.04.4 LTS under WSL2.
- Kernel: `6.18.33.2-microsoft-standard-WSL2`, x86_64.
- Virtualization: `systemd-detect-virt = wsl`.
- systemd 255, running.
- Unified cgroup v2; cpu/io/memory/pids controllers present.
- runc 1.4.3, OCI 1.3.0, libseccomp 2.5.5.
- Repository filesystem: Windows-mounted worktree; sandbox/rootfs/workspace qualification used Linux execution-cell paths and task-owned `/tmp` paths.

## Native Linux Availability

`NATIVE_LINUX_AMD64_QUALIFICATION_HOST = NO`. WSL2 is not native production Linux. Lane B was used. Native final qualification was not attempted or claimed.

## Production Architecture

Preserved split architecture: Dockerized Product/Judge control plane plus host-native Worker/Supervisor/runc execution cell. No untrusted code enters API/Judge Service. No Docker socket, broad capability, host PID/network, or unsandboxed fallback was added.

## Production Compose

PASS. Production render with `--profile judge` passed. A fresh unique project built and started PostgreSQL, Redis ACL bootstrap/Redis, MinIO, Product migration/API/Web, Judge bootstrap/migration/Service. Images use explicit version tags; Node base is 22.20.0, Redis 7.4.1, PostgreSQL 16.4, MinIO dated release, nginx 1.27. No `latest` is used. Dependency lockfile was enforced.

Actual runtime inspection confirmed only Web public and Judge Service on host loopback. Private services had no host publication. Judge Service remained non-root, read-only, cap-drop ALL, no-new-privileges, no privileged/host PID/host network/socket mount.

## Runtime User Matrix

PASS. Docker Judge processes use image user `ojplatform`; migrations are one-shot and separate. Trusted Docker operator is root/operator context. Host Agent/Worker remain host-native trusted identities. Supervisor is `oj-sandbox` UID/GID 1000 with primary group only. Sandbox guest maps guest root to this unprivileged host identity.

## Secret Matrix

Documented in `Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md`. Production requires external Product/Judge DB, Redis role, MinIO/S3, service, and node credentials. Judge Service receives Judge-only DB/Redis/tokens. Product DB/S3 credentials do not enter execution cell. No real value is documented.

## Network Exposure

PASS. Render and runtime `ss`, `docker ps`, `docker port`, and inspect evidence showed Web public; Judge Service `127.0.0.1:<port>`; API/PostgreSQL/Redis/MinIO private. Supervisor qualification remained alternate loopback; production contract remains `127.0.0.1:19092` only.

## Database Isolation

PASS. Product/Judge bootstrap/migrations completed independently. Judge runtime role was non-superuser, no CREATEDB/CREATEROLE, and lacked public-schema CREATE. Migration identity remained separate. Worker/Supervisor/Sandbox received no DB credential.

## Redis ACL Regression

PASS. Fresh and second bootstrap were idempotent. Default/unauthenticated PING remained denied; health identity succeeded; Worker identity could not use ACL administration. Redis restart exposed no observed unauthenticated PONG window; Judge Service recovered readiness.

## Sandbox Privilege Regression

PASS. Fresh `oj-sandbox` process had only primary group. Docker socket and daemon were denied. Root/operator retained Docker infrastructure duty. Execution-cell source gate found no Docker dependency or privilege workaround.

## MEDIUM-1 Seccomp

Disposition: `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`.

The amd64 policy remains default-allow, but now explicitly denies mount/umount/pivot, ptrace, kexec, module load/unload, reboot, swap, namespace reassociation, BPF/perf, file-handle, userfaultfd, and keyring classes. Safe runtime denial probes passed. Full current C++20 compile/runtime regression passed.

A WSL-derived syscall allowlist was not promoted as native production policy. GCC/binutils/glibc subprocess/thread/signal/mmap/filesystem compatibility plus kernel variance make such a claim unsafe without native traces. Empty capabilities, no-new-privileges, rootless runc, six namespace classes, cgroups, immutable rootfs, private network/filesystem, finite resources, and cleanup are mandatory controls. Residual kernel/syscall risk and revisit triggers are documented.

## MEDIUM-2 RLIMIT_NOFILE

Disposition: `RESOLVED`.

Every OCI process has hard=soft NOFILE. Compile = 128; runtime = 64. Normal GCC/C++ compilation passed. A bounded runtime fixture attempted 80 descriptors, stopped below 80 and above normal demand, cleaned up, and a subsequent job passed.

## MEDIUM-3 Compile Workspace / File Limit

Disposition: `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL` for aggregate kernel quota; explicit per-file mitigation implemented.

Compile hard=soft FSIZE = 16 MiB; runtime = 512 KiB. Runtime remains on 1 MiB tmpfs. Compile keeps 32 MiB aggregate accounting at 10 ms, now fails closed on accounting error, requires 64 MiB free-space preflight, and verifies owned cleanup. Low-capacity injection, 64-small-file accounting, bounded FSIZE/multi-file fixtures, normal compile, post-limit recovery, and cleanup passed.

No per-workspace ext4/xfs project quota was added because WSL cannot qualify it and privileged per-job mount/quota lifecycle would add unverified complexity. Short-window aggregate overshoot remains controlled residual risk.

## Security Finding Disposition

- CRITICAL open: 0.
- HIGH open: 0.
- MEDIUM open: 0.
- Seccomp finding: accepted with documented controls.
- NOFILE finding: resolved.
- Workspace/file finding: per-file resolved; aggregate quota accepted with documented controls.
- Formal record: `Docs/security/JUDGE_PHASE6B6_COMPENSATING_CONTROLS.md`.

## Execution Readiness

PARTIAL. Judge Service now reports authenticated `ONLINE`, `EXECUTION_READY`, `DEGRADED`, and `UNAVAILABLE` from DB/Redis readiness and durable node records; only qualified current nodes with free slots produce `EXECUTION_READY`. Worker and execution path still fail closed. Remaining debt: Worker readiness may be stale between checks, Supervisor has combined health/capability semantics, and Host Agent health does not fully prove template readiness. No scheduler/HA system was overbuilt.

## Compiler Rootfs Integrity

PASS. Identity and content-manifest digest remained `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`; root was `root:root` mode 0555; no non-symlink path was writable. Rootfs contents were not modified. Supply chain is digest-pinned Ubuntu plus exact GCC/binutils/glibc package versions, generated package/compiler/image metadata and full manifest. Upgrade/rollback contract is documented.

## Production Filesystem Ownership

PASS for inspected WSL candidate. Rootfs and trusted artifacts are root-controlled/non-world-writable; execution roots are private and ownership-marked; secret files require protected runtime injection. No 0777/chmod/socket workaround exists.

## Fresh Deployment

PASS on isolated WSL production-like project. Unique containers, networks, volumes, ports, DBs, ACLs, and synthetic credentials were used. No shared or real data participated. All expected long-lived services became healthy; bootstrap/migration jobs exited successfully.

## Second Startup

PASS. Re-running the production-like profile restarted one-shot ACL/bootstrap/migrations without duplicate migration, ACL reset, identity drift, workspace conflict, or orphan sandbox. Services remained healthy.

## Restart / Recovery

PASS for WSL prequalification. Judge Service restart recovered readiness. Redis restart preserved ACL and Judge reconnection. Worker full Go suite covered dependency readiness, process restart/re-registration/incarnation fencing, stale result rejection, and service recovery. Supervisor restart recovery targeted test passed.

## Crash Recovery

PASS for isolated WSL evidence. Isolated Judge Service was killed and restarted to readiness. Sandbox qualification covered timeout/crash/background cleanup and controlled cleanup failure/recovery. Supervisor active-record recovery remained fail closed. No task-owned cgroup/runc/process/workspace residue remained.

## Resource Limits

PASS for C++20 candidate: finite cgroup CPU/memory/PIDs, wall/output/workspace/artifact/source/testcase bounds, explicit NOFILE/FSIZE, and cleanup. CPU throttling, memory/PID events, wall termination, output cap, descriptor/file boundaries, and recovery were observed.

## Disk Pressure Handling

PASS for implemented preflight; aggregate quota remains accepted residual risk. A test-injected below-64-MiB state failed closed without filling disk. Accounting errors fail closed. No host disk-fill test was run.

## Logging / Secret Safety

PASS. Production long-lived Compose services use `json-file` rotation, 10 MiB x 5. Isolated runtime logs contained none of the synthetic credential values. Added-line secret and environment-dump scans passed. Native journald size/retention remains deployment-required.

## Artifact Cleanup

PASS. Compile artifacts, source, testcase, runtime rootfs/workspaces, runc state, cgroups, listeners, containers, networks, volumes, and temporary secret files were task-owned and removed. Durable result/object retention boundaries are documented.

## Supervisor Boundary

PASS for WSL. Non-root/rootless runc, user bus, cgroup delegation, rootfs identity, loopback-only listener, no Docker access, and fail-closed preflight passed. The two prior broad-suite baseline failures were repaired as deterministic tests: cgroup expectation now reflects rootless `user.slice`; root rejection is tested independent of unrelated user-bus context. Full WSL Supervisor suite now passes.

## Sandbox Security Regression

PASS. Dual-opt-in suite ran 12 trusted probes and 14 bounded untrusted C++ sources. Network/filesystem/credential/Docker/process/PID/namespace/cgroup/resource/concurrency/testcase/fail-closed/cleanup controls remained PASS. Added dangerous-syscall, NOFILE, FSIZE, multi-file, and post-limit recovery evidence passed. First launch inherited root user-bus variables and failed closed before fixtures; corrected dedicated-user environment then passed.

Only static C++20 (`cpp20-gcc-13-v1`) is implemented. Python/Java were not falsely tested or added.

## Production Acceptance Matrix

| Area | Result | Evidence/limit |
| --- | --- | --- |
| CONTROL PLANE | PASS | fresh isolated Compose healthy |
| MIGRATIONS | PASS | Product/Judge one-shot jobs; second run clean |
| DB ISOLATION | PASS | distinct roles/DB; runtime no DDL |
| REDIS ACL | PASS | default denied; scoped roles; restart |
| SECRETS | PASS | required external values; fail-closed render |
| NETWORK | PASS | Web public; Judge loopback; others private |
| SANDBOX PRIVILEGE | PASS | primary group only; Docker denied |
| SECCOMP | PARTIAL | accepted amd64 denylist controls; not allowlist/native proof |
| NOFILE | PASS | compile 128/runtime 64 |
| FILE SIZE / WORKSPACE | PARTIAL | FSIZE PASS; aggregate quota accepted controls |
| CPU | PASS | finite `cpu.max`, throttling |
| MEMORY | PASS | finite `memory.max`, kernel event |
| PIDS | PASS | finite `pids.max`, kernel event |
| WALL TIME | PASS | bounded termination |
| OUTPUT | PASS | 65,536-byte capture |
| CGROUP | PASS | live evidence and cleanup |
| NAMESPACE | PASS | PID/mount/network/IPC/UTS/user |
| ROOTFS | PASS | exact immutable identity |
| FILESYSTEM | PASS | private roots/tmpfs/mounts |
| CREDENTIALS | PASS | sandbox absent; logs clean |
| DOCKER SOCKET | PASS | guest absent; host identity denied |
| SUPERVISOR | PASS | loopback/non-root/rootless/fail-closed |
| FAIL-CLOSED | PASS | preflight, low disk, faults, user-bus error |
| RESTART | PASS | control plane + Worker/Supervisor tests |
| RECOVERY | PASS | crash/stale-record/ACL recovery |
| CLEANUP | PASS | no owned residue |
| LOGGING | PASS | redaction scan + rotation |
| ARTIFACTS | PASS | identity/size/hash/lifecycle |
| CONCURRENCY | PASS | isolated jobs/resources |
| FRESH INSTALL | PASS | isolated WSL project |
| SECOND STARTUP | PASS | idempotent |

## Native Linux Qualification

PENDING. No native Linux host was available. A direct executable checklist is in `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md`. It includes prerequisites, fresh clone, secrets, rootfs, control plane, execution cell, security suite, lifecycle/recovery, cleanup, evidence, and final status rules.

## WSL Qualification Limits

WSL2 evidence does not qualify native systemd/cgroup/filesystem/quota/firewall/reboot behavior, native kernel syscall compatibility, production patch operations, or production failure domains. `PRODUCTION_JUDGE_QUALIFIED` remains NO and Linux amd64 remains PARTIAL.

## Remaining Risks

- Accepted amd64 default-allow seccomp residual risk.
- Accepted compile aggregate monitor overshoot; no kernel project quota.
- End-to-end readiness/host-capacity model remains PARTIAL.
- Native host restart/reboot, firewall, journald policy, filesystem quota behavior, and operational monitoring are pending native qualification.
- Kernel/runc zero-days remain out of scope.

## Unsupported Platforms

- Linux ARM64 full Judge: NOT QUALIFIED.
- macOS Judge: NOT TARGET.
- Phase 5 Mac Core validation: DEFERRED/PENDING.
- Python, Java, SPJ, interactive, dynamic toolchains: not implemented/qualified.

## Handoff State

Phase 6B-6 production hardening and WSL prequalification are feature-complete. Native Linux final qualification is the next action. Handoff remains <=100 lines and Production Judge remains NO.

## Commit

Feature commit: `security: harden and qualify production judge` (hash recorded after commit). Main merge is not performed.

## Next Action

Execute `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on a fresh native Linux amd64 host using GPT-5.6 Sol + high reasoning. Only a full native PASS may set Linux amd64 qualified and Production Judge YES.
