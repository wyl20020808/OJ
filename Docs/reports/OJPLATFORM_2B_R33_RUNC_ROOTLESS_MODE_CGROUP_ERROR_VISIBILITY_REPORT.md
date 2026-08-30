# OJPlatform Phase 2B-R3.3 runc Rootless Mode and cgroup Error Visibility Report

Date: 2026-08-30  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`

## Status

**PARTIAL / BLOCKED.** R3.3 separated host identity, OCI user namespace identity, and runc rootless-cgroup mode. The installed runc 1.4.3 behavior and real probes show that the Supervisor is executed by host UID 0, while the guest still uses an OCI user namespace mapping. Explicit `--rootless=true` does not produce finite cgroup limits. `auto` and `false` did not yield a stable finite result in the same root environment, so no production flag change is claimed.

## Git and Reconciliation

- Starting HEAD: `682d21d0b29363d630130d0d94656e1d7edf10a4`.
- Prior R3.2 report/commit is present in ancestry.
- The wrong Phase1B commit `d986582` remains only on `codex/phase1b-problem-authoring`; it is not in Runtime or `master`.
- No `stash@{0}` exists. No destructive Git operation was used.

## Host and Container Identity

```text
SUPERVISOR HOST UID  = 0
SUPERVISOR HOST EUID = 0
SUPERVISOR HOST GID  = 0
whoami               = root
Uid                  = 0 0 0 0
Gid                  = 0 0 0 0
CapEff               = 000001ffffffffff
NoNewPrivs            = 0
XDG_RUNTIME_DIR      = /run/user/0
DBUS_SESSION_BUS_ADDRESS = unix:path=/run/user/0/bus
```

The container process is configured as UID/GID 0, but its OCI user namespace mapping is:

```text
container UID 0 -> host UID 65534
container GID 0 -> host GID 65534
```

The OCI config retains private user, mount, PID, network, IPC, and UTS namespaces plus the UID/GID mappings. User namespace isolation therefore comes from OCI namespaces and mappings, not from the `--rootless` CLI flag.

## Current Flag and runc Semantics

The production `New` constructor sets `rootlessMode: "auto"`; it does not force `--rootless=true`. The explicit `true`, `auto`, and `false` values are diagnostic constructors used by the real tests. The formal Supervisor path otherwise emits `--systemd-cgroup` and the selected `--rootless=<mode>` before `run`.

Installed runc 1.4.3 help states that `--rootless` controls whether runc **ignores cgroup permission errors**, with values `true`, `false`, or `auto`; it is not the user namespace switch. Upstream v1.4.3 source confirms:

- `process_linux.go` ignores `cgroups.ErrRootless` during initial cgroup apply when the container is rootless and has a private PID namespace.
- `fs2.Apply` returns `ErrRootless` for a no-permission/no-path/no-limit case, but returns an informative error when rootless configuration requests limits that cannot be applied.
- systemd v2 maps `memory.max` to `MemoryMax` and `pids.max` to `TasksMax`; rootless placement defaults to the user manager path and `user.slice`.
- The upstream cgroup-v2 guide documents `user.slice:runc:<id>` and `/user.slice/user-<uid>.slice/user@<uid>.service/user.slice/runc-<id>.scope`.

## Controlled Experiments

All experiments preserve the same OCI user namespace mappings, finite memory `8388608`, finite pids `16`, rootfs, namespaces, seccomp, trusted probe, and cleanup.

### Case A: `--rootless=true`

With the same `system.slice:phase2b:<id>` cgroupsPath and a valid user D-Bus environment, the scope was created at:

```text
/user.slice/user-0.slice/user@0.service/system.slice/phase2b-sbx-<id>.scope
```

`systemctl --user show` reported `ControlGroup` at that path, `Delegate=yes`, accounting enabled, `MemoryMax=infinity`, and `TasksMax=19077`. The live files were `memory.max=max` and `pids.max=19077`; events remained zero. The trusted memory probe returned a runtime error/status 137 in one run, but no finite target cgroup evidence was present.

When the same diagnostic constructor omitted the D-Bus/session environment, runc emitted the exact error:

```text
failed to connect to dbus ... could not detect DBUS_SESSION_BUS_ADDRESS from the environment
```

This is a real configuration error, not a resource enforcement result.

### Case B: `--rootless=auto`

With the same finite OCI and `system.slice` path, the system manager scope was observed at `/system.slice/phase2b-sbx-<id>.scope`. In the latest live scope scans `MemoryMax=infinity`, `TasksMax=19077`, `memory.max=max`, and `pids.max=19077`. A memory profile sometimes exited 137, but the target cgroup remained unlimited and the debug log contained no successful finite-property evidence. Auto therefore does not qualify as a repair in this host.

### Case C: `--rootless=false` (diagnostic only)

The same systemd cgroup and OCI mappings produced a system manager scope with `MemoryMax=infinity`, `TasksMax=19077`, `memory.max=max`, and `pids.max=19077` in the live diagnostic scan. It is not a production candidate; it was run only to separate rootless error handling from resource propagation.

### True non-root control

The WSL distribution currently has only the active root account (`loginctl list-users` reports UID 0; no ordinary `/home/<user>` account exists). No new administrator or user was created. A true non-root user-manager control is therefore **BLOCKED / NOT AVAILABLE**, not falsely reported as a failed enforcement test.

## Error Visibility and Interpretation

The direct debug control and Supervisor diagnostic logs captured rootless namespace setup, `F_GET_SEALS`/overlayfs diagnostics, the D-Bus detection error above, and process status 137. They did not show a finite `MemoryMax`/`TasksMax` application. Upstream's `ErrRootless` handling confirms that permission errors can be intentionally downgraded in rootless mode, but the observed missing properties cannot be called a proven masked resource failure without a non-root control or a stable permission error at the cgroup operation.

**ROOTLESS=TRUE MASKED CGROUP FAILURE = NOT PROVEN.** The mode is capable of ignoring `ErrRootless`, but this host's real evidence identifies host-root/user-manager execution and missing finite properties; it does not provide a stable exact cgroup permission error for the property application itself.

## First Broken Link and Root Cause

**FIRST BROKEN LINK = RUNC -> SYSTEMD CGROUP RESOURCE APPLICATION.**

The host process is root (`UID 0`) and the guest is UID 0 mapped to host 65534. `--rootless=true` changes runc cgroup/error semantics, not OCI userns isolation. The current root-rootless combination does not establish a stable user-manager resource path with finite properties, and `auto`/`false` are not qualified as a recovery. The exact non-resource failure in the direct upstream-style control is rootfs `remount-private ... permission denied`; the exact explicit-true environment failure is missing `DBUS_SESSION_BUS_ADDRESS`.

## Production Fix Decision

No production fix was accepted. The production constructor already defaults to `--rootless=auto`, and changing to `false` would require a new security architecture review. OCI user namespace mappings were preserved. R3.3 changes are diagnostic-only: mode comparison, live cgroup scans, debug logging, and mapping regression coverage.

## Enforcement and Security

- Real memory enforcement: **FAIL / NOT QUALIFIED**; no stable finite `memory.max` plus kernel pressure evidence.
- Real pids enforcement: **FAIL / NOT QUALIFIED**; no stable finite `pids.max` plus fanout event evidence.
- Cleanup: **PASS** for executed Supervisor diagnostics.
- Rootless runc, user/mount/PID/network namespaces, seccomp mode 2, zero guest capabilities, filesystem isolation, and `/mnt/c`/`/mnt/d` absence remain preserved.
- No privileged guest, host PID/network/mount, host process runner, watcher, wall-time substitute, post-start mutation, or weak fallback was introduced.

## Host Configuration and Rollback

No `Delegate=`, `user@.service`, systemd defaults, WSL configuration, or persistent host file was changed. Rollback is reverting the R3.3 commit; no daemon reload or restart is required.

## Tests

- `gofmt`: PASS.
- `go test ./...`: PASS.
- `go vet ./...`: PASS.
- Focused true/auto/false mode and live cgroup diagnostics: PASS as diagnostic tests, with resource gates explicitly failing or not qualified.
- Direct upstream-style debug control: PASS as a diagnostic test; rootfs remount permission error recorded.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, `pnpm build`: PASS.
- `git diff --check`: PASS.

## Commits and Final Status

- Starting HEAD: `682d21d0b29363d630130d0d94656e1d7edf10a4`.
- Final R3.3 delivery HEAD is recorded in the final response after the report commit.
- Final `git status --short` is clean.

**PHASE 2B-R3.3 RUNC ROOTLESS MODE RECOVERY = PARTIAL / BLOCKED**  
**READY FOR NEXT RESOURCE RECOVERY STEP = YES**  
**READY FOR R4 FINAL RUNTIME REQUALIFICATION = NO**  
**READY FOR PHASE 2B LEAD INTEGRATION = NO**
