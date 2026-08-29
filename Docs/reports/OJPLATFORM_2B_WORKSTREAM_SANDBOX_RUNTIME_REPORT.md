# OJPlatform Phase 2B Sandbox Runtime Workstream Report

Date: 2026-08-29  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`  
Baseline: `ebf2e06`

## Status

**PARTIAL / BLOCKED_BY_ENVIRONMENT**. The dedicated Supervisor, OCI bundle, trusted probe registry, fail-closed adapter, cgroup/resource policy, namespace declarations, seccomp policy, bounded output and cleanup path are implemented. Full backend qualification is not claimed because the required user namespace cannot start under this WSL2/runc combination. No unsandboxed or rootful fallback is used.

## Environment Evidence

- Ubuntu 24.04 on WSL2; kernel `6.18.33.2-microsoft-standard-WSL2`, x86_64.
- `/usr/bin/runc`, version `1.4.3`; Docker/OCI capability is present.
- `/sys/fs/cgroup` is `cgroup2fs`, writable; controllers: `cpuset cpu io memory hugetlb pids rdma`.
- Host process seccomp mode 2 with one filter; `unshare -Ur true` succeeds outside runc.
- `/mnt/c` and `/mnt/d` are writable 9p host mounts. The trusted probe checks that they are absent inside the guest.
- Real runc attempt fails during OCI rootfs preparation: `remount-private ... MS_PRIVATE: permission denied` when user namespace and UID/GID mappings are enabled.

## Implementation

`apps/sandbox-supervisor` contains the Go Supervisor and fixed `SANDBOX_PROBE_QUALIFICATION` binary. Requests are contract `2B.1`, mode-gated, identity/path validated, deadline/limits checked, and probe ID/version/SHA-256 verified before staging. The Supervisor creates a per-job bundle/workspace, runs `runc` with PID/mount/network/IPC/UTS/user namespaces, cgroup v2 CPU/memory/pids resources, masked/readonly proc paths, no-new-privileges, empty capabilities, and a server-controlled seccomp deny list. `/tmp` and `/workspace` are private tmpfs mounts; no host bind mounts, devices, sockets, credentials, or inherited environment are supplied.

Stdout/stderr are collected through bounded writers using the request output cap. Context cancellation and wall deadline terminate the runc invocation, followed by forced delete and state verification. Cleanup failure is a distinct security-significant outcome. Runs have unique IDs and no global serialization lock, allowing independent concurrent sandboxes.

`internal/adapter` is the typed Worker boundary. It accepts only the qualification probe and returns synthetic results; `REAL_SUBMISSION_EXECUTION` and unknown probe IDs are rejected. It has no application database dependency and cannot execute arbitrary commands, source, paths, mounts, environment, or network targets.

## Qualification Matrix

| Area | Result |
|---|---|
| SB01-SB06 | IMPLEMENTED; request/mode/policy validation unit-tested |
| FS01-FS10 | Probe and OCI mounts implemented; real execution BLOCKED by user-namespace rootfs failure |
| NET01-NET10 | Network namespace with no configured network IMPLEMENTED; real guest evidence BLOCKED |
| PS01-PS10 | PID/user/mount namespaces, UID/GID map, dropped caps, no-new-privs, seccomp deny rules IMPLEMENTED; real evidence BLOCKED |
| RL2B-01..10 | CPU/memory/pids cgroup and wall/output bounds implemented; pressure qualification BLOCKED |
| ENV01-ENV08 | Whitelist `PATH`/`LANG` only; no secrets mounted; runtime evidence BLOCKED |
| LC01-LC10 | Forced delete, state check and per-job directory cleanup implemented; unit path is present; full guest/mount/cgroup evidence BLOCKED |
| WI01-WI06 | Typed adapter and REAL-mode rejection implemented/tested; cross-module composition is READY_FOR_LEAD |

## Tests and Evidence

- `go test ./...`: PASS.
- `go vet ./...`: PASS.
- Opt-in real runc test: EXECUTED; records the reproducible `remount-private MS_PRIVATE permission denied` environment blocker and does not fallback.
- Real FS/NET/PID/cgroup/seccomp/concurrency qualification: NOT VERIFIED because the frozen user namespace prerequisite cannot start.
- Repository-wide `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, and `pnpm build`: PASS.

## Integration Requests / Limitations

Lead integration must keep the adapter typed and preserve the qualification-only boundary. A Linux environment with functioning OCI user+mount namespace setup is required to complete the SB/FS/NET/PS/RL/ENV/LC concurrent real matrix. The current WSL2 mount restriction is an environment limitation, not a reason to weaken the frozen backend. LSM-specific enforcement beyond the host seccomp observation was not qualified.

## Commit and Readiness

Implementation commit: `7ef29cb`.  
Final HEAD: `7ef29cb`.  
Git status: must be clean after commit.

**READY FOR LEAD INTEGRATION = NO**
