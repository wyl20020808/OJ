# OJPlatform PHASE 2B-R4 Final Sandbox Runtime Requalification

## Result

`PHASE 2B SANDBOX RUNTIME R4 STATUS = PASS`

Runtime-owned qualification only. This report does not claim overall Phase 2B completion and does not start Lead Integration.

- Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
- Branch: `codex/phase2b-sandbox-runtime`
- Starting HEAD: `5763a99b60b24d694fa03a96d7f61824c20b7392`
- Final HEAD: `58f935480d9ebe7552e035fe7ddb3ef517ff400c`

## Execution Identity Contract

The previous UID0 Supervisor model is explicitly unqualified for production-intent qualification. `New(...)` enables the identity gate and user D-Bus propagation; `Preflight` fails closed before runc when the effective UID is 0, the user manager is unavailable/degraded, `XDG_RUNTIME_DIR` or the user bus is missing, memory/pids are not delegated, or runc is unavailable.

| Field | Evidence |
| --- | --- |
| Dedicated sandbox user | `oj-sandbox` |
| UID/GID | `1000/1000` |
| Supplementary groups | only `oj-sandbox`; no `sudo`, `docker`, `root`, `disk`, `adm` or equivalent |
| `/etc/subuid` | `oj-sandbox:100000:65536` |
| `/etc/subgid` | `oj-sandbox:100000:65536` |
| Linger | `Linger=yes` |
| Host Supervisor identity | UID/EUID 1000/1000 in all R4 real runs |

No Docker socket, project database secret, broad project-tree write permission, or privileged group was granted.

## User Manager and cgroup v2

After the controlled `loginctl terminate-user oj-sandbox` restart and `enable-linger` recovery:

- `XDG_RUNTIME_DIR=/run/user/1000`; `/run/user/1000` is owned by `oj-sandbox`.
- `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`.
- `systemctl --user is-system-running` returned `running`.
- Manager ControlGroup: `/user.slice/user-1000.slice/user@1000.service`.
- Root controllers: `cpuset cpu io memory hugetlb pids rdma`.
- Manager controllers: `cpu memory pids`.
- Manager `cgroup.subtree_control`: `cpu memory pids`.
- Manager `cgroup.type`: `domain`.

R4 scopes were created below the delegated user hierarchy, for example:

`/user.slice/user-1000.slice/user@1000.service/user.slice/phase2b-sbx-<id>.scope`

Each observed scope exposed finite `memory.max` and `pids.max`; the evidence collector waited for post-start systemd property application before recording values.

## Matrix Evidence

| Matrix | Result | Evidence |
| --- | --- | --- |
| SB01-SB06 | PASS | Non-root backend smoke passed; malformed limits, unknown probe, policy-version mismatch, and REAL_SUBMISSION_EXECUTION are rejected; UID0 and missing D-Bus/runc are fail-closed. |
| FS01-FS10 | PASS | Trusted probe verified workspace marker, host/project/other-job paths, `/mnt/c`, `/mnt/d`, traversal, symlink escape, outside write, `.git`, Docker socket, `/home`, `/root`, and cleanup. |
| NET01-NET10 | PASS | No default route; controlled gateway/service endpoints (5432, 6379, 9000, 8080) and DNS are denied; loopback bind is allowed; network namespace is cleaned. No scanning was used. |
| PS01-PS10 | PASS | PID namespace init, guest UID/GID 0 with host mapping 1000, zero effective capabilities, NoNewPrivileges, seccomp mode 2, mount/unshare/ptrace denial, bounded pids fanout, and unaffected Supervisor were observed. |
| RL2B-01..RL2B-10 | PASS | `cpu.max=10000 100000`; wall and output limits; finite OCI/MemoryMax/memory.max and TasksMax/pids.max; kernel `memory.events max` and `pids.events max`; cancellation and cleanup. |
| ENV01-ENV08 | PASS | Synthetic database, Redis, session/auth, and object-store secret names absent; host environment reduced to trusted values; output/workspace paths are Supervisor-controlled. |
| LC01-LC10 | PASS | Normal, timeout, cancellation, fanout, repeated, concurrent, and setup-rejection paths leave no guest process, scope, cgroup, workspace, mount, or network residue; cleanup failures remain surfaced. |
| WI01-WI06 | PASS | Typed adapter contract, no application DB dependency, REAL_SUBMISSION_EXECUTION rejection, trusted probe hash verification, cancellation propagation, and synthetic/security-only result semantics remain enforced. |

