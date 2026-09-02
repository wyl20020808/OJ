# Web Backend Post-Parallel Remaining Gaps V1

Goal: `OJPLATFORM-PRODUCT-WEB-BACKEND-POST-PARALLEL-REQUALIFICATION-V1`

Every remaining item is assigned one of the required classifications.

| Classification | Item | Owner / evidence | Next boundary |
|---|---|---|---|
| `BACKEND_BUG` | Direct cross-port CORS preflight omits `Access-Control-Allow-Credentials: true`. | Fixed Backend runtime; Web uses Vite same-origin proxy. | Backend CORS policy/contract owner |
| `BACKEND_BUG` | Malformed contest id returns PostgreSQL `22P02` as HTTP 500 instead of a stable client error. | Live `GET /api/contests/not-a-real-id`; valid absent UUID is 404. | Backend route validation owner |
| `BACKEND_BUG` | Contest projection `canManage` is owner-only despite manager-role management route support. | Backend source/runtime audit. | Backend contest authorization owner |
| `CAPABILITY_UNAVAILABLE` | Activity has no authoritative product activity source. | Capability reason `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE`; Profile displays it. | Product activity source |
| `UPSTREAM_BLOCKED` | Heatmap and wrong-book depend on authoritative submission outcomes not supplied by Verdict Engine. | Capability reason `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME`; no data fabricated. | Verdict/submission outcome owner |
| `CAPABILITY_UNAVAILABLE` | Teams and Homework product domains are not implemented. | Capability reason `PRODUCT_DOMAIN_NOT_IMPLEMENTED`; no controls imply availability. | Product domain owners |
| `TEST_BLOCKED` | A multi-page live Favorites cursor fixture was not created; cursor request/response wiring is unit/contract tested. | `WB-RQ-17`; no safe need to create large persistent fixture during finalization. | Future isolated data-volume qualification |
| `TEST_BLOCKED` | Live manager projection, friend reject/cancel, and a nonempty conversation-list fixture were not created. | Web/API contracts and regression tests cover the wiring; the two-account runtime fixture covered create/accept/remove/direct send/read. | Future isolated multi-account fixture qualification |
| `ENVIRONMENT_BLOCKED` | Shared WSL PostgreSQL/Redis/Storage containers and API were externally stopped after final passing evidence, preventing one final browser data refresh. | Last passing `/ready` had all three dependencies `ok`; later `infra:status` was empty and 3010 refused connections. | Shared runtime owner must leave containers running |

No `WEB_BUG` remains known after the standings reason and Profile capability projection fixes. No `TODO` is used as a gap classification.
