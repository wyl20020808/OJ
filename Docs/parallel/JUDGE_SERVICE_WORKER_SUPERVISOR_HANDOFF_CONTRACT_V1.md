# Judge Service / Worker / Supervisor Handoff Contract V1

Phase 2C.7B-R1 defines the narrow service-mode handoff from a scheduled Judge
Service assignment to the per-node Supervisor. It does not alter Product
publication, node scheduling policy, or sandbox authority.

## Assignment claim

The current registered Worker calls
`POST /v1/nodes/:nodeId/assignments/claim` using the node credential and its
fresh incarnation. A successful response binds all of these values together:

- assignment ID, Judge job ID, node ID, node incarnation, and attempt
  generation;
- current lease token and lease owner (`nodeId:incarnation`);
- immutable job/testcase-set payload, language profile, execution mode, and
  execution identity.

The Worker validates the known identity, lease, attempt, status, and execution
mode fields before entering `BUSY`. Unknown additive JSON fields remain
forward-compatible. An absent assignment must be exactly
`{ "assignment": null, "reason": "NO_COMPATIBLE_JUDGE_NODE" }`.

## Supervisor routing

Each real-execution Worker is configured with one loopback Supervisor URL. The
Worker performs its Supervisor preflight before registration, then passes only
the claimed immutable execution request to that configured Supervisor. The
Supervisor creates the execution-set record and remains the only process that
compiles or executes untrusted source. Different logical nodes use distinct
Worker processes and distinct Supervisor endpoints; the Judge Service neither
executes source nor selects a shared hidden Supervisor target.

For real testcase-set jobs, the Worker sends the Phase 2C.4 execution-set
request containing the Judge job/evaluation attempt identity, testcase-set
manifest and hash, C++20 profile, source digest and source payload, deadline,
and cancellation generation. A transport, request-validation, or Supervisor
pipeline infrastructure failure resolves through the existing retry path as a
verdict-free infrastructure failure.

The Supervisor accepts this JSON request only within a bounded 8 MiB envelope.
That covers the V1 maximum of 64 base64-encoded 64 KiB testcase inputs and a
256 KiB source snapshot, including JSON escaping and contract metadata; an
oversized request remains rejected before execution-set creation.

## Completion and cancellation

The Worker completes or resolves only through the assignment-bound Judge
Service endpoints using the same node incarnation and lease token. The service
checks the current assignment before changing queue/result authority, and
stale or wrong lease authority is rejected.

An external Service cancellation is observed by the active Worker through
`POST /v1/nodes/:nodeId/assignments/:assignmentId/cancellation-status`, with
the current incarnation. The response is only `{ "cancelRequested": boolean
}`. It deliberately does not expose a Redis prefix, queue key, lease token, or
tokenless cancellation action. The Worker then resolves cancellation with its
current lease; terminal cancellation remains idempotent for convergence with an
external cancellation.

An unavailable or malformed cancellation-status response is never interpreted
as cancellation and never falls back to a Worker-local Redis prefix. The
Worker emits one safe `worker_cancellation_observation_error` event per
contiguous assignment observation failure, then resets that rate limit after a
valid response. The bounded execution and lease-bound completion authority
remain unchanged.

## Boundary and transport

`JUDGE_NODE_TOKEN` is carried on each node-control request and must be separate
from the Product-to-Service credential. Loopback HTTP is allowed for local
qualification only. A non-loopback `JUDGE_SERVICE_URL` must use HTTPS. This
contract does not claim mTLS, per-node credentials, HA, multi-machine routing,
or production sandbox qualification.
