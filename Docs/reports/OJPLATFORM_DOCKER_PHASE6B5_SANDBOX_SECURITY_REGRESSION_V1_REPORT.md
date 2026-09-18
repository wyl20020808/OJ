# Docker Phase 6B-5 Sandbox Security Regression Report

## Live Baseline

- Canonical root: clean `main` at `2573294f040785d0787b90b2ee98d4ca87c8ac92`.
- Feature branch: `codex/docker-phase6b5-sandbox-security-regression-v1` from live main.
- Phase 6B-1/2/3/4: PASS / MERGED.
- Redis ACL and `oj-sandbox` Docker-group HIGH blockers: RESOLVED.
- Production Judge before and after this phase: NO.

## Files Changed

- `tests/security/run-sandbox-security-qualification.sh`: explicit dual-opt-in Linux runner, isolated Supervisor/resources, prerequisites, residue checks, and cleanup.
- `tests/security/sandbox_security_qualification.py`: bounded trusted-probe and untrusted-fixture orchestration/assertions.
- `tests/security/fixtures/*.cpp`: 11 short, deterministic, local-only fixture sources.
- `tests/sandbox-security-qualification.test.ts`: static safety/opt-in/default-suite gate.
- `apps/sandbox-supervisor/internal/supervisor/phase6b5_security_test.go`: controlled runc/network-namespace, missing-rootfs, and workspace failure tests.
- `package.json`: explicit `qualify:sandbox-security` command.
- Architecture, handoff, status, and this report.

## Qualification Environment

- Windows host with Ubuntu 24.04.4 LTS under WSL2.
- Kernel: `6.18.33.2-microsoft-standard-WSL2`, `x86_64`.
- runc: 1.4.3, OCI spec 1.3.0, libseccomp 2.5.5.
- cgroup: unified v2; cpu, memory, and pids available/delegated.
- Supervisor: UID/GID 1000/1000 (`oj-sandbox`), primary group only.
- Docker socket: `root:docker` mode `0660`; inaccessible to `oj-sandbox`.
- Compiler rootfs: `/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1`, `root:root` mode `0555`, identity `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`.
- No shared Worker, Supervisor, or Host Agent process/listener existed. An unrelated host Redis listener was observed and left untouched.

This is WSL2 qualification, not native production Linux qualification.

## Preflight

PASS. Fresh account/group and Docker denial checks held. User manager, D-Bus, rootless runc, cgroup v2 delegation, exact compiler-rootfs identity/content, and alternate loopback port availability passed. The suite ran as non-root `oj-sandbox`; root execution and Docker-group membership are rejected.

## Fixture Safety Model

Fixtures are repository-owned test inputs but treated as untrusted by compile/runtime sandboxes. They are bounded and single-purpose: exact low limits, at most 64 fork attempts, 96 MiB incremental allocation under a 64 MiB cgroup, 128 KiB output under a 64 KiB collector, 2-second runtime wall limit, two concurrent sandboxes, and fixed local endpoints only. No public CVE, exploit chain, privilege escalation, persistence, Internet scan, destructive disk operation, real secret, or real user data was used.

Execution requires both `OJ_RUN_SANDBOX_SECURITY_QUALIFICATION=1` and `OJ_ACK_BOUNDED_UNTRUSTED_FIXTURES=1`. Default `pnpm test` does not execute it.

## Isolation Strategy

Each run uses a unique `phase6b5-<time>-<pid>` identity, `/tmp/ojplatform-phase6b5-*` tree, sandbox root, execution-record roots, source/testcase IDs, fake host/sibling canaries, fake environment secret, active local TCP canary, and Supervisor on `127.0.0.1:19625`. No Worker, Judge Service, Judge DB, Redis queue/prefix, Product DB, or object storage participates; those collision domains are absent rather than shared. Cleanup owns only the unique tree, task Supervisor/listener, and per-run runc/systemd scopes.

## Network Isolation

PASS. Untrusted runtime could not reach the active qualification Supervisor (`127.0.0.1:19625`), active host canary (`127.0.0.1:19626`), production Supervisor address (`127.0.0.1:19092`), Redis, PostgreSQL, MinIO, Judge Service, Product API representatives, or DNS. Trusted fixed probe also denied TEST-NET, metadata, and private-address representatives with bounded 50 ms attempts. No port range or public Internet was scanned. Sandbox had no default route. Guest loopback bind remained private and did not map to host loopback.

