# Judge Service API Contract V1

Base path: `/v1`. Management and job endpoints require the
`x-judge-service-token` header. Node registration, heartbeat, claim and
assignment resolution endpoints require the separate `x-judge-node-token`.
Both are environment-only credentials and compared in constant time.

| Endpoint | Contract |
| --- | --- |
| `GET /health` | Process liveness. |
| `GET /ready` | Redis and Judge DB readiness. |
| `GET /v1/capabilities` | V1 language, checker, verdict and limitation metadata. |
| `POST /v1/jobs` | Accept an idempotent job request and return its safe DTO. |
| `GET /v1/jobs/:id` | Return the current safe Judge DTO. |
| `GET /v1/jobs/:id/history` | Return all durable evaluation generations for the same opaque external reference. |
| `POST /v1/jobs/:id/cancel` | Cancel a nonterminal evaluation; cancellation has no verdict. |
| `POST /v1/jobs/:id/rejudge` | Create a new generation using a new client request ID. |
| `POST /v1/nodes/register` | Register a stable node identity with a fresh runtime incarnation and capabilities. |
| `POST /v1/nodes/:nodeId/heartbeat` | Report the current incarnation and active load. |
| `GET /v1/nodes`, `GET /v1/nodes/:nodeId` | Authenticated management read of safe node state. |
| `POST /v1/nodes/:nodeId/drain`, `POST /v1/nodes/:nodeId/offline` | Authenticated management state transition. |
| `POST /v1/nodes/:nodeId/assignments/claim` | Node-only deterministic, capability-aware assignment claim. |
| `POST /v1/nodes/:nodeId/assignments/:assignmentId/complete` | Node-only real result completion, bound to node incarnation and lease. |
| `POST /v1/nodes/:nodeId/assignments/:assignmentId/resolve` | Node-only fixture/retry/failure/cancellation resolution, bound to node incarnation and lease. |
| `POST /v1/nodes/:nodeId/assignments/:assignmentId/cancellation-status` | Node-only read of cancellation state for that node's current assignment and incarnation. |

Submit requires `clientRequestId`, opaque `externalSubmissionId`, immutable
problem/testdata references, `cpp20`, and the existing validated execution
payload. The response includes only `apiVersion`, job/reference/generation
identities, state, trusted verdict when terminal, safe digest, and timestamps.
It never includes source, expected output, stdout/stderr, queue lease, Worker
identity, score, rank, penalty, or contest semantics.

The scheduler considers only fresh `ONLINE`/`BUSY` nodes with spare capacity
and matching language profile, checker, and execution mode. It orders eligible
nodes by normalized load, then stable node ID. Stale incarnation heartbeats and
assignment resolutions are rejected; node credentials, lease tokens, Worker
identity, source, and execution output remain absent from management/job DTOs.

The assignment-bound cancellation-status endpoint accepts only the current
`incarnation` and returns `{ "cancelRequested": boolean }`. A stale,
superseded, or non-current assignment is rejected. It intentionally gives a
Worker no Redis prefix or tokenless queue-cancellation authority; service-mode
Workers use this contract rather than assuming their local `QUEUE_PREFIX`
matches the Judge Service prefix.
