# Docker Phase 6B-4 Sandbox Privilege Hardening Integration Report

## Live Main Before

Canonical `D:\OJPlatform` was clean on `main`; live `HEAD` and `refs/heads/main` were `7677c0391e2218e7f0fad8ee61e18bd20539278c`.

## Feature Branch Tip

`codex/docker-phase6b4-sandbox-privilege-hardening-v1` resolved to `831a81446deaddb3b5229e4c69a3be3febf0a77a`. It contained one Phase 6B-4 security commit beyond main. Scope audit found only Docker-boundary gates, trusted-operator helper changes, documentation, status, and tests; no Redis ACL redesign, Worker/Supervisor feature work, runc/cgroup implementation change, sandbox regression, or product work.

## Integrated Commits

- Feature: `831a81446deaddb3b5229e4c69a3be3febf0a77a`.
- No-ff merge: `dadd00a0e4878312bf4d47d8c7eb160c385bc4c2`.
- Integration record: this report's commit, `docs: record Docker Phase 6B-4 sandbox privilege integration`.

## Git Topology

A new candidate, `codex/docker-phase6b4-sandbox-privilege-hardening-v1-integration-v1`, was created from live main. The feature commit remains a parent of the no-ff merge. No squash, rebase, cherry-pick rewrite, force operation, or history rewrite occurred.

## Integration Method

Candidate used `git merge --no-ff codex/docker-phase6b4-sandbox-privilege-hardening-v1`. Canonical main advances only through `git merge --ff-only` after candidate validation.

## Conflicts

None. Git used `ort`; no whole-file `ours`/`theirs` resolution occurred.

## Host State Verification

Host state was rechecked read-only in Ubuntu 24.04 WSL2 after candidate merge. This verifies host state independently of Git state; merge itself cannot apply host hardening.

## oj-sandbox Current Groups

`oj-sandbox` exists as UID/GID 1000/1000 and has only primary group `oj-sandbox`. Docker group GID 989 has no members.

## Fresh Process Groups

Fresh `runuser` process and current lingering systemd user-manager process both showed only group 1000. No cached Docker supplementary group remained.

## Docker Socket Denial

Socket remains `root:docker` mode `0660`. Fresh `oj-sandbox` AF_UNIX open returned permission denied. Socket owner, group, mode, ACL, daemon, and proxy were not changed.

## Docker Daemon Denial

Fresh `oj-sandbox` Docker CLI invocation reached installed CLI but failed at `unix:///var/run/docker.sock` with permission denied. This proves daemon boundary, not absent CLI. No container list/create/exec/mount, prune, or destructive Docker operation ran.

## Execution Cell Docker Dependency Gate

Merged gate passed. Production Worker, Host Agent, and Supervisor source contains no Docker CLI/API/socket, `DOCKER_HOST`, containerd, nerdctl, or podman dependency. Allowed Docker references are deployment/build helpers and negative sandbox tests only.

## Provisioning Security

Merged gate passed. Repository provisioning/config/scripts do not add `oj-sandbox` to Docker group. No host drift appeared. Fresh host contract remains: create sandbox account without broad supplementary groups.

## Trusted Docker Operator

Windows/WSL Docker infrastructure helpers explicitly use trusted WSL root operator. Docker access is not granted to `oj-sandbox`, Worker, Supervisor, Host Agent, or sandbox runtime. Production guidance remains separate trusted operator identity rather than WSL root convenience.

## runc Boundary

Supervisor remains direct rootless `runc --rootless=true --systemd-cgroup`; no Docker daemon or group dependency was introduced. Rootless design and bundle model were not changed.

## cgroup Boundary

Cgroup v2 remains Linux/systemd user-manager delegation with `Delegate=yes`, not Docker. No live cgroup setting was modified in integration.

## Namespace Boundary

OCI PID/mount/network/IPC/UTS/user namespaces remain runc/kernel controls. Docker was not substituted for namespace isolation.

## Compiler Rootfs Boundary

Compiler rootfs remains direct root-owned filesystem input to Supervisor. No Docker image runtime, mount, exec path, or rootfs modification was introduced.

## Worker / Supervisor / Host Agent Boundary

Worker, Host Agent, and Supervisor remain host-native. Supervisor production contract remains `127.0.0.1:19092`; no public bind, Docker socket, privileged mode, capability, host PID/network, or unsandboxed fallback was added. Integration did not start/restart shared Worker, Supervisor, or Host Agent.

## Redis ACL Regression Boundary

Targeted Redis ACL Compose contract passed. Product/Judge/Worker role credentials, default-user lockdown, loopback development Redis, unpublished production Redis, and Worker ACL blocker resolution remain intact.

## Known HIGH Blockers

Worker Redis ACL: RESOLVED. `oj-sandbox` Docker-group: RESOLVED. All known HIGH production blockers are resolved. Production Judge remains NO: Phase 6B-5 full disposable-host sandbox security regression and Phase 6B-6 production qualification remain required.

## Supervisor Baseline Debt

No broad Supervisor suite was used as Phase 6B-4 acceptance. Existing Phase 6B-2 baseline failures remain recorded: root-oriented cgroup-path expectation and missing-probe-before-root-gate assertion. Focused non-root preflight, controller fail-closed, compiler-profile, and `go vet` checks passed. No test was weakened or debt hidden.

## systemd User Manager Note

Integration did not refresh, terminate, restart, or otherwise modify the systemd user manager. Current manager group state was read only. Feature's earlier refresh happened only while no OJPlatform process existed.

## Handoff Update

Handoff now records Phase 6B-1/2/3/4 as PASS / MERGED, both known HIGH blockers resolved, Production Judge NO, Phase 6B-5 next, execution readiness MEDIUM/PARTIAL, Mac not targeted, ARM64 not qualified, and Sol + high reasoning for next sandbox work.

## Handoff Line Count

95 lines, within both 60–100 target and 120 hard ceiling.

## PROJECT_STATUS Record

One append-only concise integration record was added. Earlier history was not changed.

## Validation

- Read-only live account/fresh process/systemd manager/socket/daemon host check: PASS.
- Targeted Vitest: 14 passed.
- Worker Go: 84 passed across 10 packages; `go vet ./...`: PASS.
- Supervisor targeted non-root/fail-closed tests: 3 passed; `go vet ./...`: PASS.
- Root TypeScript typecheck and architecture dependency gate: PASS.
- Targeted ESLint, Prettier, Node syntax, helper Compose render, and `git diff --check`: PASS.
- No-privilege-workaround scan: PASS.
- Feature trusted qualification probe remains PASS evidence; no runtime probe was repeated during integration.

No real user Submission, untrusted code, full sandbox regression, real user DB change, rootfs change, cgroup change, shared runtime restart, or shared runtime modification occurred.

## Main After

Candidate contains feature merge plus documentation-only integration record. Canonical main fast-forwards only after final clean-state check.

## Canonical Root State

Before fast-forward, canonical main remained clean with `HEAD == refs/heads/main`. Final state is checked after advancement.

## Stashes / Worktrees Preserved

All three pre-existing stashes, all worktrees, feature branch, and candidate branch were preserved.

## Result

Docker Phase 6B-4 integration: PASS. Feature: PASS. Merged-to-main is pending final fast-forward. Production Judge: NO. Phase 6B-5 was not started.
