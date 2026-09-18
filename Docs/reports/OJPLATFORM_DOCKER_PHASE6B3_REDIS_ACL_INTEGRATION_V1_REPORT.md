# Docker Phase 6B-3 Redis ACL Integration Report

## Live Main Before

Canonical `D:\OJPlatform` was on clean `main`. Live `HEAD` and `refs/heads/main` were both `0792a49f29b3b866beba14dd0706fbd5de215687`.

## Feature Branch Tip

`codex/docker-phase6b3-redis-acl-v1` resolved to `2adec20ea1bd2dbeb4cd386d6027b8d1fd1c35dd`. It contained one commit beyond live main: `feat: isolate judge Redis credentials with ACLs`. Scope audit found no sandbox, Supervisor, runc, cgroup, production-qualification, or unrelated product changes.

## Integrated Commits

- Feature: `2adec20ea1bd2dbeb4cd386d6027b8d1fd1c35dd`.
- No-ff merge: `f4d0d0c` (`merge: integrate Docker Phase 6B-3 Redis ACL isolation`).
- Integration governance record: this report's commit, `docs: record Docker Phase 6B-3 Redis ACL integration`.

## Git Topology

A fresh integration branch, `codex/docker-phase6b3-redis-acl-v1-integration-v1`, was created from live `refs/heads/main`. The feature commit remains a parent of the no-ff merge; history was not squashed, rebased, or rewritten.

## Integration Method

`git merge --no-ff codex/docker-phase6b3-redis-acl-v1` on the fresh candidate, followed by validation and one documentation-only integration record commit. Canonical main is advanced only by `git merge --ff-only` after candidate validation.

## Conflicts

None. Git used the `ort` strategy. No whole-file `ours`/`theirs` resolution occurred.

## Redis Version

`redis:7.4.1-alpine`; Redis server 7.4.1. Redis DB 0 remains a logical selection, not a security boundary.

## Redis Identity Model

Distinct Product, Judge Service, Worker, health, and admin/bootstrap users remain configured. Product, Judge Service, and Worker credentials are distinct. No runtime service receives the Redis admin credential.

## Default User Security

`default` remains `off resetkeys resetchannels -@all`. Isolated qualification rejected no-credential access both before and after Redis restart. No broad `nopass ~* +@all` default was introduced.

## Admin Identity

Admin remains separate and limited to bootstrap/controlled maintenance. Only admin has `+@all ~* &*`. Product, Judge Service, Worker, and health users cannot inspect or mutate ACL/configuration or run broad administrative commands.

## Product Identity

Product keeps the commands, Product rate-limit/cache keys, legacy Product-owned Judge compatibility keys, and two required channels documented by the feature audit. It cannot access `${JUDGE_REDIS_PREFIX}:*`, including Worker-private heartbeat keys.

## Judge Service Identity

Judge Service keeps only queue/control-plane commands, `${JUDGE_REDIS_PREFIX}:*`, and Judge-progress publication. It has no Product namespace or Redis administration access.

## Worker Identity

Worker Redis use remains heartbeat-only: authenticated `PING` and expiring `SET` under `${JUDGE_REDIS_PREFIX}:workers:*`. Job claim, lease ownership, and completion continue over authenticated Judge Service HTTP, not direct Redis. Worker cannot read queue/job/lease/Product keys, enumerate keys, publish, delete, or administer Redis.

## Worker Role-Level Identity Semantics

Worker credential is a unique shared role-level credential. Per-node Redis identity is not implemented. This accepted limitation does not reduce Phase 6B-3 status.

## Command Scope

ACL definitions still begin runtime users with `-@all` and add exact commands. Worker and Judge Service do not receive Lua, transactions, streams, scan, or administrative categories. Product retains `EVAL` only because live rate-limit logic requires it; ACL key checks still constrain script keys.

## Key Scope

Worker is limited to `${JUDGE_REDIS_PREFIX}:workers:*`; Judge Service to `${JUDGE_REDIS_PREFIX}:*`; Product to its listed Product/legacy namespaces. Prefix validation rejects ACL glob metacharacters. Similar-prefix escape tests remain denied.

## Cross-Identity Isolation

Isolated ACL qualification passed Worker-to-Product denial, Worker-to-Judge-private denial, Product-to-Worker/Judge denial, Judge-to-Product denial, health-to-key denial, channel denial, and Lua cross-key denial.

