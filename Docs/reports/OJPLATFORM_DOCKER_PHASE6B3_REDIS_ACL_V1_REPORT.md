# Docker Phase 6B-3 Redis ACL Report

## Live Baseline

- Canonical root: `D:\OJPlatform`, clean `main` at `0792a49f29b3b866beba14dd0706fbd5de215687`.
- Feature worktree: `D:\OJPlatform-worktrees\docker-phase6b3-redis-acl-v1`.
- Branch: `codex/docker-phase6b3-redis-acl-v1`.
- Existing stashes and worktrees were preserved. Main merge was not performed.

## Files Changed

- Compose and environment contract: `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml`, `.env.compose.example`.
- ACL bootstrap and qualification: `deploy/docker/bootstrap-redis-acl.sh`, `scripts/redis-acl-qualification.sh`.
- Worker ACL authentication: `apps/judge-worker/internal/queueadapter/redis.go` and tests.
- Contract tests: `tests/redis-acl-compose.test.ts`, adjusted Judge container network assertion.
- Deployment architecture, handoff, project status, and this report.

## Redis Version

`redis:7.4.1-alpine`, Redis server 7.4.1. ACL and channel rules target this pinned version. All consumers use logical DB 0. Redis logical DB selection is not treated as isolation; ACL users and key/channel patterns are the security boundary.

## Redis Consumers

- Product API: yes, through `REDIS_URL`; rate limits, legacy Product-owned Judge queue/worker operations, evaluation fanout, and Judge-progress subscription.
- Judge Service: yes, through `JUDGE_REDIS_URL`; queue, leases, recovery, metrics, cancellation, and progress publication.
- Worker: yes, through `REDIS_URL`; in Judge-Service mode it writes only its expiring heartbeat. Job claim/resolve uses authenticated Judge HTTP.
- Host Agent: no direct Redis client; it only carries a Worker template URL in the legacy Runtime Manager path.
- Supervisor: no Redis access.
- Scripts/tests: qualification consumers exist but are not runtime identities.

## Command Inventory

| Consumer | Commands required by live runtime |
| --- | --- |
| Product API | `PING`, `GET`, `SET`, `DEL`, `KEYS`, `LPUSH`, `RPOP`, `LLEN`, `LRANGE`, `INCR`, `EXPIRE`, `PEXPIRE`, `PTTL`, `EVAL`, `PUBLISH`, `SUBSCRIBE`, `UNSUBSCRIBE` |
| Judge Service | `PING`, `GET`, `SET`, `DEL`, `KEYS`, `LPUSH`, `RPOP`, `LLEN`, `LRANGE`, `PUBLISH` |
| Worker, service mode | `PING`, `SET` |
| Health identity | `PING` |

`AUTH` is used during connection authentication. DB 0 needs no `SELECT`. Judge/Worker do not receive `EVAL`, transaction, stream, scan, or Pub/Sub subscription permissions. No runtime user receives an administrative command category.

## Key / Channel Inventory

- Product keys: `oj:auth:limit:*`, `ojplatform:auth:guest:rate:*`, `ojplatform:social:rate:*`, `ojplatform:guest-authoring:rate:*`, and legacy Product-owned `oj:judge:*` queue/worker keys.
- Product channels: `oj:evaluation-events:v1` and `oj:judge-progress-events:v1`.
- Judge Service keys: `${JUDGE_REDIS_PREFIX}:*`; tested with `phase6b3:judge:*`.
- Judge Service channel: `oj:judge-progress-events:v1`.
- Worker keys: `${JUDGE_REDIS_PREFIX}:workers:*` only.
- Health: no keys/channels.
- Streams, consumer groups, transactions, and keyspace notifications: not used.

## Identity Model

Five distinct roles are provisioned: `oj-admin`, `oj-product`, `oj-judge-service`, `oj-judge-worker`, and `oj-redis-health` by default. Names are configurable and validated as distinct. Product, Judge Service, and Worker use separate credentials. Worker identity is role-level and shared by Workers; it is not per-node identity isolation.

## ACL Design

The generated ACL starts each runtime user with `-@all`, then adds the exact command list and key/channel patterns. This list is short enough to maintain and avoids broad read/write categories. Only admin receives `+@all ~* &*`. Prefix input rejects ACL glob/metacharacter injection. Similar-prefix tests denied `${prefix}2:*`, Product keys, and unrelated Judge keys.

## Default User

`default` is `off`, has `-@all`, no keys, and no channels. No-password connections failed closed before and after Redis restart.

## Admin Identity

Admin is separate and appears only in the one-shot ACL bootstrap environment and controlled qualification operations. It is absent from Redis server, API, Judge Service, and Worker runtime environments. Runtime identities cannot inspect or mutate ACLs. Immediate revocation requires admin to disable the user and kill already-authenticated connections.

