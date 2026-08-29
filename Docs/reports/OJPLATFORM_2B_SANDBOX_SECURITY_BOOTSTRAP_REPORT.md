# OJPlatform Phase 2B Sandbox Security Bootstrap Report

Goal: `OJPLATFORM-2B-SANDBOX-SECURITY-QUALIFICATION-BOOTSTRAP`  
Date: 2026-08-29  
Status: **PASS (BOOTSTRAP ONLY)**

## Baseline and Phase 2A Preservation

Lead started on `master` at `dd81f4e80e0b0d429b0421e36569ef6448430838`. The Phase 2A report and matrix both state PASS / real multi-process qualification complete and READY FOR PHASE 2B. The common Phase 2A baseline `6cd4b7c` and the integrated Phase 2A commits remain ancestors. No Phase 2B runtime, compiler, real submission execution, real verdict, or Contest work was started.

## Environment Audit

Observed on the actual development host:

| Capability | Evidence | Bootstrap interpretation |
|---|---|---|
| Windows host | Windows 10 x64, build 26200 | Host filesystem is outside the guest trust zone |
| WSL2 | Ubuntu 24.04, version 2 | Linux-oriented backend is viable for development qualification |
| Linux kernel | `6.18.33.2-microsoft-standard-WSL2` | Namespace/cgroup behavior must still be qualified under this kernel |
| cgroups | `cgroup2fs`; CPU, memory, pids, io and related controllers present | Suitable resource-control primitive; not yet qualification evidence |
| User/mount/PID namespaces | `unshare` probes returned success in the current privileged shell | Capability observed; Supervisor privilege reduction remains required |
| Network namespace | Docker/runc advertises network namespaces | Must be tested with controlled denial probes |
| seccomp | process mode 2; Docker reports builtin seccomp and supported filters | Explicit profile required; default Docker is not qualification |
| AppArmor/Landlock | Docker reports AppArmor enabled; Landlock was not established | Use reviewed seccomp plus LSM where reliably available |
| OCI runtime | Docker Engine 29.7.2 with runc and cgroup v2 | Candidate isolation layer |
| Windows mount | `/mnt/c` is writable 9p (`drvfs`) | Must never be mounted into a Guest |
| privilege | WSL audit shell was uid 0 with broad capabilities | Root in WSL is not a security claim; drop capabilities and isolate Supervisor |

No existing Sandbox implementation or sandbox-specific dependency was found in `apps`, `packages`, `scripts`, or `tests`.

## Backend Decision

The production-intent design is a dedicated Supervisor using OCI/runc, per-job minimal root filesystem, user/mount/PID/network namespaces, cgroup v2, explicit seccomp/LSM policy, dropped capabilities, no devices, read-only runtime assets, and a private writable workspace. The Worker will use a typed Adapter contract and will not access application PostgreSQL.

This is a design selection, not a qualification result. Timeout-only, working-directory-only, chroot-only, ordinary-process, and default-container-only approaches are rejected. If the later matrix cannot prove the required boundary under WSL2, the phase must become PARTIAL/BLOCKED rather than falling back unsafely.

## Frozen Contracts and Policies

The following are frozen in the common commit:

- Threat model and trust zones, including hostile Guest assumptions.
- Sandbox Execution Contract with `SANDBOX_PROBE_QUALIFICATION` as the only enabled mode; `REAL_SUBMISSION_EXECUTION` is fail-closed.
- Filesystem, process/privilege/syscall, network, resource, and environment/secret policies.
- Lifecycle from PREPARE through VERIFY_CLEAN/CLOSED, with cleanup failure security-significant.
- Repository-owned, versioned, hashed, bounded FS/NET/PROC/RES/ENV/CLEAN probe families.
- Security matrix rows SB, FS, NET, PS, RL2B, ENV, LC and WI, all marked PENDING IMPLEMENTATION.

No policy permits a Submission to select commands, paths, mounts, network targets, environment, syscalls, privilege, devices, or result destinations.

## Ownership and Branch Rotation

Only existing permanent worktrees were used. The three branches were created from exactly `ebf2e06`:

| Role | Worktree | Branch | Starting HEAD |
|---|---|---|---|
| Security/Auth | `D:\OJPlatform-worktrees\phase1b-authz` | `codex/phase2b-sandbox-security-policy` | `ebf2e06` |
| Runtime | `D:\OJPlatform-worktrees\phase1b-problem-authoring` | `codex/phase2b-sandbox-runtime` | `ebf2e06` |
| Web | `D:\OJPlatform-worktrees\phase1b-web-authoring` | `codex/phase2b-sandbox-ops-ui` | `ebf2e06` |

Security owns policy/authz/audit; Runtime owns the future Supervisor, isolation, probes and cleanup; Web owns only safe operator qualification UX. Lead owns shared contract, integration, matrix and final qualification.

## Baseline Regression

PASS: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (`197 passed`, `3 skipped` opt-in Redis tests), `pnpm test:architecture`, `pnpm build`, `git diff --check`, and WSL `go test ./...` plus `go vet ./...` in `apps/judge-worker`.

No arbitrary user source or Sandbox probe was executed during bootstrap. The existing Phase 2A safe-fixture boundary remains unchanged.

## Bootstrap Decision and Limits

`PHASE 2B PARALLEL BOOTSTRAP = PASS`. `WORKERS READY = YES` means all three branches are aligned to the common bootstrap commit and ready for separately scoped implementation work; it does not mean a Sandbox exists or is secure. The security matrix is intentionally PENDING IMPLEMENTATION.

Not qualified: Sandbox isolation, escape resistance, network denial, syscall policy, resource enforcement, cleanup, production HA, compiler/runtime integration, arbitrary submitted-source execution, real verdicts, and Contest. These are deferred to subsequent implementation and qualification gates.

## Commits and State

- Common bootstrap: `ebf2e06` (`docs: bootstrap phase 2b sandbox security`).
- Phase 2A baseline report commit: `dd81f4e`.
- Final Lead HEAD: `48c0450` (`docs: record phase 2b sandbox bootstrap`).
- No new worktrees created; protected `Goals/` and prior qualification artifacts preserved.
