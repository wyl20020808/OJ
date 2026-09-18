# Docker Phase 6B-2 Execution Cell Integration Report

## Live Baseline

- Canonical root: `D:\OJPlatform`
- Feature worktree: `D:\OJPlatform-worktrees\docker-phase6b2-execution-cell-integration-v1`
- Branch: `codex/docker-phase6b2-execution-cell-integration-v1`
- Start commit and live `main`: `fad79886f4b75093dc241fdf770f85e45deec01a`
- Canonical tracked tree was clean. Existing stashes and worktrees were preserved.
- Runtime lane: Windows host, WSL2 Ubuntu 24.04.4, `x86_64`; Docker Engine endpoint `unix:///var/run/docker.sock` in the Ubuntu distribution.

## Files Changed

- `apps/judge-worker/internal/config/config.go` and tests: isolated heartbeat prefix follows `QUEUE_PREFIX`.
- `apps/judge-worker/internal/worker/worker.go` and tests: explicit control-plane, Redis, and Supervisor readiness; periodic Supervisor protocol preflight; fail-closed claim pause and recovery.
- `apps/judge-service/src/server.ts`: reconnect Redis from `end` state during readiness recovery.
- `compose.yaml`, `compose.dev.yaml`, `.env.compose.example`: separate internal Judge endpoint and development-only loopback Redis bridge.
- `tests/judge-service-container.test.ts`: endpoint and loopback contract assertions.
- Deployment architecture, project status, current handoff, and this report.

## Actual Judge Topology

```text
Product client
  -> Product API container
     -> Product PostgreSQL / Product Redis / MinIO
     -> Judge Service container via http://judge-service:3100
        -> Judge PostgreSQL schema/database
        -> shared Redis, isolated Judge prefix

Optional lifecycle direction:
  Judge Service -> host-native Host Agent -> owned Worker process

Validated static execution-cell direction:
  host-native Worker
     -> Judge Service via loopback-published HTTP
     -> current shared Redis via development loopback publication
     -> loopback Supervisor protocol
        -> rootless runc boundary (not entered in this phase)

Artifact data direction for real jobs:
  Worker -> Product API read-only artifact route -> Product-owned object storage
  Worker verifies/materializes bytes -> authenticated Supervisor staging
  Sandbox receives only source/testcase material, never storage credentials
```

Host Agent does not register or heartbeat on behalf of Worker. Worker owns node registration, heartbeat, claim, cancellation observation, and lease-bound completion. Judge Service owns Judge DB state and Redis queue state. Product API owns Product DB projection and artifact authorization.

## Connection Matrix

| Source | Destination | Protocol / port | Authentication | Boundary | Purpose |
| --- | --- | --- | --- | --- | --- |
| Product API container | Judge Service container | HTTP `judge-service:3100` | `x-judge-service-token` | container to container | intake, status, rejudge, capabilities |
| Judge Service | Judge PostgreSQL | PostgreSQL `5432` | Judge runtime DB role | container to container | durable job/node/assignment state |
| Judge Service | Redis | RESP `6379` | current shared unauthenticated dev Redis | container to container | queue, leases, coordination, progress |
| Judge Service | Host Agent, optional | HTTP `127.0.0.1:3180` or future private TLS | distinct Host Agent token | container to host; not configured in controlled run | fixed-template lifecycle only |
| Host Agent | Worker child | local process spawn | fixed local template; host-owned incarnation | host to host | process lifecycle and materialized config |
| Worker | Judge Service | HTTP `127.0.0.1:3122` in test; default `3100` | `x-judge-node-token` | host to container | registration, heartbeat, claim, resolution |
| Worker | Redis | RESP `127.0.0.1:56482` in test | current shared Redis URL; ACL absent | host to container | Worker liveness key only in service mode |
| Worker | Supervisor | HTTP loopback; production contract `127.0.0.1:19092` | loopback boundary; artifact endpoints add token | host to host | preflight, staging, execution protocol |
| Worker | Product API artifact route | HTTP loopback in development or private HTTPS | read-only artifact token | host to container/private service | bounded immutable object materialization |
| Supervisor | runc | local executable / OCI bundle | dedicated host identity | host to sandbox boundary | rootless isolated compile/runtime |
| Sandbox | network services | none | none | untrusted | denied by isolated network namespace |

## Container / Host Endpoint Model

- Container clients: `JUDGE_SERVICE_INTERNAL_URL=http://judge-service:3100`; Compose maps this into Product API's existing `JUDGE_SERVICE_URL` consumer variable.
- Host Worker: `JUDGE_SERVICE_URL=http://127.0.0.1:<published-port>` for same-host development.
- Host Worker must not receive `judge-service` or `redis` Compose DNS names.
- Future remote hosts require private TLS endpoints and distinct credentials. Loopback is not the only production model and is not hardcoded in Worker validation; cleartext off-loopback Judge URLs are rejected.
- Development overlay joins Redis to `judge-host` so its existing loopback publication is reachable by the host Worker. Production does not publish Redis and remains blocked pending Phase 6B-3.

