# OJPlatform PHASE 2B-R3.4 Report

## Qualification Identity

- Goal: `PHASE 2B-R3.4 — TRUE NON-ROOT WSL SUPERVISOR & CGROUP V2 DELEGATION QUALIFICATION`
- Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
- Branch: `codex/phase2b-sandbox-runtime`
- Starting HEAD: `7bb522918b73369bf5c621efc027174930b4c7aa`
- Final HEAD at qualification commit: `e1ea0fc` (report finalization is the immediately following documentation commit)
- Result: `PASS` for this qualification; production service migration remains a follow-up recommendation.

## Host Identity and Changes

The original Supervisor execution identity was UID/EUID/GID `0/0/0` (`root`). The dedicated qualification account is:

| Field | Evidence |
| --- | --- |
| Username | `oj-sandbox` |
| UID/GID | `1000/1000` |
| Supplementary groups | only `oj-sandbox` (no `sudo`, `docker`, `root`, `disk`, `adm`) |
| `/etc/subuid` | `oj-sandbox:100000:65536` |
| `/etc/subgid` | `oj-sandbox:100000:65536` |
| `newuidmap`/`newgidmap` | not installed; qualification uses the explicit one-entry map `0 -> 1000` |
| Linger | enabled with `loginctl enable-linger oj-sandbox` |

No project database secrets, Docker socket, broad project-tree write access, system slice configuration, systemd unit file, or WSL configuration was changed. Host changes are limited to the account, subordinate-ID entries, and linger state.

Rollback:

```text
loginctl disable-linger oj-sandbox
userdel oj-sandbox
remove the oj-sandbox lines from /etc/subuid and /etc/subgid
```

## Systemd User Manager and Cgroup Hierarchy

For UID 1000:

- `XDG_RUNTIME_DIR=/run/user/1000`
- `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`
- `/run/user/1000` exists and is owned by `oj-sandbox`
- `systemctl --user is-system-running` returned `running`
- manager cgroup: `/user.slice/user-1000.slice/user@1000.service`
- manager controllers: `cpu memory pids`
- manager `cgroup.subtree_control`: `cpu memory pids`
- manager `cgroup.type`: `domain`
- manager `memory.max`: `max`
- manager `pids.max`: `max`

The runc-created child scope is placed below the user manager, for example:

```text
/user.slice/user-1000.slice/user@1000.service/user.slice/runc-r34-direct-<id>.scope
```

The delegated scope reported `Delegate=yes`, `cgroup.controllers=cpu memory pids`, and finite resource files after waiting for runc's post-start `Set` phase. The initial transient `infinity`/default values were an observation race, not the final state.

## Direct Non-root Runc

The direct test ran as UID 1000 with `--systemd-cgroup --rootless=true`, trusted probe only, and the R1 bundle prerequisites (`/dev`, `/proc`, `/tmp`, traversal permissions) intact.

- Mapping: container UID/GID 0 -> host UID/GID 1000
- `cgroupsPath`: `user.slice:runc:<id>`
- ControlGroup: `/user.slice/user-1000.slice/user@1000.service/user.slice/runc-<id>.scope`
- OCI memory limit: `67108864`
- OCI pids limit: `16`
- `MemoryMax=67108864`
- `TasksMax=16`
- `memory.max=67108864`
- `pids.max=16`
- `pids.current=5` during the trusted sleep probe
- `memory.events` and `pids.events` were captured from the live scope

Trusted probe evidence remained intact: guest UID/GID 0 in an active user namespace, PID namespace init, zero effective capabilities, `NoNewPrivileges`, seccomp mode 2, no `/mnt/c`, `/mnt/d`, or `/host`, and no default network route.

The `rootless=false` comparison failed with the expected unprivileged D-Bus error (`Interactive authentication required`), confirming that the qualification depends on the rootless user manager path rather than privileged fallback.

## Supervisor Non-root Result