## Product Identity

Product receives only its listed Product/legacy keys and two shared channels. Product cannot access `${JUDGE_REDIS_PREFIX}:*`. Product Lua rate-limit scripts passed on allowed keys and failed on Judge keys. Because Redis channel patterns do not separate publish from subscribe, Product can technically publish to both allowed channels; Judge results remain durable DB/queue authority and progress events remain best effort.

## Judge Service Identity

Judge Service receives full access only within `${JUDGE_REDIS_PREFIX}:*`, plus exact queue commands and Judge-progress publication. This scope is required because Judge Service owns queue jobs, idempotency indexes, mutation lock, cancellation keys, lease recovery, and metrics. Product keys, unrelated similar prefixes, Lua, ACL, configuration, flush, module, debug, persistence, and shutdown operations are denied.

## Worker Identity

Worker receives `PING` and expiring `SET` under `${JUDGE_REDIS_PREFIX}:workers:*`. It cannot read even its heartbeat, access queue/job/lease/cancellation keys, access Product keys, publish channels, enumerate keys, delete data, or run administration. The Go client now parses `redis://username:password@host:port/0`, sends ACL `AUTH` before `PING`, rejects unsupported schemes/query/fragment/nonzero DB, and does not fall back after authentication failure.

## Key Pattern Isolation

ACL patterns and application prefixes agree. Tests covered allowed Worker heartbeat, denied Judge job/probe keys, denied Product keys, and denied similar prefixes. Redis keys have no path traversal semantics; `../` does not escape a glob, while validated configured prefixes also reject wildcard metacharacters.

## Channel / Stream Permissions

Redis 7 channel ACLs use exact `&channel` patterns. Product can use evaluation and Judge-progress channels; Judge Service can use only Judge-progress; Worker and health have no channels. Streams are not used and no stream commands are granted.

## Secret Injection

Compose accepts externally supplied usernames/passwords and forms authenticated Redis URLs. Committed defaults are explicitly `DEV ONLY`; production Compose requires all values. Passwords must be strong, distinct, and URI-safe. ACL storage contains SHA-256 password hashes, not plaintext passwords. Runtime secrets remain visible to a host-level operator through container environment inspection; this is an environment-injection limitation, not hidden in the report. Values were never copied into logs/report and no secret was baked into an image.

## Compose Integration

ACL bootstrap is a one-shot gate before Redis. It atomically rewrites known roles, preserves unknown ACL-file users, validates inputs, and uses a persistent ACL volume. Redis also uses a persistent data volume and starts with the ACL file. API receives only Product Redis URL; Judge Service receives only Judge Redis URL; host Worker receives only Worker URL. Default Core startup does not require the Judge profile.

Development publishes Redis and Judge Service on `127.0.0.1` only. Production publishes neither Redis nor public Judge ingress; Judge Service remains loopback-only for same-host execution-cell access and Web is the only public bind. Production host Workers require an approved private/loopback endpoint with the Worker credential; no public Redis port was added.

## judge-host Network Audit

`judge-host` Redis membership is **REQUIRED** in the development overlay. Runtime audit proved Docker did not realize the loopback host publication while Redis was attached only to the internal `infrastructure` network. Restoring the non-internal `judge-host` attachment produced `6379/tcp -> 127.0.0.1:<port>`. Container control-plane clients still use `infrastructure`; no host network mode was added.

## Fresh Startup

PASS on unique project `ojplatform-phase6b3-acl`, fresh Postgres/Redis/ACL/MinIO volumes, isolated Judge DB `phase6b3_judge`, prefix `phase6b3:judge`, ports, credentials, node ID, and temporary Worker files. ACL bootstrap completed before Redis; Product API and Judge Service became healthy with their own identities.

## Second Startup

PASS across repeated Compose startups. Bootstrap completed idempotently, known identities retained supplied credentials, migrations remained successful, and Product/Judge services returned healthy. No random password generation, wildcard user deletion, or ACL database reset occurs.

## Redis Restart

PASS. Redis stopped and restarted with the persisted ACL file; no-password/wrong credentials remained denied. Product API, Judge Service, and the authenticated host Worker recovered readiness. There was no unauthenticated interval.

## Credential Revocation

PASS in the isolated runtime. Admin executed `ACL SETUSER <worker> off` plus `CLIENT KILL USER <worker>`; Worker readiness changed to 503 and claims paused. Re-enabling the user restored readiness. The same disable/kill test made Judge Service readiness 503 and restoration returned 200. `CLIENT KILL` is admin-only and is not granted to runtime users.

## Worker Fail-Closed

PASS. A Worker with the correct restricted credential registered, heartbeated, and stayed ready. A distinct Worker using a wrong password remained 503/not-ready. Revocation and Redis stop changed the valid Worker to 503. No memory queue or unauthenticated fallback exists, and claim loop requires Redis readiness.

