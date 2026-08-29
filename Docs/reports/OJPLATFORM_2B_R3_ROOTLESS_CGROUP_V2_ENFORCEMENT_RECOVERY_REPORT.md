# OJPlatform Phase 2B-R3 Rootless cgroup v2 Enforcement Recovery Report

Date: 2026-08-30  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`  
Common baseline: `ebf2e06`

## Status

**PARTIAL / BLOCKED**. R3 identified the first broken link and preserved the rootless namespace backend, but did not establish finite kernel-enforced memory/pids limits. No pseudo-fix, privileged guest, host watcher, post-start mutation, or arbitrary execution was accepted.

## Provenance and Versions

Starting HEAD: `0a27f072e51f2c28ce984276041f9a64f6264616` (R2 descendant). `ebf2e06`, `9496095`, and `91daf87` are ancestors. R3 implementation commit: `5ec5586e6b5f47776235b8907f233a0295911a01`; final documentation follow-up is recorded in `git log`. `git status --short` is clean after commit. Environment: Ubuntu 24.04 WSL2, kernel `6.18.33.2-microsoft-standard-WSL2`, UID/GID `0/0`, `/usr/bin/runc` `1.4.3`, systemd `255.4-1ubuntu8.17`, cgroup filesystem `cgroup2fs`. Host `/sys/fs/cgroup` controllers are `cpuset cpu io memory hugetlb pids rdma`; root subtree control enables the same controllers. D-Bus/systemd user manager is running; `user@0.service` is active with `Delegate=yes` and `cpu memory pids` available/enabled in its subtree.

## Actual cgroup Topology

```
systemd system manager (system.slice)
  -> transient runc scope: /system.slice/phase2b-sbx-<id>.scope
     Delegate=yes, MemoryAccounting=yes, TasksAccounting=yes
     -> sandbox PID 1 (user namespace UID/GID 0, host mapping 65534)
```

The user manager is active at `/user.slice/user-0.slice/user@0.service` with `Delegate=yes`; its `cgroup.controllers` and `cgroup.subtree_control` contain `cpu memory pids`, but the runc invocation from this root Supervisor uses the system manager and places scopes under `system.slice`. A live transient-scope test captured `ControlGroup=/system.slice/phase2b-sbx-<id>.scope`, `Delegate=yes`, `MemoryAccounting=yes`, `TasksAccounting=yes`, `MemoryMax=infinity`, and `TasksMax=19077`; current memory pressure observation showed `memory.max=max`, `memory.current=0`, and zero OOM events. Thus controller availability and process membership are present, but finite policy is not delegated to the actual leaf.

## OCI and runc Propagation

The server-owned `ociConfig` builder and regression test carry finite values before launch: `linux.resources.memory.limit=8388608` (for the memory profile), `linux.resources.pids.limit=4`, CPU quota/period finite, and `linux.cgroupsPath=system.slice:phase2b:<sandbox-id>`. Supervisor invokes runc with the global `--systemd-cgroup` option and the selected container ID. The generated policy has no unlimited sentinel. Therefore the first broken link is after OCI generation and runc driver selection: systemd scope property translation/delegation does not apply OCI memory/pids limits in this rootless environment.

## Controlled Experiments

| Experiment | Variable changed | Expected | Actual | Decision |
|---|---|---|---|---|
| E1 | Current Supervisor, systemd driver, finite OCI | finite scope/leaf limits | OCI builder finite; scope `MemoryMax=infinity`, `TasksMax=19077`; leaf `memory.max=max` | blocker reproduced |
| E2 | Minimal direct rootless runc with same config/driver | same loss point | same systemd scope behavior | no improvement |
| E3 | Capture transient scope properties | correlate OCI to systemd | `Delegate=yes`, accounting enabled, finite properties absent | confirms first broken link |
| E4 | Existing user-manager delegation (`Delegate=yes`) | finite delegated controllers | controllers available but actual system scope remains unlimited | insufficient |
| E5 | Explicit systemd-form `system.slice:phase2b:<id>` | valid scope path | scope created, limits still unlimited | path is valid but not sufficient |

An attempted `runc update`/`systemctl set-property` mutation was rejected and removed because it was post-start, racy, and caused lifecycle hangs/created-container residue. It is not evidence or a production fix.

## Hard-Gate Results

| Gate | Result |
|---|---|
| CG-R3-01 finite memory in OCI | PASS (builder regression test) |
| CG-R3-02 finite pids in OCI | PASS (builder regression test) |
| CG-R3-03 intended runc driver/path | PASS (`--systemd-cgroup`, systemd-form path) |
| CG-R3-04 finite MemoryMax/TasksMax | FAIL (`infinity` / `19077`) |
| CG-R3-05 actual finite `memory.max` | FAIL (`max`) |
| CG-R3-06 actual finite `pids.max` | NOT QUALIFIED; scope remains unlimited |
| CG-R3-07 real memory pressure | FAIL; 8 MiB profile completed |
| CG-R3-08 bounded pids fanout | FAIL; pids=4 profile completed |
| CG-R3-09 cancel under memory pressure cleanup | NOT QUALIFIED |
| CG-R3-10 two concurrent independent finite limits | FAIL; independence cannot be claimed without finite limits |
| CG-R3-11 cgroup/runc/workspace cleanup | PASS for executed normal/profile/concurrent runs |
| CG-R3-12 three-cycle memory+pids stability | FAIL; repeated probes reproduce missing enforcement |

## Existing Isolation Spot-checks

Rootless runc, user/mount/PID/network namespaces, seccomp mode 2, zero effective capabilities, `/mnt/c` and `/mnt/d` absence, workspace marker, concurrent IDs, and cleanup remained passing in the focused R2/R3 probes. No arbitrary source or compiler/runtime was executed.

## Host Configuration, Persistence, and Rollback

No host/systemd files were changed. Existing `Delegate=yes` was observed, not modified. Therefore no daemon reload, restart, or rollback action was performed. A future accepted fix may require a narrow `user@.service` controller delegation change or a correctly delegated systemd user scope; it must document exact before/after files, perform a controlled user-manager restart, and rerun CG-R3-01..12. Do not manually set per-job properties.

## Test Evidence

- `gofmt`, `go test ./...`, `go vet ./...`: PASS.
- Focused real runc tests: isolation PASS; live transient scope properties captured; cgroup membership observed; `memory.max=max` and zero OOM events under current memory profile; memory/pids pressure profiles complete successfully.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, `pnpm build`: PASS in the R2/R3 code line.
- `git diff --check`: PASS.

## Risks and Integration Requests

The unresolved hard gate is kernel resource enforcement, not namespace isolation. Lead must not mark Phase 2B ready or map these outcomes to TLE/MLE/OLE. Provide a Linux/systemd environment where the actual runc scope receives finite `MemoryMax`/`TasksMax`, or approve a narrowly documented delegated-subtree repair. Backend reconsideration may be required only after correct OCI, driver, path, and delegation evidence still fails. No changes were made to Auth, Web, shared contracts, `PROJECT_STATUS`, Lead Integration, or Phase 2C.

## Final State

R1 commits present: `9496095`, `91daf87`. R2 baseline: `0a27f07`. R3 implementation/report commit: `5ec5586`; final documentation follow-up is recorded in `git log`. Final worktree is clean.

**PHASE 2B-R3 CGROUP RECOVERY = PARTIAL / BLOCKED**  
**READY FOR R4 FINAL RUNTIME REQUALIFICATION = NO**  
**READY FOR PHASE 2B LEAD INTEGRATION = NO**