## Administrative Command Denial

Runtime users were denied ACL, CONFIG, FLUSHALL, FLUSHDB, SHUTDOWN, DEBUG, MODULE, SAVE, and BGSAVE operations. Checks used isolated Redis only; no destructive production command ran.

## Wrong Credential Handling

No credential, wrong password, wrong user/password pair, and disabled user were denied in isolated qualification before and after restart. Worker URL parsing rejects unsupported or ambiguous Redis URL forms and does not fall back to unauthenticated access.

## Redis Restart Persistence

Integration validation created fresh isolated ACL/data volumes, ran the negative matrix, reran bootstrap, preserved an unknown disabled maintenance user, restarted Redis, then reran the matrix successfully. Default-user lockdown and all managed identities persisted.

## Fail-Closed Authentication

Feature runtime evidence remains unchanged: wrong/revoked Worker credential makes Worker not ready and prevents claims; wrong/revoked Judge Service credential makes readiness/control plane fail. Integration targeted tests passed, and no fallback shared/default credential exists in merged code.

## Compose Network / Exposure

Production Redis has no published port. Development Redis is published only on `127.0.0.1`. Judge Service retains loopback host publication; Web remains the only production public ingress. No host network, privileged mode, added capability, or Docker socket was added.

## dev judge-host Redis Membership

Retained and required. Development Redis remains attached to `judge-host` so Docker realizes the loopback host port used by the host-native Worker.

## Phase 6B-2 Regression Boundary

Product API-to-Judge Service, Worker-to-Judge Service, Worker-to-Redis, Worker-to-Supervisor loopback, registration, heartbeat, lease ownership, dependency reconnect, and fail-closed preflight contracts remain intact. Supervisor, Host Agent, sandbox, runc, cgroup, rootfs, and Docker-group code were not changed. `127.0.0.1:19092` remains the Supervisor boundary.

## Remaining HIGH Blocker

Worker Redis ACL blocker is resolved. `oj-sandbox` Docker-group membership remains the sole open HIGH production blocker. Full sandbox security and Linux production qualification remain pending; Production Judge is not qualified.

## Handoff Update

Hot handoff now records Phase 6B-1, 6B-2, and 6B-3 as `PASS / MERGED`; Worker Redis ACL as resolved; `oj-sandbox` Docker-group blocker as open; Production Judge as unqualified; Phase 6B-4 as next; Mac Judge as not targeted; and ARM64 as not qualified.

## Handoff Line Count

98 lines, within the 120-line hard ceiling and 60–100-line target.

## PROJECT_STATUS Record

One append-only concise integration record was added. Earlier records were not rewritten.

## Validation

- `git diff --check`: PASS.
- Targeted Prettier and ESLint: PASS.
- Root TypeScript typecheck: PASS.
- Targeted Vitest: 20 passed, 5 skipped.
- Worker Go tests: 84 passed across 10 packages; `go vet ./...`: PASS.
- Architecture dependency gate: PASS.
- Dev/prod Compose render and ingress/identity assertions: PASS.
- Isolated ACL negative matrix before and after Redis restart: PASS.
- Repeated bootstrap and unknown-user preservation: PASS.
- Shell syntax, scope boundary check, and isolated cleanup: PASS.
- Secret scan: PASS; only safe placeholders are committed, with no tested credential in image source/docs/diff.

No real user Submission or untrusted code ran. No real user DB, rootfs, cgroup, `oj-sandbox` account, shared Supervisor, shared Worker, shared Host Agent, or shared OJPlatform runtime was modified. Full sandbox qualification was not run.

## Main After

Candidate contains the feature merge plus this documentation-only integration record. Canonical main is advanced by fast-forward only after all candidate checks pass.

## Canonical Root State

Before final fast-forward: clean `main`, `HEAD == refs/heads/main`. Final state is verified again after advancement.

## Stashes / Worktrees Preserved

All three pre-existing stashes, feature/integration branches, and all existing worktrees were preserved. No stash drop, clean, destructive reset, rebase, force operation, or history rewrite occurred.

## Result

Docker Phase 6B-3 Redis ACL integration: PASS. Feature: PASS. Worker Redis ACL blocker: RESOLVED. `oj-sandbox` Docker-group blocker: OPEN. Production Judge: NO. Phase 6B-4 was not started.
