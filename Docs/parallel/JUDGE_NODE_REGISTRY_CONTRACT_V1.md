# Judge Node Registry Contract V1

This document defines the Phase 2C.7B internal Judge Service node-control
plane. It extends `/v1` without changing the Phase 2C.7A job DTO contract.
It is not a Product API and has no Product PostgreSQL access.

## Identity and registration

`POST /v1/nodes/register` requires `x-judge-node-token`. Its JSON body is:

```json
{
  "nodeId": "judge-a",
  "incarnation": "process-start-uuid",
  "runtimeVersion": "worker-v1",
  "maxConcurrentJobs": 1,
  "capabilities": {
    "languageProfiles": ["cpp20-gcc-13-v1"],
    "checkers": ["EXACT_BYTES", "TOKEN_WHITESPACE"],
    "executionModes": ["REAL_SANDBOXED_EXECUTION"],
    "sandboxContractVersion": "2C.3",
    "architecture": "amd64",
    "resourceClass": "standard-v1"
  }
}
```

`nodeId` is a stable logical identity, not a device fingerprint. `incarnation`
is fresh for each Worker process. Equivalent registration is idempotent; a new
incarnation explicitly supersedes the old one. Unsupported or malformed
capabilities fail closed. Safe bounded metadata may be supplied, but no secret
is accepted or returned.

## Heartbeat and control

`POST /v1/nodes/:nodeId/heartbeat` also requires `x-judge-node-token`; it
contains the current `incarnation` and integer `activeJobs`. A stale
incarnation, an invalid load, an offline node, or a draining node is rejected.

Service-authenticated management endpoints use `x-judge-service-token`:

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/nodes` | List persisted nodes in stable `nodeId` order. |
| `GET /v1/nodes/:nodeId` | Read one safe node record. |
| `POST /v1/nodes/:nodeId/drain` | Stop new assignments; active work may finish. |
| `POST /v1/nodes/:nodeId/offline` | Explicitly make a node unschedulable. |

The node record contains identity, runtime version, capabilities, bounded
metadata, configured capacity, active load, state, and last heartbeat time.
It never exposes node credentials, queue lease tokens, source, testdata, or
Product data.

## Assignment control

`POST /v1/nodes/:nodeId/assignments/claim` and
`POST /v1/nodes/:nodeId/assignments/:assignmentId/complete` require node
authentication plus the current incarnation. A claim returns a compatible
leased job only when that exact node was selected. Assignment persistence binds
`judgeJobId`, `nodeId`, incarnation, and attempt generation. Completion with a
stale incarnation or non-current assignment is rejected before it can affect
the existing Judge queue/result authority.

Node credentials are intentionally separate from the Product-to-Service
credential. V1 uses an environment-only bootstrap token with constant-time
comparison; per-node credentials or mTLS are the planned stronger identity
path.