## Filesystem Isolation

PASS. Runtime denied host canary, sibling canary, `/mnt/c`, `/mnt/d`, host home/root, repository metadata, secrets, Docker socket, dangerous device paths, parent traversal, and outside writes. Runtime rootfs writes to `/` and `/etc` failed. Workspace remained writable and private.

## Sibling Workspace Isolation

PASS. Fake sibling canary was absent from the guest; concurrent jobs had distinct sandbox IDs/cgroups; job roots remained private; no sibling host directory was mounted. Two testcase lifecycles also proved private `/workspace` state.

## Credential Isolation

PASS. A randomized fake host secret was present only in Supervisor environment. Runtime allowlist did not expose it or Product/Judge DB, Redis, Judge token, S3/MinIO, session, or Docker variables. Reports/logs contain no secret value.

## Docker Socket Isolation

PASS. `/var/run/docker.sock` was absent inside both trusted and untrusted sandboxes. Host `oj-sandbox` socket/API denial remained PASS. No Docker dependency or workaround was added.

## Process Isolation

PASS. Guest process was PID 1 and saw only itself in `/proc`; host/other sandbox processes were not visible or signalable. Runtime user namespace exposed guest UID/GID 0 mapped to host UID/GID 1000/1000 without host privilege.

## PID Limit

PASS. `pids.max=16`; bounded 64-child fixture generated `pids.events max>0`. Observed trusted qualification value: `max=101`. Cleanup removed every descendant and scope.

## CPU / Wall-Time Limit

PASS. Kernel `cpu.max=10000 100000` for the CPU probe and `nr_throttled=101` proved cgroup throttling. Runtime busy loop terminated at 2000 ms under the fixed 2000 ms wall limit, with cleanup verified. CPU quota is a rate bound; wall timeout remains the total elapsed-time bound.

## Memory Limit

PASS. Trusted fixture requested/observed `memory.max=33554432`; `memory.events max=241`. Untrusted incremental allocator under runtime `memory.max=67108864` produced a normalized memory-limit event. Host remained responsive.

## Output / File Limit

Output: PASS. 128 KiB fixture was captured at exactly 65,536 bytes, marked truncated/limit-hit, cancelled, and cleaned without disk growth.

File/workspace: PARTIAL, `MEDIUM`. Runtime tmpfs and compile workspace monitors are finite, and trusted workspace growth was denied. No explicit `RLIMIT_FSIZE` or kernel compile-workspace quota exists; 10 ms userspace monitoring can overshoot. No large file was produced.

Open files: NOT IMPLEMENTED / `MEDIUM`. OCI `RLIMIT_NOFILE` is not configured. Existing memory/pids/workspace/wall controls compensate partially but do not qualify descriptor exhaustion.

## Background Process Cleanup

PASS. Bounded fork fixture started one 30-second child and exited its parent. PID namespace/runc teardown killed the descendant; runc state, cgroup, process, and workspace were absent after result.

## Timeout Cleanup

PASS. Busy-loop timeout returned wall-limit facts, `clean=true`, no runc state/cgroup/workspace, and a later fixture ran normally.

## Crash Cleanup

PASS. Signal crash was classified from wait status, cleanup passed, Supervisor stayed healthy, and a subsequent normal fixture completed. Existing restart-record tests also keep interrupted active records fail-closed; no shared service was restarted.

## Cgroup Enforcement

PASS. Compile and runtime received distinct finite `cpu.max`, `memory.max`, and `pids.max` values. Evidence came from each live cgroup, not only OCI JSON or a Go timer. Memory/pids events and CPU throttling were observed.

## Cgroup Cleanup

PASS. Harness compared pre/post task scopes and validated every reported cgroup path was absent. No stale qualification scope remained.

## Namespace Isolation

PASS. Real OCI runs used separate PID, mount, network, IPC, UTS, and user namespaces. Runtime PID/user evidence, private host loopback, private mounts, sethostname denial without capability, and cgroup separation passed.

