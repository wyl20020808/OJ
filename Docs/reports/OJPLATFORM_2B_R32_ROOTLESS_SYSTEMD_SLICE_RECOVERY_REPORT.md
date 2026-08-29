# OJPlatform Phase 2B-R3.2 Rootless systemd user.slice Recovery Report

Date: 2026-08-30  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`

## Status

**PARTIAL / BLOCKED.** The user-manager placement hypothesis was tested without changing host configuration. Explicit `user.slice` and runc's rootless default both produce the expected delegated hierarchy, but neither propagates finite resource properties. The first broken link remains runc-to-systemd resource propagation.

## Starting State and Git Reconciliation

- Starting HEAD: `9524cb6b46f80fba7a75675b4908ce5c180631c3`.
- Worktree and branch matched the task contract.
- R3.1 commits `10f66ca` and `06b34f1` are in ancestry.
- The accidental Phase1B commit `d986582` is only on `codex/phase1b-problem-authoring`; it is not in Runtime or `master`.
- No `stash@{0}` exists. No stash, reset, clean, merge, rebase, or cherry-pick was performed.

## Rootless Manager Context

```text
UID/GID = 0/0
XDG_RUNTIME_DIR = /run/user/0
DBUS_SESSION_BUS_ADDRESS = unix:path=/run/user/0/bus
/proc/self/cgroup = 0::/init.scope
```

The system manager reports `DefaultTasksMax=19077`, `DefaultTasksAccounting=yes`, and `DefaultMemoryAccounting=yes`. `user@0.service` is active at `/user.slice/user-0.slice/user@0.service` with `Delegate=yes`, `Delegate=pids memory cpu`, and `DelegateSubgroup=init.scope`. The user manager hierarchy exposes `cpu memory pids` and has those controllers enabled for children.

`RUNC SYSTEMD MANAGER` varies by placement: the current A path is managed by the system manager; the explicit B path is also observable through `systemctl show` in this environment even though it is under `user.slice`; the C default path is managed by `systemctl --user` and is under the user manager's delegated subtree. The manager distinction was checked with both `systemctl show` and `systemctl --user show`.

## Fixed Profile and Propagation Matrix

All cases use the same repository-owned trusted `sleep` probe, memory `8388608` bytes (8 MiB), pids `16`, rootless namespaces, seccomp policy, rootfs, and cleanup. Only the cgroupsPath/placement mode differs.

| Case | cgroupsPath | Manager / ControlGroup | OCI memory | OCI pids | MemoryMax | TasksMax | memory.max | pids.max | Result |
|---|---|---|---:|---:|---|---:|---|---:|---|
| A | `system.slice:phase2b:<id>` | system manager / `/system.slice/phase2b-<id>.scope` | 8388608 | 16 | infinity | 19077 | max | 19077 | FAIL |
| B | `user.slice:phase2b:<id>` | system manager observation / `/user.slice/phase2b-<id>.scope` | 8388608 | 16 | infinity | 19077 | max | 19077 | FAIL |
| C | empty, runc default | user manager / `/user.slice/user-0.slice/user@0.service/user.slice/runc-<id>.scope` | 8388608 | 16 | infinity | 19077 | max | 19077 | FAIL |

Case A is the current control and reproduces R3.1. Case B changes only the parent slice and reaches `/user.slice`, but finite values are still absent. Case C uses an actually empty systemd cgroupsPath with `--rootless=true`; runc chooses the expected rootless default `user.slice` hierarchy, but the properties remain unlimited. Therefore `SYSTEM.SLICE WAS ROOT CAUSE = NO`: placement is now demonstrated correct in C, while the resource propagation failure persists.

## OCI and Invocation Evidence

The real R3.1 capture wrapper copied the bundle immediately before runc launch and recorded:

```text
linux.resources.memory.limit = 8388608
linux.resources.pids.limit = 16
linux.resources.unified["memory.max"] = 8388608
linux.resources.unified["pids.max"] = 16
```

The current Supervisor invocation is:

```text
--systemd-cgroup --rootless=auto run --bundle <bundle> <id>
```

The B diagnostic uses the same invocation with only `system.slice` changed to `user.slice`. C uses:

```text
--systemd-cgroup --rootless=true run --bundle <bundle> <id>
```

with an empty `linux.cgroupsPath`, allowing runc to choose its default. No standard resource field was removed or replaced by unified fields in production; unified values were retained only as existing diagnostic evidence.

## Direct Upstream-Style Control

The direct control bypassed `Supervisor.Run` and invoked `/usr/bin/runc --debug --systemd-cgroup --rootless=true` with `user.slice:runc:<id>` and finite standard OCI resources. It created a rootless user-slice scope, then failed during container initialization at `remount-private ... permission denied` for the temporary rootfs. The debug log showed namespace setup and no finite MemoryMax/TasksMax application; because the container did not reach a stable target cgroup, this is **NOT QUALIFIED** as either a resource PASS or a propagation PASS.

## Debug Error Visibility

Diagnostic Supervisor constructors and the direct control enable runc debug logging. Logs showed normal rootless namespace setup, `F_GET_SEALS`/overlayfs diagnostics, and in the direct control the rootfs `remount-private` permission error. No log established a finite resource property application, and no successful runc exit was treated as proof of enforcement. The hard evidence remains the observed `MemoryMax`, `TasksMax`, `memory.max`, and `pids.max` values.

## First Broken Link and Root Cause

**FIRST BROKEN LINK = RUNC -> SYSTEMD RESOURCE PROPAGATION.**

Profile/request normalization, Supervisor mapping, real serialized OCI, systemd-form paths, explicit user.slice placement, and runc's rootless default placement all execute as expected. Systemd can independently apply finite values through `systemd-run --user --scope -p MemoryMax=8M -p TasksMax=4`, but runc-created scopes do not receive those values. The `19077` pids value is the host systemd `DefaultTasksMax`, not the requested profile limit.

## Enforcement and Security Results

- Real memory enforcement: **FAIL**. `memory.max=max`; no kernel OOM event attributable to the intended 8 MiB policy.
- Real pids enforcement: **FAIL**. `pids.max=19077` or `max`; bounded fanout was not capped at 16 and `pids.events` remained zero.
- Concurrent independent resource isolation: **NOT QUALIFIED / FAIL** because no case has finite target limits.
- Three repeated memory/pids enforcement cycles: **FAIL** for the same missing finite limits.
- Cleanup: **PASS** for executed Supervisor runs and diagnostic scopes.
- Rootless runc: preserved.
- User, mount, PID, and network namespaces: preserved.
- Seccomp mode 2, zero effective capabilities, filesystem isolation, and `/mnt/c`/`/mnt/d` absence: preserved.
- No privileged guest, host process runner, host watcher, post-start `set-property`, `runc update`, or weak fallback was introduced.

## Host Configuration, Fix, and Rollback

No `Delegate=`, `user@.service`, `system.conf`, WSL, or persistent systemd configuration was changed. No production resource repair is claimed. R3.2 code changes are diagnostic-only: an empty-path test constructor and debug-enabled diagnostic constructors; the default `New` production path remains unchanged. Rollback is reverting the R3.2 commit; no daemon reload or restart is required.

## Tests

- `gofmt`: PASS.
- `go test ./...`: PASS.
- `go vet ./...`: PASS.
- Focused A/B/C and direct upstream-style real runc diagnostics: PASS as diagnostic tests, with resource hard gates explicitly failing or not qualified.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, `pnpm build`: PASS.
- `git diff --check`: PASS.

## Commits and Git Status

- Starting HEAD: `9524cb6b46f80fba7a75675b4908ce5c180631c3`.
- Prior R3.1 evidence/report commits: `10f66ca`, `06b34f1`.
- Final R3.2 delivery HEAD is recorded in the final response after the report commit.
- Final `git status --short` is clean.

**PHASE 2B-R3.2 ROOTLESS SYSTEMD SLICE RECOVERY = PARTIAL / BLOCKED**  
**READY FOR R4 FINAL RUNTIME REQUALIFICATION = NO**  
**READY FOR PHASE 2B LEAD INTEGRATION = NO**