## Product API -> Judge Service

Controlled runtime executed an authenticated capabilities request from the API container through `http://judge-service:3100`: HTTP 200. API container restart returned healthy and the same internal request recovered. No `localhost:3100` container contract or new public ingress was added.

## Host Agent -> Control Plane

Not required for static/manual Worker mode and not started. Live code shows the optional direction is Judge Service to Host Agent for fixed-template lifecycle control. Host Agent then injects the host Judge URL, Redis URL/prefix, node token, Supervisor loopback URL, and host-owned node incarnation into Worker. It has no Docker API/socket path.

## Worker -> Control Plane

A real Linux amd64 Worker binary in WSL reached Dockerized Judge Service through the loopback-only published port. It registered, heartbeated, claimed two isolated trusted control fixtures, and resolved them through node endpoints. Judge Service loss changed Worker `/ready` to 503 and paused claims; restart restored the same node incarnation without process or machine restart.

## Worker -> Redis

Current service mode still writes Worker liveness directly to Redis. Controlled validation used only `phase6b2:isolated*`; `HEARTBEAT_PREFIX` now derives from `QUEUE_PREFIX` unless explicitly overridden. Redis was exposed only on test host loopback. This proves the current development contract but does not solve ACL isolation.

## Worker -> Supervisor

The production contract remains `127.0.0.1:19092`. Controlled validation used an alternate loopback port and a protocol-only Supervisor harness with valid health/capability responses and all execution endpoints disabled. Worker performed startup and periodic preflight. No bridge, host network, public bind, Docker socket, runc, rootfs, or cgroup operation was used.

## Authentication

- Service and node tokens remain distinct.
- Wrong node token returned HTTP 401; no unauthenticated downgrade occurred.
- Worker received node token, current Redis URL, and Supervisor URL only. It received no Product/Judge DB, Product API admin, MinIO root, or Docker credential.
- Sandbox credential allowlists remain unchanged; no sandbox process ran.

## Execution Node Identity

Node ID and incarnation came from host Worker configuration, not container hostname. Duplicate registration of the same node ID with a new host-owned incarnation replaced the current incarnation. The stale Worker received `STALE_NODE_INCARNATION`, became degraded, and stopped claiming.

## Registration

`PASS`: isolated Worker registered against the containerized Postgres-backed node repository with amd64/C++20 capabilities and fixed incarnation.

## Heartbeat

`PASS`: authenticated Judge heartbeat and Redis liveness key were observed. Dependency loss now remains degraded until all required dependencies recover. Graceful Worker shutdown stopped heartbeat and the isolated TTL key expired.

## Lease / Ownership

The Worker claims through Judge Service, not Redis, in service mode. Judge Service binds queue lease token, assignment, node ID, and incarnation. Stale incarnation and wrong lease completion tests reject publication. Delivery remains at-least-once, not exactly-once: an expired attempt can overlap a retry, but stale completion is fenced from durable result publication.

## Execution Readiness

Worker `/ready` now reports:

- `control_plane`
- `redis`
- `supervisor`

All must be current before claims continue. Judge Service `/ready` still reports only Judge DB and Redis. Judge node persistence distinguishes online/busy/unhealthy by heartbeat but has no separate durable `executionReady` field. Classification: `PARTIAL` observability model, fail-closed Worker scheduling.

## Preflight

Startup and periodic Worker preflight validate Supervisor health, non-root UID, execution contract, language profile, compiler-rootfs identity, compiler version, and command-template identity. Missing/unreachable capability makes Worker degraded and pauses claims. Existing Supervisor code performs its full runc/cgroup/rootfs preflight before enabling real execution; that real host preflight was not rerun.

## Artifact Flow

No artifact was fetched in the trusted fixture run. Source audit confirmed Product API owns object-store credentials and exposes token-protected immutable artifact bytes; Worker bounds and hashes materialized data; Supervisor staging uses a distinct token; sandbox receives no API, MinIO, DB, Redis, Judge, or Docker credential.

## Judge Service Restart

`PASS`: container stop made Worker control-plane readiness false. Container restart restored `/ready`, heartbeat, claim eligibility, and the original incarnation without Worker or host restart.

## Redis Failure / Recovery

`PASS`: isolated Redis stop made Judge Service and Worker not ready. No job was claimed during dependency loss. Judge Service now reconnects its non-retrying Redis client when status reaches `end`; Redis restart restored both readiness paths. No duplicate job execution was observed.

## Supervisor Failure

`PASS`: stopping the loopback protocol harness made Worker `/ready` return 503 with `supervisor=false`. A newly accepted trusted fixture remained `QUEUED`. Restoring protocol preflight allowed the fixture to complete. No execution endpoint was available, proving no host-process or unsandboxed fallback.

