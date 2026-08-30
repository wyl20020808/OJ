# OJPlatform Phase 2B-R3.1 Resource Propagation Forensics and Repair Report

Date: 2026-08-30  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`  
Branch: `codex/phase2b-sandbox-runtime`

## Status

**PARTIAL / BLOCKED.** The request/profile and real OCI values are finite, and the intended runc driver/path are active. The first broken link is resource property propagation from runc into the systemd scope. No production repair was accepted because the target cgroup remains unlimited and kernel enforcement was not demonstrated.

## Starting State and Git Reconciliation

- Starting HEAD: `06b34f1cee61c39c55d63490d3893c5bc8e335b8`.
- `10f66ca` and `06b34f1` are ancestors of the R3.1 work.
- Wrong Phase1B commit `d986582` exists only on `codex/phase1b-problem-authoring`; it is not an ancestor of Runtime and is not in `master`.
- `stash@{0}` does not exist; no stash was changed, popped, or dropped.
- The accidental Phase1B execution therefore did not affect the Runtime branch or `master`.

## Profile and End-to-End Trace

The single trusted qualification profile used for the real trace was the existing memory profile with `SandboxJobID` and `CorrelationID` `r31-memory-8m-pids-16`, memory `8 MiB` (`8388608` bytes), and pids `16`. The probe was the repository-owned `SANDBOX_PROBE_QUALIFICATION` artifact; no user submission, compiler, judge, or arbitrary executable was run.

| Stage | Expected memory | Actual memory | Expected pids | Actual pids | Source / evidence |
|---|---:|---:|---:|---:|---|
| Profile/request | 8388608 | 8388608 | 16 | 16 | `model.Request`, `Validate`, real test log |
| Supervisor normalized policy | 8388608 | 8388608 | 16 | 16 | `ociConfig` and captured real bundle |
| OCI `config.json` | 8388608 | 8388608 | 16 | 16 | wrapper copied the bundle before runc run |
| runc/systemd scope property | 8388608 | `infinity` | 16 | `19077` | live `systemctl show` on the real scope |
| kernel cgroup files | 8388608 | `max` | 16 | `19077` | live target cgroup files |

### Request and OCI Evidence

The captured real `config.json` contained:

```text
linux.cgroupsPath = system.slice:phase2b:sbx-<id>
linux.resources.memory.limit = 8388608
linux.resources.pids.limit = 16
linux.resources.unified["memory.max"] = 8388608
linux.resources.unified["pids.max"] = 16
```

The real runc wrapper recorded:

```text
--systemd-cgroup
--rootless=auto
run --bundle <bundle> sbx-<id>
```

Cleanup invocations were also recorded as `--systemd-cgroup delete --force <id>` and `state <id>`. The production path therefore uses the systemd driver and does not omit the finite values before launch.

## Systemd and Cgroup Forensics

- Systemd unit: `phase2b-sbx-<id>.scope`.
- ControlGroup: `/system.slice/phase2b-sbx-<id>.scope`.
- `Slice=system.slice`.
- `Delegate=yes`.
- `MemoryAccounting=yes`.
- `TasksAccounting=yes`.
- `MemoryMax=infinity`.
- `TasksMax=19077`.
- Target files: `memory.max=max`, `pids.max=19077`.
- During the trusted memory probe, `memory.events` remained zero and no finite memory limit was present.
- During the bounded pids probe, `pids.events max` remained zero and the probe completed without kernel pids enforcement.
- `cgroup.procs` and the probe-reported cgroup confirmed membership in the target scope, not merely its parent.

The value `19077` is the host systemd default: `systemctl show` and `systemctl --user show` report `DefaultTasksMax=19077`; the systemd manager reports `DefaultTasksAccounting=yes` and `DefaultMemoryAccounting=yes`. It is inherited/default task accounting, not the requested pids value `16`.

## Delegation Topology

The host is Ubuntu 24.04 WSL2, kernel `6.18.33.2-microsoft-standard-WSL2`, runc `1.4.3`, systemd `255.4-1ubuntu8.17`, cgroup v2. Root controllers include `memory` and `pids`; the user manager hierarchy exposes `cpu memory pids` and has `Delegate=yes`. `user@.service` contains `Delegate=pids memory cpu`, `DelegateSubgroup=init.scope`, and unlimited service-level task/memory properties.

The actual production scope remains under the system manager `system.slice`. Explicit user-bus and `--rootless=true` diagnostics placed scopes under the delegated user-manager path, but still produced `memory.max=max` and `pids.max=19077`. Moving a cgroupfs parent under `/user.slice/user-0.slice/user@0.service` also left both limits unlimited. Controller availability/delegation is therefore present but does not repair runc's finite property translation.

## First Broken Link and Root Cause

**FIRST BROKEN LINK = RUNC -> SYSTEMD RESOURCE PROPAGATION.**

Finite values survive the profile, request validation, Supervisor normalization, serialized real OCI config, runc driver selection, and valid systemd-form `cgroupsPath`. The actual scope is created and delegated, but runc/systemd does not translate the OCI memory/pids values into `MemoryMax`/`TasksMax`. The systemd control experiment independently succeeded with `systemd-run --user --scope -p MemoryMax=8M -p TasksMax=4`, so the host systemd property mechanism itself is functional.

## Repair Decision

No production repair was made. Changing delegation, using `systemctl set-property`, using `runc update`, host watchers, wall-time behavior, privileged guests, or disabled namespaces/seccomp would be pseudo-fixes or violate the task contract. The only code addition in R3.1 is a trusted real-test wrapper that captures the exact config and argv before delegating to the same `/usr/bin/runc` binary.

## Enforcement, Concurrency, Repetition, and Cleanup

- Real memory pressure enforcement: **FAIL**; `memory.max=max`, no OOM event, and the bounded profile completed or was stopped only by the Supervisor backstop.
- Real pids fanout enforcement: **FAIL**; `pids.max=19077`/`max`, no pids event, and bounded fanout completed.
- Concurrent independent limits: **FAIL / NOT QUALIFIED** because neither sandbox received finite target limits.
- Repeated 3-cycle stability: **FAIL** for the same reason; repeated diagnostics reproduced unlimited values. Normal cleanup passed for executed runs.
- Cleanup: **PASS** for runc state, cgroup, workspace, and temporary bundle cleanup in the real tests.

## Security Preservation

Rootless runc, user/mount/PID/network namespaces, seccomp mode 2, zero effective capabilities, `/mnt/c` and `/mnt/d` absence, workspace isolation, output limit, wall-time backstop, concurrency identity, and cleanup remained passing in the focused qualification. No user code or compiler/runtime was executed, and no weak fallback was introduced.

## Host Configuration and Rollback

No host, WSL, systemd unit, drop-in, delegation, or persistent configuration was changed. Rollback is therefore limited to reverting the R3.1 test/report commit; no daemon reload or restart was performed.

## Tests and Evidence

- `gofmt`: PASS.
- `go test ./...`: PASS.
- `go vet ./...`: PASS.
- Focused real runc tests: PASS as diagnostic tests, with the hard enforcement gates explicitly failing as recorded above.
- R3.1 real propagation test: PASS as an evidence test; captured finite OCI and the exact runc invocation.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:architecture`, `pnpm build`: PASS.
- `git diff --check`: PASS.

## Commits and Final State

- Starting R3.1 HEAD: `06b34f1cee61c39c55d63490d3893c5bc8e335b8`.
- R3 history retained: `5ec5586`, `201cda1`, `10f66ca`, `06b34f1`.
- Final R3.1 delivery HEAD is recorded in the final response and `git rev-parse HEAD` after the report commit.
- Final `git status --short` is clean.

**PHASE 2B-R3.1 RESOURCE PROPAGATION RECOVERY = PARTIAL / BLOCKED**  
**READY FOR R4 FINAL RUNTIME REQUALIFICATION = NO**  
**READY FOR PHASE 2B LEAD INTEGRATION = NO**