## Judge Service Fail-Closed

PASS. Disabling and disconnecting the Judge identity made `/ready` return 503; Redis stop had the same result. Re-enable/restart recovered readiness. Queue operations remain dependent on authenticated Redis and do not silently downgrade.

## Cross-Identity Negative Tests

PASS: Worker to Product/Judge private keys denied; Product to Worker/Judge Service prefix denied; Judge Service to Product and similar prefix denied; health to any key denied. Exact channel and Lua key restrictions also passed.

## Administrative Command Denial

`ACL DRYRUN` and live safe denials covered `ACL GETUSER`, `ACL SETUSER`, `ACL LIST`, `CONFIG GET/SET`, `FLUSHALL`, `FLUSHDB`, `SHUTDOWN`, `DEBUG`, `MODULE`, `SAVE`, and `BGSAVE`. Runtime users cannot alter their own ACL. Destructive commands were never allowed; checks ran only against the isolated phase Redis.

## Product Regression

PASS. Product API started and reached healthy with Product ACL while initializing both subscribers and all Redis-backed modules. Product command/Lua/channel probes passed. Targeted Redis/Judge tests and root typecheck passed.

## Judge Regression

PASS. Judge Service startup/readiness, Worker registration/heartbeat, reconnect, and fail-closed behavior passed at runtime. Targeted Judge Service/queue tests cover claim, lease ownership, stale recovery, completion, and cancellation. No real execution-cell Submission was run.

## Secret Leak Audit

PASS. Container environment inspection confirmed each runtime receives only its own Redis role; Redis server receives health only. The bootstrap one-shot receives provisioning values by design. Worker/Judge logs contained no tested passwords. Production/dev rendered Compose was inspected without copying values. `docker history --no-trunc` for Redis and Judge images contained none of the test credentials. Git diff contains only explicit development placeholders.

## Runtime Validation

- Redis ACL qualification: PASS, including no/wrong/wrong-user/disabled authentication.
- Product API and Judge Service ACL startup/readiness: PASS.
- Host Worker ACL URL authentication and heartbeat: PASS.
- Worker/Judge revocation and recovery: PASS.
- Redis restart and ACL persistence: PASS.
- Dev/prod Compose render and ingress/credential scope: PASS.
- Targeted Vitest: 20 passed, 5 skipped; Worker Go: 84 passed across 10 packages; `go vet ./...`: PASS.
- Root TypeScript typecheck, targeted ESLint/Prettier, architecture gate, shell syntax, and `git diff --check`: PASS.
- Isolated cleanup removed only phase-owned containers, networks, volumes, processes, ports, and temporary files.

No user Submission, untrusted code, real Supervisor, runc, compiler rootfs, cgroup, real user DB, or shared application runtime was used or modified.

## Remaining HIGH Blockers

- `HIGH_BLOCKER_WORKER_REDIS_ACL = RESOLVED`.
- `HIGH_BLOCKER_OJ_SANDBOX_DOCKER_GROUP = OPEN`.
- Full sandbox security regression remains pending.
- `PRODUCTION_JUDGE_QUALIFIED = NO`.

## Risks

- Worker credential compromise permits spoofing/overwriting heartbeat keys for any node under the shared Worker role, causing orchestration confusion or denial of service. It cannot read Redis data, touch queue/lease/Product keys, or administer Redis. Per-node ACL provisioning is deferred.
- Judge credential compromise permits corruption/disclosure of Judge queue and lease state and fake progress publication. It cannot access Product keys or Redis administration.
- Product credential compromise permits Product cache/rate-limit and legacy Product-owned Judge-key corruption and shared-channel injection, but not the Judge Service/Worker namespace or Redis administration.
- Admin compromise is full Redis compromise. Admin must remain outside runtime and be protected as an operator secret.
- Environment injection exposes runtime secrets to host/container administrators. A production secret-manager/file-provider migration can reduce environment visibility but is outside this phase.

## Handoff

Phase 6B-3 is PASS. Redis ACL enforcement, distinct Product/Judge/Worker identities, default-user lockdown, cross-namespace denial, restart persistence, and fail-closed runtime use are qualified on the isolated Windows/WSL2 development lane. Mac/ARM64 Judge and production sandbox qualification remain unchanged.

## Commit

- Branch: `codex/docker-phase6b3-redis-acl-v1`.
- Commit message: `feat: isolate judge Redis credentials with ACLs`.
- Main merge: not performed.

## Next Phase

Phase 6B-4: remove and qualify `oj-sandbox` Docker-group privilege, using `GPT-5.6 Sol` with high reasoning. Do not claim production Judge qualification until privilege hardening and full sandbox security regression pass.
