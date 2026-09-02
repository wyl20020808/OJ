# OJPLATFORM Phase 2C.7B-R1Q Runtime Qualification Closure V1 Report

## Final Status

`PASS`

Fresh current-source runtime evidence closes the Phase 2C.7B gaps left by the
R1 environment interruption: two distinct real Judge Nodes executed
scheduler-routed C++20 jobs through distinct Workers and Supervisors, lifecycle
routing excluded unavailable nodes, re-registration created a new
incarnation, and stale authorities were rejected.

## Git And Scope

- Baseline and pre-report HEAD:
  `44cacc2959989454dca7f4518e33892b58603e9b`
- Branch: `codex/phase2c7b-r1q-runtime-qualification-closure`
- Final HEAD: the scoped report commit containing this file; its exact SHA is
  recorded by the post-commit final delivery.
- The baseline is the committed Phase 2C.7B-R1 recovery implementation.
- No implementation code changed in R1Q.
- Product Backend, Web, and `Docs/PROJECT_STATUS.md` were not changed.
- Lead Integration was not run.

## Environment And Topology

- WSL gate: Ubuntu 24.04 `/bin/true` and `/bin/echo WSL_OK` passed.
- Judge Service: current-source standalone service on loopback port `3127`.
- Isolated database: `ojplatform_judge_2c7b_r1q`.
- Isolated Redis namespace: `oj:judge:phase2c7b-r1q`.
- Node A: Worker health `28293`, Supervisor `19293`, records under
  `/tmp/ojp-r1q-set-records-a`.
- Node B: Worker health `28294`, Supervisor `19294`, records under
  `/tmp/ojp-r1q-set-records-b`.
- The Service, Workers, and Supervisors were rebuilt from the baseline/current
  source. Worker heartbeat evidence reported build
  `44cacc2959989454dca7f4518e33892b58603e9b`.
- A WSL keepalive was used while collecting evidence because the distro had
  previously terminated between invocations. It was runtime orchestration,
  not an implementation fallback.

## Fresh Runtime Evidence

### Node A C++20 AC

- Node: `phase2c7b-r1q-node-a`
- Incarnation: `e65ac8910e272da8877377f435a23f58`
- Judge job: `7a7ec06d-886f-4bb0-905f-73a1e8fed05f`
- Assignment: `b9f412c9-4daf-4e1c-9f89-934ba5f5875b`
- Terminal verdict: `AC`
- Supervisor record:
  `/tmp/ojp-r1q-set-records-a/8314b147c6752c31dc7b88c498e5776e54101362f5ed36ec3ad09fdc0c3423fc.json`
- Record result: `PIPELINE_COMPLETED`; one of one testcase completed;
  execution cleanup verified clean.

### Node B C++20 WA

- Node: `phase2c7b-r1q-node-b`
- Incarnation: `15ff930716695d534b11f158c061d098`
- Judge job: `5f6fcce7-70e5-480e-ba7d-5586761d2580`
- Assignment: `20e0142d-d066-4e1b-a5a2-dbad43ab774f`
- Terminal verdict: `WA`
- Supervisor record:
  `/tmp/ojp-r1q-set-records-b/f5490f0d7c2acb8015a6ece1837915bd6473e8768fb29d672385102ec3b289d2.json`
- Record result: `PIPELINE_COMPLETED`; one of one testcase completed;
  execution cleanup verified clean.

These executions used separate real Worker processes and separate Supervisor
endpoints. Node B's WA was submitted after Node A was correctly placed into
draining and therefore also proves scheduler routing to an eligible second
node. No simulated node substituted for either execution.

An earlier drain request omitted the JSON content type and did not change Node
A's state. The resulting extra Node A WA job
`5bd4e12b-1ae7-4e26-a051-dcdaa5d11a8f` is not credited as Node B evidence.
The drain operation was then issued with the correct contract and verified
before the credited Node B job.

## Drain And Offline

- Both nodes initially registered, heartbeated, and were eligible.
- Node A transitioned to `DRAINING`, received no credited new assignment, and
  transitioned to `OFFLINE` after it had no active work.
- The next real C++20 job was assigned only to Node B and completed `WA`.
- Node B was then set `OFFLINE`.
- With both nodes unavailable, job
  `73f2dd9d-ee63-4f8c-8096-e5847bf7de69` remained `QUEUED`.
- Manual claims by both A and B returned
  `{ "assignment": null, "reason": "NO_COMPATIBLE_JUDGE_NODE" }`.
- The queued qualification job was cancelled after the assertion.

## Unhealthy, Re-registration, And Stale Authority

- Node B re-registered as incarnation
  `a6767048009821c0f8911993aa50d830` and became `ONLINE`.
- Its Worker was stopped. After the configured timeout, Node B became
  `UNHEALTHY`.
- Rejudge job `517d668d-df61-48a7-b54a-c5d95522e3e9` could not be claimed and
  returned `NO_COMPATIBLE_JUDGE_NODE`; it was then cancelled.
- Node B re-registered again with new incarnation
  `cce14052b8b9a64cacdfb14ff6cfaeee` and returned to `ONLINE`.