The trusted probe is fixed qualification code only. No arbitrary submission, compiler, shell, or verdict execution was run.

## Resource Qualification

Direct and Supervisor non-root runs used `--systemd-cgroup --rootless=true` with the qualified user bus and writable qualification-owned runc state.

Representative Supervisor evidence:

- OCI memory limit: `33554432` or `67108864` bytes, finite.
- OCI pids limit: `16` (one concurrent comparison used `8`), finite.
- `MemoryMax=33554432`/`67108864`; `TasksMax=16`/`8`.
- `memory.max` and `pids.max` matched the requested values in the live scope.
- Memory pressure produced `memory.events max > 0`.
- Bounded 64-child fanout produced `pids.events max > 0`.
- CPU qualification produced `cpu.max=10000 100000` and throttling counters.
- Workspace tmpfs rejected a 2 MiB growth attempt against the 1 MiB frozen profile.

Direct non-root pressure and Supervisor pressure both passed. Three Supervisor cycles each produced memory kernel events, pids kernel events, cancellation result `SANDBOX_CANCELLED`, and `Clean=true`.

Three concurrent two-sandbox cycles used distinct systemd scopes and independent `(memory.max,pids.max)` pairs. Each pressure event remained in its own scope and no result crossed between jobs.

## Root Comparison and Security

| Dimension | Previous UID0 model | R4 dedicated non-root model |
| --- | --- | --- |
| Host UID/EUID | `0/0` | `1000/1000` |
| User manager | `user-0.slice`, not qualification evidence | running `oj-sandbox` user manager |
| MemoryMax / TasksMax | `infinity` / inherited default | finite requested values |
| memory.max / pids.max | `max` / inherited default | finite requested values |
| Enforcement | not qualified | kernel `memory.events`/`pids.events` evidence |

Root cause of the R3.3 gap is the Supervisor execution identity and systemd user delegation model. The production Supervisor must run as a dedicated non-root service user: `YES`.

Preserved security properties: rootless runc, OCI user namespace, PID/mount/network/IPC/UTS namespaces, dropped capabilities, NoNewPrivileges, seccomp, filesystem isolation, network isolation, and cgroup limits. No weak privileged fallback was added.

## Host Changes and Rollback

Persistent host state consists of the existing qualification account, subordinate-ID ranges, and linger:

```text
loginctl disable-linger oj-sandbox
userdel oj-sandbox
remove the oj-sandbox entries from /etc/subuid and /etc/subgid
```

The controlled manager restart temporarily removed the runtime manager; `enable-linger` restored the same intended configuration. No Windows reboot, system.slice modification, runc update, or system-wide service migration was performed.

## Tests

PASS evidence:

```text
gofmt
go test ./...
go vet ./...
focused non-root R4 tests (preflight, SB01, CPU, workspace, resources, cancellation)
focused trusted-probe isolation and cgroup attachment
3 concurrent resource-isolation cycles
3 repeated memory/pids/cancellation cycles
controlled user-manager restart and post-restart memory/pids qualification
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test (197 passed, 3 skipped)
pnpm test:architecture
pnpm build
git diff --check
```

The broad historical `TestReal*` diagnostic aggregate was started but stopped after it produced no output for more than two minutes; it is classified `NOT VERIFIED` as an aggregate, while every R4 acceptance test and required stability run above completed independently. The stopped test process was removed and the final residue audit found no guest, child, scope, cgroup, workspace, mount, or network-namespace leak.

## Commits and Final State

- Implementation/tests: scoped commit for R4 execution-identity gating, trusted probe checks, and non-root stability evidence.
- Permanent report: scoped documentation commit immediately after implementation.
- `PROJECT_STATUS` was intentionally not modified.
- No merge, Lead Integration, Phase 2C, R4 follow-up, or arbitrary submission execution was started.
- Final `git status` and `git diff --check` are required to be clean after the two commits.

`READY FOR PHASE 2B LEAD INTEGRATION = YES`
