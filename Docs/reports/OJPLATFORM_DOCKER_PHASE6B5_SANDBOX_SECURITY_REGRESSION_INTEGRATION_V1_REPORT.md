# Docker Phase 6B-5 Sandbox Security Regression Integration Report

## Live Main Before

Canonical `D:\OJPlatform` was clean on `main`; live `HEAD` and `refs/heads/main` were `2573294f040785d0787b90b2ee98d4ca87c8ac92`.

## Feature Branch Tip

`codex/docker-phase6b5-sandbox-security-regression-v1` resolved to `c8c6245e6cc305d982045792f00812dac8b8981f`. It contained one Phase 6B-5 security-qualification commit beyond main. Scope audit found only opt-in qualification harnesses, bounded fixture sources, security tests, architecture/status/docs, and no deployment, migration, Phase 6B-6, product feature, or broad security redesign work.

## Integrated Commits

- Feature: `c8c6245e6cc305d982045792f00812dac8b8981f`.
- No-ff merge: `33dc2d417d81e262c482c4e3b622b2e650233c5f`.
- Integration record: this report's commit, `docs: record Docker Phase 6B-5 sandbox security integration`.

## Git Topology

Candidate `codex/docker-phase6b5-sandbox-security-regression-v1-integration-v1` was created from live main. Feature remains a parent of no-ff merge. No squash, rebase, cherry-pick rewrite, force operation, or history rewrite occurred.

## Integration Method

Candidate used `git merge --no-ff codex/docker-phase6b5-sandbox-security-regression-v1`. Canonical main advances only through `git merge --ff-only` after clean candidate validation.

## Conflicts

None. Git used `ort`; no whole-file `ours`/`theirs` resolution occurred.

## Security Regression Preservation

Feature PASS verdict and complete matrix remain unchanged: network, filesystem, sibling workspace, credentials, Docker socket, process/PID/resource controls, cleanup, cgroup, namespaces/mounts/devices, compiler/artifact, testcase/concurrency, malformed handling, and fail-closed checks pass. Supervisor remains unreachable from sandbox; unsandboxed fallback remains NO.

## Qualification Fixture Safety

Static safety gate passed. Qualification is absent from default `pnpm test`/ordinary `go test` paths and requires both explicit environment opt-ins. Fixtures remain 11 short, local-only, bounded repository sources; static test passed. Integration did not run adversarial runtime fixtures.

## Network Isolation

PASS preserved from feature runtime evidence. Candidate static gate and architecture/security tests pass. No network namespace, loopback bind, endpoint, or public exposure changed.

## Filesystem / Workspace Isolation

PASS preserved. Candidate tests cover source/testcase/artifact symlink and path safety; no rootfs, workspace policy, or compiler-rootfs path changed.

## Credential / Docker Isolation

PASS preserved. Read-only live WSL check confirms `oj-sandbox` UID/GID 1000/1000 has no Docker group; socket and Docker daemon remain denied. Execution-cell Docker dependency/provisioning gate passed.

## Process / PID / Resource Limits

PASS preserved from feature runtime evidence. Candidate static/tests validate finite profile controls and qualification gate. No PID, CPU, memory, output, cgroup, or timeout implementation changed.

## Cleanup / Cgroup

PASS preserved. Read-only host check found no Phase 6B-5 temporary tree, `phase2b-*.scope`, alternate listener, or shared OJPlatform process. Integration did not create or modify cgroups.

## Namespace / Mount / Device

PASS preserved. Candidate controlled failure tests remain gated from ordinary execution; mount/namespace/device policy was not changed. No qualification fixture was rerun.

## Compiler / Artifact Safety

PASS preserved. Targeted compiler profile, artifact, input staging, and symlink tests passed. Compiler rootfs was read only and unchanged.

## Fail-Closed Boundaries

PASS. Targeted Supervisor validation covers qualification-fault gating, finite kernel evidence, stale active-record fail-closed recovery, controller delegation, malformed artifact/input safety, and Phase 6B-5 tests in safe skipped mode. No fallback or privilege workaround is present.

