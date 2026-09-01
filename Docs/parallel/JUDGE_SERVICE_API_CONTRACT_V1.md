# Judge Service API Contract V1

Base path: `/v1`. All endpoints except `/health` and `/ready` require the
`x-judge-service-token` header. The token is an environment-only service
credential and is compared in constant time.

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

Submit requires `clientRequestId`, opaque `externalSubmissionId`, immutable
problem/testdata references, `cpp20`, and the existing validated execution
payload. The response includes only `apiVersion`, job/reference/generation
identities, state, trusted verdict when terminal, safe digest, and timestamps.
It never includes source, expected output, stdout/stderr, queue lease, Worker
identity, score, rank, penalty, or contest semantics.

Capabilities report `cpp20-gcc-13-v1`, `EXACT_BYTES`, `TOKEN_WHITESPACE`,
`AC/WA/CE/RE/TLE/MLE`, and
`MULTI_NODE_DYNAMIC_MANAGEMENT = NOT_YET_QUALIFIED`.