- A heartbeat using prior incarnation
  `a6767048009821c0f8911993aa50d830` was rejected with HTTP 409 and
  `STALE_NODE_INCARNATION`.
- Completion of old assignment `20e0142d-d066-4e1b-a5a2-dbad43ab774f`
  using original incarnation `15ff930716695d534b11f158c061d098`
  was rejected with HTTP 409 and `STALE_NODE_INCARNATION`.

## R1Q-01..20

| ID | Result | Evidence |
| --- | --- | --- |
| R1Q-01 | PASS | Baseline/current HEAD `44cacc2959989454dca7f4518e33892b58603e9b` verified. |
| R1Q-02 | PASS | WSL `/bin/true` and `WSL_OK` gates passed. |
| R1Q-03 | PASS | Current-source Judge Service returned ready on loopback port `3127`. |
| R1Q-04 | PASS | Real Node A registered with a fresh incarnation. |
| R1Q-05 | PASS | Real Node B registered with a distinct fresh incarnation. |
| R1Q-06 | PASS | Node A heartbeat was fresh before routing/execution. |
| R1Q-07 | PASS | Node B heartbeat was fresh before routing/execution. |
| R1Q-08 | PASS | Node A completed the recorded real C++20 job with `AC`. |
| R1Q-09 | PASS | Node A `PIPELINE_COMPLETED` Supervisor record existed. |
| R1Q-10 | PASS | Node B completed the recorded real C++20 job with `WA`. |
| R1Q-11 | PASS | Node B `PIPELINE_COMPLETED` Supervisor record existed. |
| R1Q-12 | PASS | Correctly draining A received no new credited work. |
| R1Q-13 | PASS | The new real job routed to B and completed there. |
| R1Q-14 | PASS | Offline A/B were excluded; claims truthfully reported no compatible node. |
| R1Q-15 | PASS | Stopped B heartbeat aged the node to `UNHEALTHY`. |
| R1Q-16 | PASS | The unhealthy node could not claim the queued rejudge job. |
| R1Q-17 | PASS | Same logical B re-registered under a new incarnation and became eligible. |
| R1Q-18 | PASS | Prior-incarnation heartbeat was rejected with HTTP 409. |
| R1Q-19 | PASS | Prior-incarnation completion was rejected with HTTP 409. |
| R1Q-20 | PASS | Goal processes/listeners and temp artifacts were absent; report committed and tracked-clean state verified post-commit. Redis-prefix caveat is recorded below. |

## Verification Gates

Fresh in R1Q:

| Gate | Result |
| --- | --- |
| Focused Judge Service Vitest | PASS: 23 passed, 5 Redis-gated skipped |
| `pnpm typecheck` | PASS |
| `pnpm test:architecture` | PASS |
| Worker `go test ./internal/nodeclient ./internal/worker` | PASS |
| Supervisor `go test ./cmd/supervisor` | PASS |
| `git diff --check` | Verified after report creation |

Retained from the R1 baseline, with no implementation change in R1Q:

- `pnpm test`: 358 passed, 5 skipped.
- Redis queue qualification: 5 of 5 passed.
- `pnpm format:check`, `pnpm lint`, `pnpm build`, and `pnpm integration`
  passed.
- Full Worker and Supervisor Go test/vet gates and focused Worker race tests
  passed.

The retained results are not presented as fresh R1Q executions. R1Q reran the
focused gates required by the runtime path and relied on the unchanged R1
implementation for the prior full regression evidence, as allowed by the Goal.

## Cleanup

- The exact Goal-owned Worker A and B sessions were stopped.
- Both Goal-owned Supervisors and the dedicated Judge Service were stopped.
- No Goal-owned listener remained on `3127`, `19293`, `19294`, `28293`, or
  `28294`.
- No process matching `ojp-r1q` or `phase2c7b-r1q` remained.
- No Goal-owned `/tmp/ojp-r1q-*` artifact remained at final verification.
- Redis at `127.0.0.1:56379` returned connection refused during final cleanup,
  so removal of the isolated Redis prefix is not claimed. Shared Compose was
  not deliberately stopped or modified, and no unrelated process was touched.
- Existing untracked workspace Goal/spec directories were preserved.

The Redis cleanup caveat is explicitly permitted by the Goal when Redis is
unavailable and does not invalidate the already captured runtime outcomes.

## Remaining Limits

There is no remaining blocker for the R1Q acceptance criteria. This closure
does not claim multi-machine dynamic scheduling, HA, production readiness,
contest scoring, advanced Judge features, or a broader sandbox qualification.

## Final Flags

`FRESH NODE A EXECUTION = PASS`

`FRESH NODE B EXECUTION = PASS`

`REAL MULTI-NODE EXECUTION = YES`

`DRAIN/OFFLINE REAL RUNTIME = PASS`

`UNHEALTHY/REREGISTER REAL RUNTIME = PASS`

`PHASE 2C.7B CLOSURE = PASS`

`READY FOR PHASE 2C.7C = YES`