## Redis ACL Regression

PASS. Targeted Redis ACL Compose, Judge Service, Worker, Host Agent, sandbox control, and authz tests passed. No ACL/runtime credential change occurred.

## Docker Privilege Regression

PASS. Docker boundary gate passed; host read-only checks confirm group/socket/daemon denial. No Docker socket, privileged mode, capability, host PID/network, sudo, chmod/chown workaround, or execution-cell Docker dependency was introduced.

## Findings

CRITICAL: 0. HIGH: 0. MEDIUM: 3. LOW: 0. Counts are unchanged from feature evidence.

## MEDIUM Findings

All three remain OPEN Phase 6B-6 acceptance inputs; this integration makes no compensating-control decision:

1. `SECCOMP = PARTIAL`: amd64 default-allow denylist, not production-derived allowlist.
2. Explicit `RLIMIT_NOFILE` absent.
3. Kernel compile-workspace quota / `RLIMIT_FSIZE` absent; userspace monitor remains bounded but can overshoot.

They do not invalidate the scoped WSL Phase 6B-5 PASS. They must be RESOLVED or explicitly `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL` during Phase 6B-6. Production Judge remains NO.

## Supervisor Baseline Debt

Two pre-existing broad-suite failures remain visible: old root-oriented cgroup-path expectation and root UID assertion preceded by unavailable root user bus. Both remain fail-closed; targeted non-root/security tests passed. No test was deleted, skipped, weakened, or altered to conceal debt.

## WSL Qualification Semantics

`WINDOWS_WSL_SANDBOX_SECURITY_REGRESSION = PASS`. This does not change `LINUX_AMD64_FULL_JUDGE = PARTIAL`, `LINUX_ARM64_FULL_JUDGE = NOT QUALIFIED`, or `MAC_JUDGE = NOT TARGET`.

## Production Qualification Boundary

Known HIGH blockers remain RESOLVED, but `PRODUCTION_JUDGE_QUALIFIED = NO`. Phase 6B-6 native production-like Linux qualification is required. Execution readiness remains PARTIAL due to durable readiness-model gap.

## Handoff Update

Handoff now states Phase 6B-1 through 6B-5 PASS / MERGED; WSL regression PASS; three OPEN MEDIUM acceptance inputs; known HIGH blockers resolved; Production Judge NO; Phase 6B-6 next; Sol + high reasoning; readiness PARTIAL; ARM64/Mac boundaries.

## Handoff Line Count

96 lines, within 60–100 target and 120 hard ceiling.

## PROJECT_STATUS Record

One append-only concise integration record was added. Prior history was untouched.

## Validation

- Candidate targeted Vitest/security/Judge/Redis gates: 99 passed.
- Architecture dependency gate, TypeScript typecheck, targeted ESLint, Prettier, Python compile, Bash syntax, and `git diff --check`: PASS.
- Worker: 84 Go tests in 10 packages; `go vet ./...`: PASS.
- Supervisor targeted Linux security/fail-closed tests and `go vet ./...`: PASS.
- Static privilege-workaround and secret scans: PASS.
- Read-only WSL Docker/host-residue boundary check: PASS.
- No adversarial runtime suite, user Submission/code, user DB, rootfs, cgroup, shared Worker/Supervisor/Host Agent, or shared runtime was modified during integration.

## Qualification Resource Cleanup

YES. Read-only verification found no feature-owned sandbox process, runc container, qualification cgroup, alternate listener, temporary workspace, or test resource.

## Main After

Candidate contains feature merge plus documentation-only integration record. Canonical main advances only after final clean-state check.

## Canonical Root State

Before fast-forward, canonical main remained clean with `HEAD == refs/heads/main`. Final state is checked after advancement.

## Stashes / Worktrees Preserved

All three pre-existing stashes, all worktrees, feature branch, and candidate branch were preserved.

## Result

Phase 6B-5 integration: PASS. Feature: PASS. Main merge pending final fast-forward. Phase 6B-6 was not started.
