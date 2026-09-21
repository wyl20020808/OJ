# OJPlatform Dev Runtime Infrastructure Readiness V1 Report

Goal: fix the Windows local Runtime Manager "cold Docker/WSL infrastructure startup race" in
which `dev-runtime.ps1 start` reported infrastructure success and then failed the Judge DB
bootstrap with `Connection terminated unexpectedly` (`pg/lib/client.js`).

Scope: `scripts/dev-runtime.ps1`, `scripts/judge-service-bootstrap.mjs`, local runtime
documentation. `deploy/` (production installer and Compose definition) was not modified.

Status wording: `IMPLEMENTED`, `TESTED`, `RUNTIME VERIFIED` for the Windows/local development
runtime only. No production deployment qualification was attempted or claimed.

## Symptom (as reported)

```text
Infrastructure postgres: CONTAINER_DOWN (container state=exited)
Infrastructure postgres START/REUSE
Infrastructure START
Judge DB bootstrap: checking
node scripts/judge-service-bootstrap.mjs
Error: Connection terminated unexpectedly
```

`dev-runtime.ps1:220` was only the generic `Invoke-ProcessCommand` wrapper; it was not the cause.

## Root cause (proven on the live host, not inferred)

The Runtime Manager readiness gate treated all of the following as readiness:

- the Compose container exists and `State.Status=running`;
- the **container-level** healthcheck reports `healthy`;
- the declared port mapping and the Compose network are attached;
- `Test-TcpPort` shows that something **accepts** a TCP connection on `127.0.0.1:<host port>`.

None of these proves that PostgreSQL/Redis/MinIO answers on the **published host path** that
application processes actually use. On the affected host the published path was dead while all
container-level evidence stayed green:

| Evidence (measured) | Result |
| --- | --- |
| WSL2 VM `eth0` (host NAT) | `172.18.0.1/30` → subnet `172.18.0.0/30` |
| Compose bridge `ojplatform-local` | `172.18.0.0/16` (overlaps the WSL host NAT subnet) |
| `docker exec postgres pg_isready` | `accepting connections` (healthcheck `healthy`) |
| `ip route get 172.18.0.2` (postgres) | `172.18.0.2 dev eth0` — routed out of the WSL host NIC, not the bridge |
| `ip route get 172.18.0.3` (redis) | `broadcast 172.18.0.3 dev eth0` — misrouted |
| `ip route get 172.18.0.4` (minio) | `172.18.0.4 dev br-f7fd79adf0d3` — correct |
| Windows TCP `55432` / `56379` / `59000` | all "open" (`docker-proxy` accepts) |
| Windows PostgreSQL handshake on `55432` | `Connection terminated unexpectedly` (persistent, 176 consecutive failures over 172s) |
| Windows Redis `PING` on `56379` | accepted, no `+PONG` |
| Windows MinIO `/minio/health/ready` on `59000` | HTTP 200 (IP outside the overlap) |
| container attached to the same bridge → `172.18.0.2:5432` | `accepting connections` |

The Docker port forwarder accepts the client connection in the WSL root namespace and then
closes it because the container IP is unreachable from that namespace (its route leaves through
`eth0`/broadcast instead of `br-*`). PostgreSQL clients surface exactly the reported
`Connection terminated unexpectedly`; the same fault produced no PONG for Redis.

Because a plain TCP connect succeeded and the container healthcheck was green, the manager
declared `READY`, ran `Ensure-JudgeDatabase` immediately, and the bootstrap died on its first
connection — a **false READY**, not a missing wait. A pure "wait longer" fix cannot detect or
repair it, and the reported manual retry could not succeed either.

Additional proven detail: recreating only the container (`docker compose up -d --force-recreate
postgres`) keeps the same colliding IP (`172.18.0.2`), so it does not recover the path.
Recreating the Compose network (without `-v`) re-allocates a non-overlapping subnet
(`172.19.0.0/16`, proven by a throwaway network allocation probe) and restores all three
published paths.

## Fix

`scripts/dev-runtime.ps1` (Windows/local development runtime only):