## Mount Isolation

PASS. Host mounts/canaries were absent; `/workspace`, `/tmp`, `/dev`, and `/proc` were private controlled mounts. `mount`, `unshare`, and traversal attempts were denied. Final mountinfo contained no qualification path.

## Capability Audit

PASS. `CapEff`, `CapPrm`, and `CapBnd` were all zero. `CAP_SYS_ADMIN`, `CAP_SYS_PTRACE`, `CAP_NET_ADMIN`, `CAP_SYS_MODULE`, and `CAP_DAC_OVERRIDE` were absent.

## no_new_privs

PASS. Actual runtime `/proc/self/status` reported `NoNewPrivs: 1`.

## Seccomp

PARTIAL, `MEDIUM`. Actual runtime reported filter mode 2. Safe probes confirmed denial of mount, unshare, and ptrace; configured policy also denies umount2, pivot_root, setns, bpf, and perf_event_open. Policy remains default-allow denylist and hardcodes `SCMP_ARCH_X86_64`; it is not a production-derived allowlist and does not qualify ARM64.

## Device Isolation

PASS. Private `/dev` exposed required pseudo-device semantics only; `/dev/kmsg`, `/dev/mem`, and raw-disk representatives were absent. Fixtures did not open host devices or create device nodes.

## Proc / Sys Exposure

PASS. Private PID `/proc` hid host processes; sensitive proc paths were masked/read-only; `/proc/sys` was not writable; host `/sys` was not mounted into runtime. No host cgroup/kernel setting was changed.

## Compiler Isolation

PASS. Adversarial source compiled inside rootless runc with read-only verified compiler rootfs, private bind workspace, fixed argv/environment, network namespace, empty capabilities, no-new-privileges, seccomp, and finite cgroup limits. Compile-time `__has_include` canaries confirmed host/sibling/Docker paths were unavailable. Output artifact was regular, non-symlink, hash/owner/size checked, and copied only into its job.

## Compile Resource Limits

PASS for configured enforcement. Actual compile evidence showed finite one-CPU cgroup rate, 512 MiB memory, 64 pids, 10-second wall, 64 KiB stdout/stderr, 32 MiB monitored workspace, and 16 MiB artifact bounds. Bounded malformed source returned compile failure without runtime. File/FD caveats remain above.

## Symlink Safety

PASS. Runtime symlink to host canary could not resolve. Source, testcase, artifact, and staging tests reject symlinks and replacement races. Collector reads verified descriptors/regular files only.

## Path Traversal

PASS. Guest parent traversal found no host/sibling path. Request IDs, testcase names, source paths, artifact paths, and ownership roots reject traversal/absolute injection before execution.

## Artifact Isolation

PASS. Artifacts bind source hash, compiler/rootfs/template identities, attempt/job ownership, regular-file type, size, owner, and hash. Concurrent job IDs and artifacts remained distinct; no cross-job path was mounted or collected.

## Testcase Isolation

PASS. One synthetic execution set compiled once, testcase A wrote `/workspace/case-canary`, and testcase B returned `CASE_B_ISOLATED`; each testcase used a fresh runtime/rootfs/workspace/cgroup lifecycle.

## Submission Isolation

PASS. Synthetic submissions used distinct records, workspaces, source/artifact identities, sandbox IDs, cgroups, outputs, and cleanup. No real Submission row or Product DB was used.

## Concurrency Isolation

PASS. Two low-resource untrusted runs completed concurrently with distinct runtime sandbox IDs and cgroup paths; outputs and records did not cross. Fixed concurrent memory/pids probes also enforced independent limit pairs and cleanup.

## Malformed Program Handling

PASS. Bounded invalid C++ produced compile failure with no runtime. Signal crash, non-zero process behavior, output overflow, timeout, and resource events remained classified and clean. Supervisor continued serving later work.

## Supervisor Failure

PASS for tested boundary. Qualification-only cleanup fault produced `SANDBOX_CLEANUP_FAILURE`, `clean=false`, and no qualification PASS; verification remained failed until explicit task-owned recovery, then a fresh full probe passed. Active-record restart unit tests recover fail-closed. Shared Supervisor was never crashed or restarted.

