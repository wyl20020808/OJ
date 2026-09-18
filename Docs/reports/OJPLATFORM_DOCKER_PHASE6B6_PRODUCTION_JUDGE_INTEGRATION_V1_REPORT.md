# Docker Phase 6B-6 Production Hardening Integration V1 Report

## Scope

- Feature: `742020ca668d053f644db95ff1a26ea359d23329` (`security: harden and qualify production judge`).
- Candidate: `codex/docker-phase6b6-production-qualification-v1-integration-v1`.
- Live main base: `9a4868f4dca7052ae6d8a73347982c386fe70655`.
- Candidate no-ff merge: `31c4bc1aac8b5b79afff8d334008bfbed70b4d10`.

## Integration Method

A fresh candidate worktree was created from live `refs/heads/main`. The feature branch was merged with `git merge --no-ff`; no conflict occurred. Feature history is preserved. No rebase, squash, cherry-pick, destructive Git command, credential, user data, shared runtime, Worker, Supervisor, Host Agent, compiler rootfs, or native-Linux qualification was used.

## Preserved Status

```text
DOCKER_PHASE_6B6 = PARTIAL
PRODUCTION_HARDENING = PASS
QUALIFICATION_HOST_TYPE = WINDOWS_WSL2
WINDOWS_WSL_PRODUCTION_PREQUALIFICATION = PASS
NATIVE_LINUX_AMD64_QUALIFICATION_HOST = NO
NATIVE_LINUX_FINAL_QUALIFICATION = PENDING
LINUX_AMD64_FULL_JUDGE = PARTIAL
LINUX_ARM64_FULL_JUDGE = NOT QUALIFIED
MAC_JUDGE = NOT TARGET
PHASE_5_MAC = DEFERRED
PRODUCTION_JUDGE_QUALIFIED = NO
```

## Security Controls

- OCI hard=soft `RLIMIT_NOFILE`: compile 128, runtime 64.
- OCI hard=soft `RLIMIT_FSIZE`: compile 16 MiB, runtime 512 KiB.
- Workspace: 64 MiB free-space preflight, 32 MiB aggregate accounting, accounting errors fail closed, bounded cleanup.
- Seccomp remains amd64 default-allow with tested expanded dangerous-syscall denylist; it was not changed into an unqualified allowlist.
- Sandbox remains non-root/rootless-runc, no capabilities, `no_new_privs`, namespace/cgroup/filesystem/network isolation, Docker denial, and no unsandboxed fallback.
- Judge execution readiness remains authenticated and durable-state based (`ONLINE`, `EXECUTION_READY`, `DEGRADED`, `UNAVAILABLE`); overall readiness model remains PARTIAL.
- Production Compose keeps Judge Service loopback-only, non-root/read-only/cap-drop/no-new-privileges, private API/PostgreSQL/Redis/MinIO, required secrets without unsafe fallback, and `json-file` 10 MiB x 5 rotation.

## Finding Disposition

```text
OPEN_CRITICAL_FINDINGS = 0
OPEN_HIGH_FINDINGS = 0
OPEN_MEDIUM_FINDINGS = 0
MEDIUM_SECCOMP_DEFAULT_ALLOW = ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL
MEDIUM_RLIMIT_NOFILE = RESOLVED
MEDIUM_COMPILE_WORKSPACE_FILE_LIMIT = ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL
SECCOMP_STATUS = PARTIAL
WORKSPACE_AGGREGATE_LIMIT = PARTIAL
```

Residual risk rationale and mandatory controls remain in `Docs/security/JUDGE_PHASE6B6_COMPENSATING_CONTROLS.md`; accepted risk is not represented as fully resolved.

## Integration Validation

- `git diff --check`: PASS.
- Targeted Vitest: 9 files, 86 tests PASS; includes production config, sandbox qualification static gate, Judge Service/container, Redis ACL, Docker execution-cell boundary, Worker authorization/control.
- TypeScript typecheck, architecture gate, targeted ESLint, and targeted Prettier: PASS.
- Production Judge config render/security/required-secret gate: PASS.
- Base and development Compose renders: PASS under WSL Docker with required OnlineCodeEditor context.
- Worker: 84 Go tests in 10 packages and `go vet ./...`: PASS.
- Supervisor full WSL suite and `go vet ./...`: PASS; security-sensitive seccomp/rlimit/workspace/fail-closed coverage included.
- Read-only live Docker privilege gate: `oj-sandbox` primary group only; Docker socket and daemon denied: PASS.
- Static secret/privilege scan: PASS.
- Native handoff and production deployment guide exist and were reviewed for required provisioning, startup, qualification, recovery, cleanup, rollback, and unsupported-platform guidance.

The feature's fresh isolated WSL deployment, second startup, restart recovery, crash recovery, 12 trusted probes, and 14 bounded C++ fixture evidence were not rerun during this conflict-free integration. They remain feature evidence, not native production evidence.

## Handoff and Status

`Docs/OJPLATFORM_CURRENT_HANDOFF.md` is 97 lines and records Phase 6B-6 as PARTIAL / MERGED, native qualification PENDING, and Production Judge NO. `Docs/PROJECT_STATUS.md` receives one append-only integration record.

## Next Action

Run `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on a fresh native Linux amd64 host with GPT-5.6 Sol + high reasoning. Only that full native PASS may qualify Linux amd64 or Production Judge.