## Auth Failure

`PASS`: invalid node token returned 401 and could not register, heartbeat, claim, or resolve work.

## Duplicate Worker / Node

`PASS`: new incarnation replaced the old incarnation; stale heartbeat was rejected and old Worker became degraded. This is replacement plus incarnation fencing, not simultaneous active ownership.

## Graceful Shutdown

`PASS`: SIGTERM moved isolated Workers through draining/stopping/stopped, exited cleanly, and allowed both isolated Redis heartbeat keys to expire. Judge Service SIGTERM/restart remained clean.

## Network Exposure

Runtime `docker port` evidence: `3100/tcp -> 127.0.0.1:3122`. Development Redis also used a loopback-only publication. Compose rendering rejects no binding but renders neither Judge Service nor Redis on `0.0.0.0`/`::`. Supervisor remained loopback-only and absent from Docker networks.

## Docker Dependency Audit

Worker and Host Agent production source contains no Docker CLI, socket, or API use. Supervisor production `os/exec` targets fixed runc/systemd operations, not Docker. No execution-cell component received `/var/run/docker.sock`. The tested flow did not require `oj-sandbox` Docker-group membership.

## HIGH Blockers

1. `oj-sandbox` remains a member of `docker`: **HIGH / OPEN**.
2. Service-mode Worker still uses shared Redis without a dedicated ACL credential, and its minimal Redis client does not yet authenticate an ACL identity: **HIGH / OPEN**.

Both block production Judge qualification.

## Trusted Probe

`TRUSTED PROBE EXECUTED = YES`: two built-in `SAFE_FIXTURE_QUALIFICATION` control fixtures ran inside Worker. The Supervisor harness exposed no execution endpoint. This was not a user Submission, compiler invocation, sandbox payload, or runc execution.

## Runtime Validation

- Unique Compose project: `ojplatform-phase6b2-20260918`.
- Fresh isolated PostgreSQL/MinIO volumes and Judge database.
- Redis namespace: `phase6b2:isolated`.
- Unique node incarnations, Worker health ports, Supervisor harness port, and host ports.
- Product API DNS, registration, heartbeat, claim/resolve, auth rejection, Judge restart, API restart, Redis restart, Supervisor loss, duplicate incarnation, shutdown, loopback bind, and log redaction passed.
- Cleanup removed only phase-owned containers, networks, volumes, processes, and ports. Post-cleanup inspection returned no phase resources.

## Tests

Passed:

- Judge Worker: 83 Go tests across 10 packages.
- Judge Worker `go vet ./...`.
- Targeted Vitest: 41 passed, 0 failed.
- Root TypeScript typecheck.
- Targeted ESLint.
- Development and production Compose render.
- Judge Service `linux/amd64` runtime image build.
- Controlled WSL runtime matrix above.
- `git diff --check`.

Baseline-only Supervisor test command was also attempted. Windows compilation cannot build Linux-only trusted-probe syscalls; WSL unit run retained two pre-existing failures (`TestOCIConfigCarriesFiniteResources`, `TestProductionSupervisorRejectsRootQualification`). No Supervisor source changed, and Phase 6B-2 did not claim full sandbox regression.

## Known Baseline Debt

- Judge node API lacks an explicit durable execution-ready dimension separate from heartbeat health.
- Redis ACL isolation and Worker ACL authentication are absent.
- Full real Supervisor/rootfs/runc/cgroup security regression is pending.
- Supervisor baseline test debt above remains outside this change.
- Existing file/FD, seccomp allowlist, per-test logical limit, and hard compile-workspace quota gaps remain.

## Handoff State

Phase 6B-2 is `PASS` for controlled Docker-control-plane to WSL-host execution-cell integration. Production Judge remains unqualified. Mac Judge is not targeted; full ARM64 Judge is not qualified.

## Risks

- `HIGH`: shared ACL-less Redis access by Worker.
- `HIGH`: `oj-sandbox` Docker-group membership.
- `MEDIUM`: execution readiness is Worker-local and not a separate durable Judge node field.
- `MEDIUM`: at-least-once retry can duplicate execution work after lease expiry, although stale durable completion is fenced.
- `INFO`: Supervisor validation used a non-executing protocol harness; no claim is made for sandbox runtime qualification.

## Commit

- Branch: `codex/docker-phase6b2-execution-cell-integration-v1`
- Commit message: `feat: integrate judge control plane with host execution cell`
- Main merge: not performed.

## Next Phase

1. Phase 6B-3: dedicated Redis ACL/credential isolation, including authenticated Worker Redis support or removal of direct Redis from service mode.
2. Phase 6B-4: remove `oj-sandbox` from Docker group and requalify least privilege.
3. Phase 6B-5: disposable-host real sandbox security regression and execution qualification.
4. Phase 6B-6: production Judge qualification only after all blockers pass.