## runc Failure

PASS. Controlled executable runc wrapper inspected an OCI config containing the required network namespace and returned failure before launch. Result was runtime error with clean state; a static marker-capable fixture never ran on host. Missing runc preflight also failed closed.

## Rootfs Failure

PASS. Missing compiler rootfs returned `ErrSandboxPreflight` before execution. Real rootfs identity, version, full content, owner/mode, compiler, and command template were revalidated and not modified.

## Cgroup Failure

PASS. Missing root/manager/subtree memory or pids delegation is rejected by preflight. No userspace or unsandboxed fallback exists.

## Network Namespace Failure

PASS. Controlled runc launch failure after asserting the OCI network namespace remained an infrastructure/runtime failure; the marker fixture was not executed directly on host.

## Workspace Permission Failure

PASS. A test-only non-directory workspace root failed before runc and produced no fixture output or host marker. No chmod 777 fallback exists.

## Redis ACL Regression

PASS. Targeted Redis ACL Compose and Judge/Worker tests passed. Default user lockdown, separate Product/Judge/Worker identities, and Worker fail-closed behavior remain. Qualification did not connect to or mutate Redis.

## Docker Privilege Regression

PASS. Fresh `oj-sandbox` has no Docker group; host socket/API remain denied; execution-cell dependency/provisioning gate passed; no privileged/socket workaround exists.

## Supervisor Existing Baseline Failures

Broad WSL Supervisor suite retained exactly two historical failures:
`TestOCIConfigCarriesFiniteResources` expects the old root-oriented
`system.slice` path while non-root production config correctly emits
`user.slice`; `TestProductionSupervisorRejectsRootQualification` expects one
exact rejection class but reaches an unavailable root user bus first. Both paths
remain fail-closed. Live finite `user.slice` cgroups and non-root preflight passed,
so neither is a Phase 6B-5 security regression. Tests were not skipped, weakened,
or repaired out of scope. All focused security/resource/non-root tests passed.

## Security Regression Matrix

| Area | Result | Minimal evidence |
| --- | --- | --- |
| NETWORK | PASS | active host/Supervisor/service/DNS endpoints denied; no default route |
| FILESYSTEM | PASS | fake host/sibling paths absent; runtime rootfs read-only |
| SIBLING WORKSPACE | PASS | canary absent; private roots; distinct concurrent sandboxes |
| CREDENTIALS | PASS | fake and named service secrets absent from allowlisted env |
| DOCKER SOCKET | PASS | guest absent; host UID denied |
| PROCESS | PASS | PID 1; one visible PID; host signal denied |
| PID | PASS | `pids.max=16`, kernel max events |
| CPU | PASS | finite `cpu.max`, throttling observed |
| WALL TIME | PASS | 2000 ms limit terminated fixture at 2000 ms |
| MEMORY | PASS | finite `memory.max`, kernel max/OOM evidence |
| OUTPUT | PASS | 65,536-byte bounded capture and cancellation |
| BACKGROUND PROCESS | PASS | descendant, runc, cgroup, workspace absent |
| TIMEOUT CLEANUP | PASS | limit facts and zero residue |
| CRASH CLEANUP | PASS | signal exit clean; next run healthy |
| CGROUP | PASS | per-stage live kernel evidence; post-run absence |
| NAMESPACE | PASS | PID/mount/network/IPC/UTS/user namespaces active |
| MOUNTS | PASS | private controlled mounts; host mounts absent |
| CAPABILITIES | PASS | effective/permitted/bounding all zero |
| NO_NEW_PRIVS | PASS | runtime flag 1 |
| SECCOMP | PARTIAL | filter active and safe denials pass; denylist/amd64 limitation |
| ROOTFS | PASS | runtime read-only; compiler rootfs immutable/verified |
| SYMLINK | PASS | guest and collector escapes denied |
| PATH TRAVERSAL | PASS | guest/request/artifact traversal denied |
| ARTIFACT | PASS | bound ownership/hash/type; no cross-job access |
| TESTCASE | PASS | fresh workspace per case |
| SUBMISSION | PASS | distinct synthetic job roots/records/results |
| CONCURRENCY | PASS | two isolated low-resource runs plus resource probes |
| MALFORMED PROGRAM | PASS | compile failure/crash do not break Supervisor |
| FAIL-CLOSED PREFLIGHT | PASS | runc/rootfs/cgroup/workspace/network launch failures stop execution |
| UNSANDBOXED FALLBACK | PASS | marker fixture never ran outside runc |
| FILE SIZE | PARTIAL | runtime tmpfs and monitor bounded; no `RLIMIT_FSIZE` |
| OPEN FILES | PARTIAL | no explicit `RLIMIT_NOFILE` |

