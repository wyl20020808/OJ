# OJPLATFORM 2C.7B Dynamic Judge Node Registry and Scheduling V1 Report

## Result

`PARTIAL / BLOCKED_BY_RUNTIME_ROUTING`. Control-plane implementation and
automated gates are complete, but the mandatory real multi-node execution
qualification did not pass. No `PROJECT_STATUS` change was made and Lead
Integration was not executed.

## Git

- Branch: `codex/phase2c7b-dynamic-judge-node-registry-scheduling`
- Starting HEAD: `e1c11f1f1067885ccb7c4c733eeae1b55f460ce7`
- Final commit: recorded after this report is committed.

## Implemented

- Persisted Judge Node registry and assignment migration.
- Stable node identity plus per-process incarnation identity.
- Separate node authentication, heartbeat state machine, capacity-aware
  deterministic scheduling, drain, offline, stale heartbeat/completion checks.
- Worker service mode with registration, heartbeat, service-mediated claim,
  completion and resolve paths.
- Permanent API, deployment, Product Adapter, migration, node contract,
  scheduler, state-machine, security and runtime matrix documents.
- `JSNODE-01..70` control-plane contract and test coverage are represented by
  the implementation and focused tests; runtime items are listed below.

## Runtime evidence

WSL recovery checks passed. Two independently started Workers and two
independently started Supervisors reported valid identities/capabilities;
both Supervisors reported `real_submission_execution: true` and C++20 profile
`cpp20-gcc-13-v1`. Registration, current heartbeats and stale heartbeat
rejection were observed.

Three fresh scheduler-routed real C++20 testcase-set jobs were submitted with
the live service. Each ended `INFRA_FAILED` after three attempts with
`REAL_EXECUTION_SET_INFRA_FAILURE`. Worker logs remained in `CLAIMING`; no
Supervisor execution-set record was created. The required real AC verdict and
independent second-node execution evidence therefore remain unverified.

## Qualification matrix

- `JSNODE-71..74`: `PASS` for two registered real node identities and current
  heartbeats.
- `JSNODE-75..76`: `BLOCKED`; real execution did not reach Supervisor.
- `JSNODE-77..82`: `NOT VERIFIED` in this final run; no claimable real job was
  available for drain/offline lifecycle evidence.
- `JSNODE-83..91`: prior automated gates passed where applicable; final live
  real execution regression is `BLOCKED`.
- `JSNODE-92..97`: `PASS` for TypeScript tests/typecheck/lint/architecture/
  build/integration/format and Go worker gates. Supervisor Go tests retain two
  environmental/pre-existing failures (cgroup path fixture and missing
  `/trusted/probe` fixture); they are not claimed as passing.
- `JSNODE-98..100`: cleanup and scoped commit are completed after report
  finalization. Scoped commit completed. The local command policy rejected
  deletion of the two Goal-owned runtime directories, and the available WSL
  runtime did not provide `psql` for dropping the dedicated local database;
  those residual local-only runtime resources are not claimed as cleaned.

## Architecture and security

Judge Workers do not access Application PostgreSQL. Product DB direct access
is `NO`. Node and service credentials are separate and compared in constant
time. Source is only sent to the Supervisor boundary; no source execution was
performed by API or Service processes. No secrets are recorded here.

## Final flags

- `DYNAMIC NODE REGISTRY = YES`
- `HEARTBEAT HEALTH MANAGEMENT = YES`
- `DRAIN/OFFLINE MANAGEMENT = YES` (control-plane tested; final real routing not requalified)
- `CAPABILITY-AWARE SCHEDULING = YES`
- `REAL MULTI-NODE EXECUTION = NO`
- `PRODUCT DB DIRECT ACCESS = NO`
- `READY FOR PHASE 2C.7C = NO`

The blocking condition is specifically the live scheduler-to-Worker-to-
Supervisor execution handoff, which produced no execution-set record. This
report does not claim a real verdict or production readiness.