The diagnostic Supervisor harness ran in the same UID 1000 environment with the same trusted sleep profile and user D-Bus variables. Its scope was:

```text
/user.slice/user-1000.slice/user@1000.service/user.slice/phase2b-sbx-<id>.scope
```

After waiting for finite properties:

- `MemoryMax=67108864`
- `TasksMax=16`
- `memory.max=67108864`
- `pids.max=16`
- `Delegate=yes`
- cleanup: PASS (`Clean=true`)

The production `New(...)` constructor was not changed to silently assume a UID; the non-root mapping is an explicit qualification-only constructor. The evidence supports migrating the real Sandbox Supervisor to a dedicated non-root service account in a later approved deployment change.

## Kernel Enforcement

Pressure was run only after finite `memory.max` and `pids.max` were observed.

- Memory: `memory.max=33554432`; bounded 64 MiB trusted allocation produced `memory.events max > 0` (and in one run exit status 137). This is kernel cgroup evidence, not a wall timeout.
- Pids: `pids.max=16`; bounded 64-child fanout produced `pids.events max > 0` with all children cleaned up.
- Concurrent qualification: two independent scopes used `(memory.max=33554432,pids.max=16)` and `(memory.max=67108864,pids.max=8)`. Each scope retained its own limit and generated only its corresponding pressure evidence.
- Repeated qualification: memory pressure + pids pressure + cleanup passed `3/3` cycles. No process, scope, cgroup, workspace, or DBus/systemd leak was observed.

## Root vs Non-root Comparison

| Dimension | Original UID 0 model | Dedicated UID 1000 model |
| --- | --- | --- |
| Host UID/EUID | `0/0` | `1000/1000` |
| User manager | root user manager / `user-0.slice` evidence | `systemctl --user` running for `oj-sandbox` |
| Control group | default/inherited limits in R3.3 | delegated `user@1000.service/user.slice` scope |
| OCI memory/pids | `8388608` / `16` | `67108864` / `16` |
| MemoryMax / TasksMax | `infinity` / `19077` | `67108864` / `16` |
| memory.max / pids.max | `max` / `19077` | `67108864` / `16` |
| Memory enforcement | not qualified in UID0 model | kernel `memory.events` evidence, PASS |
| Pids enforcement | not qualified in UID0 model | kernel `pids.events` evidence, PASS |

Root cause of the R3.3 gap: Supervisor execution identity and systemd user delegation model. The dedicated non-root user manager provides the correct delegated subtree and runc systemd driver path.

## Security Model

Preserved: rootless runc, OCI user namespace, PID/mount/network/IPC/UTS namespaces, dropped capabilities, `NoNewPrivileges`, seccomp, filesystem isolation, and cgroup limits. No privileged guest, host PID/network/mount namespace, disabled seccomp, disabled user namespace, arbitrary submission, compiler, judge, or real verdict execution was used.

## Tests and Evidence

Executed:

```text
gofmt -w apps/sandbox-supervisor/internal/supervisor/real_test.go
go test ./...                         PASS
go vet ./...                          PASS
focused non-root qualification tests  PASS
focused kernel enforcement tests       PASS
focused concurrent limits              PASS
3-cycle pressure/cleanup               PASS (3/3)
git diff --check                       PASS
```

The focused tests were run as `oj-sandbox` with `OJPLATFORM_SANDBOX_REAL_TEST=true` and the trusted probe only.

## Commit and Final State

- Qualification commit: `e1ea0fc` (`test: qualify true non-root cgroup delegation`)
- Report finalization commit: recorded by `git log` after this file update
- `PROJECT_STATUS` was intentionally not modified.
- No merge, R4, Lead Integration, Phase 2C, or production Supervisor migration was started.
- Final worktree status: clean after the report finalization commit.

## Completion

`READY FOR R4 FINAL RUNTIME REQUALIFICATION = YES`  
`READY FOR PHASE 2B LEAD INTEGRATION = NO`
