# Docker Phase 6B-4 Sandbox Privilege Hardening Report

## Live Baseline

- Canonical root: `D:\OJPlatform`, clean `main` at `7677c0391e2218e7f0fad8ee61e18bd20539278c`.
- Feature branch: `codex/docker-phase6b4-sandbox-privilege-hardening-v1`.
- Feature worktree: `D:\OJPlatform-worktrees\docker-phase6b4-sandbox-privilege-hardening-v1`.
- Existing stashes, branches, and worktrees were preserved. Main merge was not performed.

## Files Changed

- `tests/execution-cell-docker-boundary.test.ts`: runtime-source, provisioning, and trusted WSL Docker-operator gates.
- `scripts/dev-runtime.ps1`, `scripts/infra.mjs`, `scripts/infra-wait.mjs`, `scripts/qualify-migration-architecture.mjs`: Windows Docker infrastructure commands now use explicit trusted WSL root operator rather than the sandbox account.
- `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md`: sandbox account privilege boundary and WSL evidence.
- `Docs/OJPLATFORM_CURRENT_HANDOFF.md`, `Docs/PROJECT_STATUS.md`, and this report.

## Host Environment

Qualification host is Windows with Ubuntu 24.04.4 LTS under WSL2, kernel `6.18.33.2-microsoft-standard-WSL2`, `x86_64`. Docker Engine is 29.7.2 with `overlayfs`, systemd cgroup driver, and cgroup v2. Direct runtime backend is `/usr/bin/runc` 1.4.3. `/sys/fs/cgroup` is `cgroup2fs` mounted `rw,nosuid,nodev,noexec,relatime,nsdelegate`.

This is Windows/WSL qualification, not production Linux server qualification.

## oj-sandbox Before State

- Account: `oj-sandbox:x:1000:1000::/home/oj-sandbox:/bin/bash`.
- Primary group: `oj-sandbox` GID 1000.
- Supplementary group: `docker` GID 989.
- Existing lingering systemd user-manager process carried groups `989 1000`.
- Docker CLI and direct `/_ping` socket request both reached Docker Engine as `oj-sandbox`.
- No Worker, Supervisor, Host Agent, or Judge process was running; port 19092 had no listener.

## Docker Socket Ownership / Permissions

`/var/run/docker.sock` remained a socket owned by `root:docker`, mode `0660`, GID 989. Socket ownership, mode, ACL, daemon configuration, and daemon process were not changed.

## Execution Cell Docker Dependency Audit

Production source under Worker, Host Agent, and Supervisor was searched for Docker CLI/API/socket, `DOCKER_HOST`, containerd, nerdctl, and podman. No runtime dependency exists. Only two execution-tree references remain: the fixed trusted probe verifies `/var/run/docker.sock` is absent inside a sandbox, and its real test checks that denial.

Docker references outside the execution path were classified as:

- deployment/infrastructure management through Compose;
- offline trusted compiler-rootfs image construction;
- isolated Redis/migration qualification helpers;
- negative sandbox security checks.

Windows infrastructure helpers previously inherited Docker access from the WSL default account, which is `oj-sandbox` on this machine. They now invoke Docker explicitly as the trusted WSL root operator. This preserves development infrastructure management without granting Docker capability to Supervisor or sandbox identity.

## Worker Identity

No Worker process was active. Current local Runtime Manager builds a Windows `judge-worker.exe`; Host Agent starts it as a child under the trusted Windows/operator context. Worker is not `oj-sandbox`, has no Docker source dependency, and keeps Judge Service, Redis ACL, and loopback Supervisor clients only.

## Supervisor Identity

Supervisor runs as non-root `oj-sandbox` UID/GID 1000/1000 through a delegated systemd user unit. The controlled post-removal Supervisor process had only group 1000 and bound only `127.0.0.1:19624`. Production contract remains `127.0.0.1:19092`; shared Supervisor was not started or modified.

## Sandbox Identity

OCI guest UID/GID 0 maps to host UID/GID 1000/1000 through a one-entry user-namespace map. Guest capabilities are empty and `noNewPrivileges` remains enabled. Host `oj-sandbox` now has only its primary group.

## runc Dependency

