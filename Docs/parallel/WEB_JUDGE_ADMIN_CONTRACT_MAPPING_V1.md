# Web Judge Admin Contract Mapping V1

The UI uses `apps/web/src/services/judge-admin.ts` and calls only Product Backend `/api/admin/judge`.

| UI capability | Product endpoint |
|---|---|
| summary | `GET /summary` |
| node list/detail | `GET /nodes`, `GET /nodes/:nodeId` |
| assignments/jobs/failures | `GET /nodes/:nodeId/{assignments,jobs,failures}` |
| controls | `POST /nodes/:nodeId/{drain,offline,enable}` |

Mutation bodies include `reason`, `expectedIncarnation`, `expectedControlVersion`, and generated `idempotencyKey`. The browser never calls Judge Service `/v1/admin` and never exposes service tokens. Start/Stop/Restart remain disabled with `HOST_AGENT_NOT_AVAILABLE`.
