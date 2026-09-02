# Problem Judge Data 3C Real Runtime Matrix V1

| Flow | Status | Evidence |
| --- | --- | --- |
| Migration `0012` then `0013`/`0014` | TESTED | `pnpm db:migrate` passed against the local PostgreSQL runtime. |
| PostgreSQL + Redis + MinIO Product runtime | RUNTIME VERIFIED | Product API `/ready` returned `200 {postgres: ok, redis: ok, storage: ok}`. Product startup provisioned the configured private MinIO bucket. |
| Guest G1 editor | RUNTIME VERIFIED | G1 created a private Draft, saved the statement and Judge defaults, uploaded one `.in`/`.out` pair and one ZIP batch, set independent limits on one testcase, validated, published v1, reloaded, changed the new Draft, and published v2. |
| Version history and immutability | RUNTIME VERIFIED | Reloaded editor showed v2 with one testcase and preserved v1 with two testcases; the new Draft and v2 did not overwrite v1. |
| Guest G2 authorization | RUNTIME VERIFIED | A separate Product Guest session received `403 FORBIDDEN` for owner-problem PATCH and Judge Data metadata; Judge Admin nodes also returned `403 FORBIDDEN`. |
| Responsive editor | RUNTIME VERIFIED | Desktop `1440x900`, tablet `1024x768`, and mobile `390x844` each rendered the authenticated editor with `scrollWidth === clientWidth`; browser console contained no errors. |

The browser used only Product API paths. No Judge object transfer, submission, Worker execution, direct Judge Service call, MinIO credential, hidden testcase byte, or production qualification is claimed.