## Findings by Severity

- CRITICAL: 0.
- HIGH: 0.
- MEDIUM: 3 — seccomp denylist/amd64-only; no `RLIMIT_NOFILE`; no kernel compile-workspace quota/`RLIMIT_FSIZE`.
- LOW: 0.
- INFO: WSL2 result is host-profile-specific and not production Linux qualification.

No finding reopened either known HIGH production blocker.

## Validation

- Opt-in real security qualification: PASS; 12 trusted probe runs, 11 adversarial fixture sources, final cleanup PASS.
- Focused real non-root Supervisor preflight/resource/cancellation/concurrency tests: PASS.
- Phase 6B-5 controlled runc/rootfs/workspace failure tests: PASS.
- WSL Supervisor focused unit/security tests and `go vet ./...`: PASS.
- WSL broad Supervisor suite: only the two recorded baseline failures above.
- Worker: 84 Go tests passed across 10 packages; `go vet ./...`: PASS.
- Host Agent, Judge Service, Redis ACL, sandbox control/authz, Docker privilege, and qualification gates: 99 Vitest assertions passed.
- TypeScript typecheck, architecture gate, targeted ESLint, Prettier, Python compile, Bash syntax, secret scan, privilege-workaround scan, and `git diff --check`: PASS.
- Safety gate without dual opt-in: refused with exit 64, as designed.
- One Windows-host invocation of Linux artifact validation rejected the Windows PE test executable; the same test passed in authoritative WSL/Linux context. No Linux acceptance test was skipped or weakened.

## Cleanup Verification

PASS. Each result required `clean=true` except the intentional cleanup-fault fixture. Reported cgroups and runc IDs were absent, sandbox root was empty, pre/post cgroup-scope sets matched, canaries remained intact, alternate ports/listener/Supervisor stopped, no qualification mount/process remained, and only the unique `/tmp` tree was removed. Shared Redis and all unrelated processes/resources were preserved.

## WSL Qualification

`WINDOWS_WSL_SANDBOX_SECURITY_REGRESSION = PASS`. This qualifies current rootless runc execution cell and C++20 profile on this Ubuntu 24.04 WSL2 x86_64 host. It does not prove native production Linux operational behavior, ARM64 seccomp/rootfs, Mac execution, kernel-zero-day resistance, or multi-host HA.

## Remaining Production Work

Phase 6B-6 must perform production-like native Linux amd64 qualification, deployment/operational review, service lifecycle, monitoring, patch/recovery, and final risk acceptance. Production Judge remains `NO`; Linux amd64 remains `PARTIAL`; Linux ARM64 remains `NOT QUALIFIED`; Mac Judge remains `NOT TARGET`. Durable execution readiness remains `PARTIAL` because the known durable control-plane observability model is not complete.

## Risks

- WSL2 kernel behavior may differ from production Linux.
- Seccomp denylist is narrower than a production allowlist and architecture-specific.
- Explicit file-descriptor/file-size kernel limits remain gaps.
- Kernel/runc/systemd remain trusted dependencies; this suite intentionally contains no real escape exploit.

## Handoff

Phase 6B-5 = PASS / FEATURE COMPLETE. Both known HIGH blockers remain RESOLVED. WSL sandbox security regression = PASS. Production Judge = NO. Next: Phase 6B-6 with GPT-5.6 Sol + high reasoning.

## Commit

- Branch: `codex/docker-phase6b5-sandbox-security-regression-v1`.
- Feature commit message: `security: qualify judge sandbox isolation`.
- Main merge: not performed.

## Next Phase

Phase 6B-6 only after this feature is reviewed/integrated. Do not reinterpret this WSL result as production qualification.