Supervisor executes fixed `/usr/bin/runc --rootless=true --systemd-cgroup` commands directly. Source and live trusted-probe evidence show no Docker CLI/API mediation. `runc` and a full trusted lifecycle remained operational after Docker-group removal.

## cgroup Dependency

Cgroup v2 memory and pids controllers remained exposed and delegated under `user.slice/user-1000.slice/user@1000.service`; subtree control included cpu, memory, and pids. This comes from systemd user management and `Delegate=yes`, not Docker. Trusted probe created and removed only ephemeral qualification scopes. No cgroup configuration was changed.

## Namespace Dependency

Fresh `oj-sandbox` context created user, PID, mount, IPC, UTS, and network namespaces directly through the Linux kernel. The trusted runc probe also passed namespace identity checks. No Docker namespace was used.

## Compiler Rootfs Dependency

`/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1` remained root-owned mode `0555`. Identity and content-manifest digest matched `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`; Supervisor full content verification and real-execution preflight passed. Runtime consumes the filesystem tree directly. Docker is used only by the separate offline build tool, not execution.

## Provisioning Audit

Repository scripts, deployment configuration, cloud/systemd paths, and host persistent setup paths contained no command that adds `oj-sandbox` to `docker`. Membership was stored in `/etc/group` and `/etc/gshadow` only. New CI test rejects future `usermod`, `gpasswd`, or `adduser` Docker-group provisioning and rejects Docker dependencies in production execution-cell source.

Fresh Linux provisioning must create `oj-sandbox` without broad supplementary groups. Docker infrastructure/build operations belong to a separate trusted operator identity.

## Removal Plan

Preconditions required all Docker dependency results to be `NO`; they passed before mutation. Planned minimal change was `gpasswd -d oj-sandbox docker`. Rollback command was `gpasswd -a oj-sandbox docker`, permitted only if a real safe-design execution dependency was proven. No rollback criterion occurred.

## Docker Group Removal

Root executed only `gpasswd -d oj-sandbox docker`. Other account groups and socket configuration were not edited. `/etc/group` now shows an empty Docker member list; `oj-sandbox` has only GID 1000.

## Fresh Session Verification

A new `runuser` process immediately showed only group 1000. The old lingering systemd user manager was separately recorded with cached groups `989 1000`; it was terminated after confirming no shared OJPlatform process existed. Because WSL did not immediately reactivate the lingering manager, root started the existing `user@1000.service`; the refreshed manager and a transient fresh systemd-user process both showed only group 1000. Linger remains enabled. No shared OJPlatform service was restarted.

## Docker Socket Denial

A fresh `oj-sandbox` Python AF_UNIX connection to `/var/run/docker.sock` failed with `PermissionError: [Errno 13] Permission denied`. The socket stayed `root:docker` mode `0660`; no socket workaround or ACL was added.

## Docker Daemon Denial

A fresh `oj-sandbox` `docker version` reached the installed CLI but failed to connect to the Docker API with permission denied. This proves denial by socket permissions, not merely missing CLI. No list/create/exec/mount operation or exploit was attempted. Trusted root operator retained Docker access for infrastructure management.

## Sandbox Preflight

Post-removal real-execution preflight passed as UID/GID 1000/1000 with only primary group. It verified non-root identity, running user manager and bus, cgroup v2 delegation, `/usr/bin/runc`, complete compiler-rootfs content, and loopback binding. Targeted fail-closed tests also passed for missing D-Bus, missing runc, and missing controller delegation.

## Trusted Qualification Probe

A current-source Supervisor and statically linked fixed trusted probe ran in task-owned temporary paths on alternate loopback port 19624. `SANDBOX_PROBE_QUALIFICATION` returned `SANDBOX_PROBE_SUCCEEDED`, `qualification_pass=true`, `qualifies_sandbox=true`, and `clean=true`. This was a fixed project probe, not a user Submission or untrusted payload. Temporary unit, process, files, port, runc state, and cgroup scope were removed.

Two initial task-harness setup attempts failed before qualification: parent-directory permission prevented execution-record creation, then a dynamically linked probe was correctly rejected. Task-only harness setup was corrected; product source and host security controls were not weakened.

## Worker Regression

Worker Go tests passed: 84 tests across 10 packages. `go vet ./...` passed. No Worker networking, Redis ACL, control-plane, or claim behavior changed.

## Supervisor Regression

