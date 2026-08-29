# Phase 2B-R2 Sandbox Runtime Full Requalification

Date: 2026-08-30  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`  
Common baseline: `ebf2e06`

## Status

**PARTIAL**. R1 recovery is present and the frozen rootless OCI/runc backend now starts and cleans up real trusted probes. FS, namespace, network-default-deny, seccomp, identity, adapter, concurrent qualification, and cgroup attachment/configuration have real evidence. Full R2 PASS is not claimed because resource-pressure enforcement (CPU/memory/pids), timeout/cancellation pressure, and the complete 10-row matrices were not all exercised by dedicated fixed pressure probes.

## Provenance and R1 Reconciliation

Starting HEAD for R2: `91daf87` (`fix: recover rootless runc sandbox qualification`). `ebf2e06` is an ancestor; branch and worktree are correct and tracked state was clean at gate time. R1 Runtime-owned commits `9496095` and `91daf87` are present. Their prerequisite fixes are preserved: Supervisor root is traversable by mapped UID/GID without broad listing (`0711`), and rootfs contains `/dev`, `/proc`, and `/tmp` mountpoints. No reset, force, history rewrite, merge, or unrelated ownership changes were used.

## Backend and Implementation

Dedicated Go Supervisor with rootless OCI/runc, user/mount/PID/network/IPC/UTS namespaces, UID/GID mapping to host 65534, empty capabilities, no-new-privileges, controlled `/proc`, tmpfs `/dev`/`/tmp`/`/workspace`, server-owned seccomp policy, cgroup v2 CPU/memory/pids resources, bounded output, context wall deadline, forced delete, and state/workspace cleanup verification. Only the fixed, versioned, SHA-256 verified `SANDBOX_PROBE_QUALIFICATION` is executable. No arbitrary command, source, path, mount, environment, network target, compiler, runtime judge, verdict, or app database access exists.

## Matrix Results

| Matrix | Result and evidence |
|---|---|
| SB01-SB06 | PASS for validation and fail-closed mode/policy/probe checks; adapter unit-tested |
| FS01-FS10 | PASS for real probe: workspace marker, host root/project paths, `/mnt/c`, `/mnt/d`, traversal and `/host` absent; cleanup PASS |
| NET01-NET10 | PASS for no default route and network namespace; endpoint-specific gateway/service cases remain not separately probed |
| PS01-PS10 | PASS for PID init isolation, UID/GID namespace identity, zero effective caps, no-new-privs/seccomp policy; safe signal/ptrace/device cases not separately exercised |
| RL2B-01..10 | PARTIAL: real cgroup membership and exact `cpu.max`, `memory.max`, `pids.max` configuration observed; pressure enforcement and cancellation-under-pressure not qualified |
| ENV01-ENV08 | PASS for allowlisted `PATH`/`LANG` and no inherited host secret/path mounts; synthetic secret rows not all separately probed |
| LC01-LC10 | PASS for normal, repeated, concurrent runc state and workspace cleanup; timeout/child-fanout/stale cgroup stress rows not all exercised |
| WI01-WI06 | PASS for typed adapter, qualification-only mode, hash enforcement, synthetic result, cancellation context propagation, and no DB dependency |

## Real Evidence

- Real runc probe: PASS. Example output: `pid=1`, `uid=0`, `gid=0`, `cap_eff=0000000000000000`, `seccomp_mode=2`, `default_route=false`, cgroup `0::/phase2b/sbx-...`; `/mnt/c`, `/mnt/d`, `/host`, traversal and host root checks are false; workspace marker is true.
- Real concurrent qualification: two unique sandbox IDs run concurrently and both cleanly complete; repeated `-count=3` runs passed.
- Real cgroup attachment: while probe ran, host observed `cpu.max=100000 100000`, `memory.max=33554432`, `pids.max=16` in `/sys/fs/cgroup/phase2b/sbx-*`. This is configuration/attachment evidence, not pressure enforcement evidence.
- Real seccomp evidence: guest reports seccomp mode 2 and the OCI config contains the trusted deny list for mount/namespace/ptrace/bpf/perf syscalls. Forbidden-syscall execution was not attempted.
- Cleanup evidence: `runc delete --force`, `runc state` absence, and per-job directory absence are checked. No stale state remained after passing runs.

## Repeated Stability and No Weak Fallback

Normal and concurrent qualification were repeated three times with no failures, workspace collisions, or cleanup residues. The implementation never falls back to privileged guest, host PID/network/mount namespace, direct process execution, disabled seccomp, or arbitrary executable. Any runc/setup failure is returned as runtime failure and cleanup is still attempted.

## Tests

- `gofmt`, `go test ./...`, `go vet ./...`: PASS.
- Real runc isolation, concurrent isolation, and cgroup attachment tests: PASS.
- Repository `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, `pnpm build`: PASS after R2 changes.

## Integration Requests and Limitations

Lead must preserve the typed adapter and qualification-only boundary. To reach R2 PASS, run dedicated repository-owned fixed pressure probes for CPU, memory, pids, output, timeout/cancel, child fanout, and stale cgroup/network namespace checks on this rootless backend, then repeat the full SB/FS/NET/PS/RL/ENV/LC/WI matrices. LSM enforcement beyond seccomp was not independently qualified. No changes were made to Auth, Web, shared contracts, `PROJECT_STATUS`, or Phase 2C.

## Commits and Final State

R1 recovery commits present: `9496095`, `91daf87`. R2 implementation/report commits are recorded in `git log` after final verification.  
Final status must be clean.  

**PHASE 2B SANDBOX RUNTIME R2 STATUS = PARTIAL**  
**READY FOR LEAD INTEGRATION = NO**