1. **Published-path readiness probes** (the real readiness contract):
   - PostgreSQL: `pg` connect + `SELECT 1` over `127.0.0.1:55432` with the real development
     credentials (pg_isready semantics plus a query). Passwords are never printed; only
     `host:port/db` is reported.
   - Redis: RESP `PING` over `127.0.0.1:56379`, requiring `+PONG`.
   - MinIO: HTTP 200 from `http://127.0.0.1:59000/minio/health/ready`.
2. `Get-InfrastructureStatus` returns `PUBLISHED_PATH_UNREACHABLE` when container-level
   evidence is green but the protocol probe fails, instead of `READY`.
3. `Wait-InfrastructureReady`: bounded poll (default `InfraReadyTimeoutSec=120`,
   `InfraReadyPollSec=2`, configurable through `config/dev-runtime.local.ps1`), never an
   unbounded wait and never a blind fixed sleep. Output distinguishes `STARTING`, per-service
   `READY (<n>s)`, and `FAILED`.
4. Failure classification:
   - connection/transport/startup failures (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`,
     `Connection terminated*`, `timeout expired`, `the database system is starting up`,
     `57P0x`, `53300`, ...) are **transient → keep waiting / repair**;
   - credential, authentication, missing role/database, permission and SQL/schema failures fail
     immediately as `INFRASTRUCTURE_READINESS_BLOCKED` and are never retried or hidden.
5. **Bounded published-path reconcile**: when a container stays healthy but its protocol probe
   keeps failing for `InfraPathStallSec=20`, the manager recreates the Compose network
   (`docker compose down --remove-orphans` **without `-v`**, then `up -d`) at most **once**,
   asserting the `ojplatform-postgres-data` volume exists before and after. This re-registers
   the bridge, the port forwarders and the routes, which is the deterministic repair for the
   proven fault class. Named volumes and development data are never removed.
6. **Failure diagnostics**: service, readiness code, container state, health, `RestartCount`,
   exit code, image, publish mapping, host TCP reachability, probe result, container IP, WSL
   host-namespace route, Compose network subnet, container log tail, and the exact
   `docker logs`/`docker inspect`/`ip route get` commands to reproduce.
7. `status` now reports infrastructure readiness from the published-path probes instead of a
   bare TCP probe.
8. `Ensure-JudgeDatabase` wraps bootstrap failure in
   `JUDGE_DATABASE_BOOTSTRAP_FAILED` and allows 90s so the bootstrap's own bounded retry fits.

`scripts/judge-service-bootstrap.mjs` (defensive second layer, not the primary fix):

- the whole idempotent bootstrap is retried up to 5 attempts with bounded exponential backoff
  (1s, 2s, 4s, 8s) for explicit transient connection failures only;
- fatal classification always wins and is never retried: authentication/credential failures,
  missing database or role, permission denied, SQL/schema/migration errors (including
  `28P01`, `28000`, `3D000`, `42501`, `42P01`, `42P06`, `42P07`, `42601`, `42703`, `42710`);
- unknown failures are not retried; failures emit a compact JSON record with
  `status/attempt/failureClass/error` and never print the connection URL;
- a postcondition now verifies the exact credential the Judge runtime will use (connect to the
  Judge database as the Judge role with the configured password and run `SELECT 1`) before the
  bootstrap reports success, so a credential that cannot connect is a loud failure instead of a
  silent state change.

## Data safety

- No `docker compose down -v`, no volume removal, no database drop/reset, no data deletion, no
  environment rebuild. Named volumes `ojplatform-postgres-data`, `ojplatform-redis-data`,
  `ojplatform-minio-data` survived every step.
- Product DB fingerprint before the cold-start work and after all repairs/cold starts:
  57 public tables, 130 users, 114 problems, 69355 submissions, 19 databases — identical.
  The single later-added `users` row is an unrelated guest account created at 14:19 local by
  normal product use.
- The Compose network recreation asserted the presence of `ojplatform-postgres-data` before and
  after (`INFRASTRUCTURE_REPAIR_REFUSED` / `INFRASTRUCTURE_DATA_LOSS_DETECTED` otherwise).

### Incident during validation: Judge role password changed by a bad test case (repaired)

One dev-only retry-test scenario passed a deliberately wrong `JUDGE_DATABASE_PASSWORD` together
with correct admin credentials. Because the bootstrap is idempotent and applies
`ALTER ROLE ... PASSWORD`, that scenario silently changed the live `oj_judge_service` password.
The running Judge Service then answered `GET /v1/admin/nodes` with HTTP 500
`DatabaseError: password authentication failed for user "oj_judge_service"` (its pg pool mixed
connections created before and after the change, so the failure looked intermittent).

The runtime manager surfaced it as `RUNNING_VERSION_MISMATCH_ACTIVE_JOBS_UNKNOWN` during the
version-mismatch reconcile instead of guessing. It was repaired by re-running the bootstrap with
the Runtime Manager secret, and verified afterwards: connecting to `ojplatform_judge` as
`oj_judge_service` with the runtime secret succeeds and `GET /v1/admin/nodes` returns 200.
No table or row was affected. The test helper was corrected to use a wrong **admin URL**
password instead (which fails before any role change) and now carries an explicit warning, and
the bootstrap gained the role-credential postcondition described above.

### Pre-existing blocker found and repaired (dev DB only, with authorization)

`ojplatform.public._ojplatform_runtime_migrations` contained one legacy row
`0000_platform_metadata.down`, applied `2026-09-03` by a pre-manifest runner version. The
current fixed-manifest runner correctly rejects it
(`MIGRATION_LEDGER_UNKNOWN_VERSION:product:0000_platform_metadata.down`), so a full
`dev-runtime start` stopped at migrations even after the readiness fix. The ledger table was
dumped to
`%LOCALAPPDATA%\OJPlatform\runtime\ojplatform-local\backup\ledger-20260921-141350.sql` and only
that one row was deleted after explicit user authorization; the ledger then validated and the
pending legitimate migration `0036_contest_development_provenance` applied normally. No other
row, table, database or volume was touched. This was a data-state repair, not a code change to
the migration runner.

## Validation

Readiness probes and classification (test-mode harness + fake TCP listeners):

| Case | Result |
| --- | --- |
| real postgres/redis/minio | `ok=true` (`connection + SELECT 1`, `+PONG`, HTTP 200) |
| TCP accepted then closed (reported failure class) | postgres `read ECONNRESET` / redis closed without reply → `TRANSIENT`, repairable |
| TCP accepted then silent (black hole) | postgres `timeout expired` / redis read timeout → `TRANSIENT`, repairable |
| wrong credentials | `password authentication failed` → `CONFIGURATION`, not repairable |
| port closed | no connection → transient |

Runtime evidence on the physical Windows 11 host (WSL2 `Ubuntu-24.04`, WSL-native Docker):

| Test | Result |
| --- | --- |
| Normal start, infrastructure up | PASS; infra `READY (reuse, 1.9s)`, bootstrap READY, migrations PASS, worker ONLINE, `OJPlatform start PASS` |
| Warm/`status`-equivalent reuse | PASS; 9.2s total, all services `REUSE`, no duplicate containers |
| **Cold infrastructure start** (postgres/redis/minio stopped, state `exited`, volumes intact) | PASS; `CONTAINER_DOWN (container state=exited)` → `START/REUSE` → `STARTING` → `postgres READY (12.2s)`, `redis READY (12.2s)`, `minio READY (17.7s)` → `Infrastructure START READY (17.7s)` → `Judge DB bootstrap REUSE/READY` → migrations PASS → `OJPlatform start PASS` |
| Slow Postgres only (redis/minio already up) | PASS; redis/minio `READY (6.1s)`, postgres `READY (11.4s)`, bootstrap started only after — no premature bootstrap |
| Second start while running | PASS; 10.6s total, all `REUSE`, no duplicates, no DB errors |
| Repair code path (`Repair-InfrastructurePublishedPath`) | executed on the live runtime; network recreated without volume removal, subnet `172.19.0.0/16`, assets preserved, subsequent full start PASS (43.8s incl. supervisor rebuild) |
| Version-mismatch reconcile after committing the fix | PASS; `RUNNING_VERSION_MISMATCH` detected per service, old owned processes stopped, services restarted from the committed HEAD, `status` reports `MIXED SOURCE = False` with all services `RUNNING` and `worker RUNNING_OWNED` |
| Failure diagnostics format | rendered container state/health/`RestartCount`/exit code/image/ports/host TCP/probe/container IP/WSL route/subnet/log tail/reproduce commands |

`scripts/judge-service-bootstrap.mjs` behaviour:

| Scenario | Result |
| --- | --- |
| normal/idempotent | `BOOTSTRAPPED` attempt 1 (0.2s), Judge role credential verified |
| server not listening | 5 attempts, backoff 1s/2s/4s/8s, then `FAILED … failureClass=TRANSIENT` (15.2s) |
| wrong admin credentials | `FAILED … failureClass=FATAL` attempt 1 (0.2s) — not retried |
| missing admin database | `FAILED … failureClass=FATAL` attempt 1 (0.2s) — not retried |

Regression:

- PowerShell parse: all 8 `scripts/*.ps1` `PARSE OK` (Windows PowerShell 5.1).
- Focused PowerShell suites PASS: `test-dev-runtime-ownership.ps1`,
  `test-runtime-stop-ownership-recovery.ps1`, `test-stop-manual-recovery-v2.ps1`,
  `test-judge-runtime-recovery.ps1`, `test-canonical-main-launcher.ps1`.
- `vitest run tests/migration-architecture.test.ts tests/deployment-contract.test.ts tests/redis-acl-compose.test.ts tests/execution-cell-docker-boundary.test.ts`: 4 files / 38 tests passed.
- `node tests/architecture/check.mjs`: PASS.
- `tsc -p tsconfig.json --noEmit`: PASS.
- `prettier --check scripts/judge-service-bootstrap.mjs`: PASS.
- `git diff --check`: clean.

## Deployment impact

None for production. `deploy/install.sh`, `deploy/docker/compose.yml`, migrations and the Judge
protocol were not modified (verified by `git status`). Only the Windows/local development
Runtime Manager and the local Judge DB bootstrap script changed. A production host cannot
depend on Windows/WSL2 port forwarding, so the affected fault class does not exist there.

## Follow-ups (recorded, not fixed here)

- `FOLLOW-UP (dev runtime)` — WSL2 can reassign its host-NAT subnet on a later WSL start, which
  can re-collide with the then-existing Compose network subnet. The reconcile path recovers it
  automatically, but a longer-term hardening would pin Docker's `default-address-pools` in the
  WSL daemon configuration (host configuration change, needs separate approval).
- `FOLLOW-UP (dev runtime)` — log volume has no rotation: `judge-service.log` (770 MB) and
  `host-agent.error.log` (370 MB) are accumulated dev logs; unrelated to this fix.
- `FOLLOW-UP (dev runtime)` — `stop` reports a Judge Service 409 when draining a stale
  non-ONLINE node (`Worker <id> drain/stop was rejected … (409)`); pre-existing, non-blocking.
- `FOLLOW-UP (other dev machines)` — a dev database carrying the legacy
  `0000_platform_metadata.down` ledger row needs the same documented one-row repair before
  `dev-runtime start` can pass migrations.
- `FOLLOW-UP (dev tooling)` — `judge-service-bootstrap.mjs` is idempotent and applies
  `ALTER ROLE ... PASSWORD`, so calling it with a wrong Judge password silently changes the
  live role password and breaks the running Judge Service. Dev tooling must always pass the
  Runtime Manager secret; the script now verifies the resulting credential but cannot know the
  intended one.

## Unverified / not claimed

- Not production-qualified; no production deployment was exercised.
- The exact final "cold start on a freshly rebooted Windows host with a shut-down WSL VM" was
  not re-run end to end; the tested cold state is the reported one (infrastructure containers
  `exited`, Docker/WSL restored) plus a WSL-distro restart during this session.
- WSL2 host-NAT subnet reassignment timing itself (why the subnet changed between WSL sessions)
  was observed, not reproduced under control.
