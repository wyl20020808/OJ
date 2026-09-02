# Product Judge Admin Web Contract V1

Product Backend owns `/api/admin/judge`. Browser clients never receive Judge credentials. Read endpoints proxy summary, nodes, node detail, assignments, jobs, failures, assignment detail and metrics. Control endpoints are drain, offline and enable. Reads require `judge.view`; controls require `judge.manage`; `judge.lifecycle` is reserved and has no V1 route.

Mutation body: `reason`, `expectedIncarnation`, `expectedControlVersion`, `idempotencyKey`. Responses contain only safe Judge projections plus operation/correlation metadata. Pagination is bounded to 1..100 (default 25). Product maps upstream failures to stable 404/409/502/504 codes and never exposes credentials, source, testdata, lease data, stack traces or raw upstream payloads.