Current-source controlled Supervisor startup, real-execution preflight, trusted runc probe, cleanup, loopback bind, identity, and Docker-group denial passed. Targeted tests `TestCompilerProfileIsFixedAndFinite`, `TestRealR4NonRootPreflightContract`, and `TestControllerDelegationFailsClosed` passed; `go vet ./...` passed.

A broad Supervisor unit attempt retained two pre-existing baseline failures documented in Phase 6B-2: `TestOCIConfigCarriesFiniteResources` expects the root-oriented cgroup path, and `TestProductionSupervisorRejectsRootQualification` uses a missing probe before reaching its UID assertion. All other packages passed. No Supervisor source changed to mask this debt.

## Host Agent Regression

Targeted Host Agent tests passed. Source audit confirmed no Docker CLI/API/socket dependency. Host Agent source and groups were not modified.

## Persistent Provisioning State

`/etc/group` and `/etc/gshadow` persist the removal. No cloud-init, systemd, local provisioning, or repository script re-adds membership. Windows Docker helpers now select trusted WSL root explicitly; normal `wsl docker ...` as default `oj-sandbox` is denied by design.

## No Privilege Substitution

No sudo Worker/Supervisor, privileged container, `CAP_SYS_ADMIN`, setuid helper, broad chmod/chown, socket mode/group change, proxy socket, public Supervisor, host network, or unsandboxed fallback was introduced. Explicit root use is confined to trusted Docker infrastructure management, whose daemon access is already root-equivalent; it is not available to execution-cell processes.

## WSL Qualification

`WINDOWS_WSL_SANDBOX_PRIVILEGE_HARDENING = PASS`. Account/group, fresh-session, socket/API denial, rootless runc, cgroup, namespace, compiler-rootfs, loopback Supervisor, trusted probe, fail-closed preflight, and cleanup evidence passed on Ubuntu 24.04 WSL2 amd64.

## Remaining Production Work

Both known HIGH production blockers—Worker Redis ACL and `oj-sandbox` Docker-group membership—are resolved. Production Judge remains unqualified. Phase 6B-5 must run full disposable-host sandbox security regression; Phase 6B-6 must perform production Linux qualification. Linux amd64 full Judge remains `PARTIAL`; Linux ARM64 is `NOT QUALIFIED`; Mac Judge is `NOT TARGET`.

## Validation

- Execution-cell Docker/provisioning/operator gate plus Host Agent Vitest: 9 passed.
- Worker Go tests: 84 passed across 10 packages; `go vet ./...`: PASS.
- Supervisor focused tests: 3 passed; `go vet ./...`: PASS.
- Trusted Supervisor preflight/runc probe/cleanup: PASS.
- Architecture gate and root TypeScript typecheck: PASS.
- Targeted ESLint, Prettier, Node syntax, PowerShell parser, and Runtime Manager ownership tests: PASS.
- Trusted-operator infrastructure helper read-only Compose render: PASS.
- `git diff --check`, secret scan, host final-state check, and handoff line count: PASS.

## Risks

- WSL default user is currently `oj-sandbox`; manual Docker commands in that default context now fail intentionally. Trusted infrastructure helpers use explicit root. Production should use a separate non-root operator instead of relying on WSL root convenience.
- Existing Supervisor unit-test debt remains; targeted live evidence passed, but debt should be repaired separately without weakening non-root behavior.
- WSL evidence does not substitute for disposable native Linux security regression.
- Docker daemon, root operator, kernel, runc, and systemd remain trusted-host dependencies; removing Docker group narrows only the Supervisor account.

## Handoff

Phase 6B-4 is PASS on the feature branch. Worker Redis ACL and sandbox Docker-group HIGH blockers are resolved. Production Judge remains NO. Phase 6B-5 is next; Phase 6B-4 does not include full security regression.

## Commit

- Branch: `codex/docker-phase6b4-sandbox-privilege-hardening-v1`.
- Commit message: `security: remove sandbox Docker daemon privilege`.
- Main merge: not performed.

## Next Phase

Phase 6B-5: full sandbox security regression on a disposable Linux amd64 host, using `GPT-5.6 Sol` with high reasoning. Do not start it in this task and do not claim production qualification before Phase 6B-5 and Phase 6B-6 pass.
