# Product Backend New Contracts V1

All authenticated profile mutation/projection endpoints require a password-strength session. Guest requests receive `403 GUEST_ACCOUNT_REQUIRES_UPGRADE`; anonymous requests receive `401 UNAUTHENTICATED`. Errors use `{ code, message, requestId }`.

| Endpoint | Auth | Request | Response | Pagination | Persistence/Authz |
|---|---|---|---|---|---|
| `GET /api/profile/capabilities` | optional | none | `contractVersion` plus per-domain `{available}` or `{available:false,reason}` | none | Truthful capability report; no user data |
| `GET /api/profiles/:username` | public | bounded username path | username, displayName, createdAt, public capability states | none | No email, phone, session, Guest token, or private projection |
| `GET /api/profile/favorites` | password | `limit` 1..100, opaque cursor | public published problem summaries and authoritative total | createdAt/problem-id descending cursor | User-scoped `problem_favorites` data; migration `0011` |
| `POST /api/profile/favorites/:problemId` | password | public published problem ID | `201` first add, `200` existing; `favorited:true` | none | `(user_id,problem_id)` primary key gives idempotence |
| `DELETE /api/profile/favorites/:problemId` | password | problem ID | `204`, including absent favorite | none | User-scoped idempotent delete |
| `GET /api/profile/contests` | password | `kind=CREATED|MANAGED|REGISTERED`, limit/cursor | existing contest fields plus relationship | relationshipAt/id descending cursor | Reuses owner, manager role, and active registration records |
| `GET /api/profile/problems` | password | limit/cursor | existing authored problem fields and authoritative total | createdAt/id descending cursor | Reuses `problems.author_id`; no guessed ownership |

Unavailable capability reasons are stable: `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE`, `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME`, and `PRODUCT_DOMAIN_NOT_IMPLEMENTED`.
