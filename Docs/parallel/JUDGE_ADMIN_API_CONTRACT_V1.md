# Judge Admin API Contract V1

All `/v1/admin/*` routes require `x-judge-service-token`; node credentials are rejected. Responses are bounded JSON and omit source, testdata, stdout/stderr, lease tokens, node/service/product credentials and stack traces.

Read: `GET /v1/admin/cluster/summary`, `/nodes` (optional bounded `limit` <=100 and `state` filter), `/nodes/:nodeId`, `/metrics`. Control: `POST /nodes/:nodeId/drain`, `/offline`, `/enable`; enable accepts optional `expectedIncarnation` and `expectedControlVersion`, stale values return `409 STALE_CONTROL_VERSION`. Drain/offline are idempotent intent writes. Assignment/job/failure history is reserved until a canonical bounded projection exists.
