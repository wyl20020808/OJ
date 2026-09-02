# Product Backend Composed Route Matrix V1

Integration branch: `codex/integration-product-backend-runtime-v1`

This matrix records routes registered by the composed central API. `COMPOSED_PASS`
means the route is registered and covered by an owned or central runtime test;
`COMPOSED_UNAVAILABLE_CAPABILITY` is an intentional truthful boundary;
`BLOCKED_UPSTREAM` is registered but depends on a future authoritative service.

| Domain | Method | Route | Source Branch | Composed | Runtime | Authz | Persistence | Capability | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Auth | GET | `/api/auth/capabilities` | Auth V2 | yes | COMPOSED_PASS | public | config | supported | Guest availability is dependency-derived |
| Auth | GET | `/api/auth/methods` | Auth V2 | yes | COMPOSED_PASS | public | config | supported | External providers report `not_configured` |
| Auth | POST | `/api/auth/register` | Auth V2 + Guest V2 | yes | COMPOSED_PASS | public | PostgreSQL | supported | Regular password registration |
| Auth | POST | `/api/auth/login` | Auth V2 + Guest V2 | yes | COMPOSED_PASS | public | PostgreSQL | supported | Unified session authority |
| Auth | POST | `/api/auth/logout` | Auth V2 + Guest V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Revokes current session only |
| Auth | GET | `/api/auth/me` | Auth V2 + Guest V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Guest and regular contexts |
| Auth | GET | `/api/auth/account` | Auth V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Account view |
| Auth | GET/PATCH | `/api/auth/profile` | Auth V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Profile operations |
| Auth | POST | `/api/auth/password`, `/api/auth/password/change` | Auth V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Password change aliases |
| Auth | GET/DELETE/POST | `/api/auth/sessions`, `/api/auth/sessions/:id`, `/api/auth/sessions/revoke-all`, `/api/auth/sessions/revoke-others` | Auth V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Session management |
| Auth | POST | `/api/auth/guest/continue` | Guest Auth V2 | yes | COMPOSED_PASS | public/rate limited | PostgreSQL + Redis | supported | First-use, resume and rotation |
| Auth | DELETE | `/api/auth/guest/resume` | Guest Auth V2 | yes | COMPOSED_PASS | guest session | PostgreSQL | supported | Explicit resume revoke |
| Auth | POST | `/api/auth/verification/challenges`, `/api/auth/verification/request` | Auth V2 | yes | COMPOSED_PASS | public/session | PostgreSQL | provider-gated | Provider may be unavailable |
| Auth | POST | `/api/auth/verification/challenges/:id/verify`, `/api/auth/verification/verify` | Auth V2 | yes | COMPOSED_PASS | public/session | PostgreSQL | provider-gated | Verification contract |
| Auth | POST | `/api/auth/register/verified`, `/api/auth/register/email`, `/api/auth/register/phone` | Auth V2 | yes | COMPOSED_PASS | public | PostgreSQL | provider-gated | Email/SMS adapters are optional |
| Auth | POST | `/api/auth/login/password`, `/api/auth/login/code` | Auth V2 | yes | COMPOSED_PASS | public | PostgreSQL | provider-gated | Password and OTP paths |
| Auth | POST | `/api/auth/login/code/onboarding`, `/api/auth/login/onboarding`, `/api/auth/onboarding`, `/api/auth/oauth/onboarding` | Auth V2 | yes | COMPOSED_PASS | public | PostgreSQL | provider-gated | Onboarding continuation |
| Auth | GET/POST | `/api/auth/oauth/:provider/start`, `/api/auth/oauth/:provider/callback` | Auth V2 | yes | COMPOSED_UNAVAILABLE_CAPABILITY | public | PostgreSQL | not_configured | No external credentials supplied |
| Auth | GET/POST/DELETE | `/api/auth/account/identifiers`, `/api/auth/account/identities`, `/api/auth/account/identifiers/:id` | Auth V2 | yes | COMPOSED_PASS | session | PostgreSQL | supported | Identity management |
| Auth | POST | `/api/auth/account/identities/:provider/link` | Auth V2 | yes | COMPOSED_UNAVAILABLE_CAPABILITY | session | PostgreSQL | not_configured | Provider boundary |
| Contest | GET | `/api/contests` | Contest/Messaging V1 | yes | COMPOSED_PASS | public/participant | PostgreSQL | supported | Bounded list |
| Contest | GET | `/api/contests/home-summary` | Contest/Messaging V1 | yes | COMPOSED_PASS | public/session | PostgreSQL | supported | Home summary |
| Contest | POST | `/api/contests` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | Draft creation |
| Contest | GET/PATCH | `/api/contests/:id` | Contest/Messaging V1 | yes | COMPOSED_PASS | owner/registered/public | PostgreSQL | supported | Detail/update |
| Contest | POST | `/api/contests/:id/publish`, `/api/contests/:id/cancel` | Contest/Messaging V1 | yes | COMPOSED_PASS | owner/manager | PostgreSQL | supported | Lifecycle transitions |
| Contest | PUT/GET | `/api/contests/:id/problems` | Contest/Messaging V1 | yes | COMPOSED_PASS | owner/manager/participant | PostgreSQL | supported | Ordered problem binding |
| Contest | POST/DELETE/GET | `/api/contests/:id/register`, `/api/contests/:id/registration` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | Registration state |
| Contest | GET | `/api/contests/:id/participants` | Contest/Messaging V1 | yes | COMPOSED_PASS | owner/manager | PostgreSQL | supported | Participant listing |
| Contest | GET/POST | `/api/contests/:id/submissions` | Contest/Messaging V1 | yes | BLOCKED_UPSTREAM | authenticated | PostgreSQL | submission adapter | Authoritative Submission binding remains upstream |
| Contest | GET | `/api/contests/:id/standings` | Contest/Messaging V1 | yes | COMPOSED_UNAVAILABLE_CAPABILITY | participant | PostgreSQL | scoring unavailable | Returns `available=false`, `SCORING_ENGINE_NOT_INTEGRATED` |
| Social | GET | `/api/users/search` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | Safe bounded search |
| Social | GET/POST/DELETE | `/api/friend-requests`, `/api/friend-requests/:id/:action`, `/api/friend-requests/:id` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated/participant | PostgreSQL | supported | Request lifecycle and idempotence |
| Social | GET/DELETE | `/api/friends`, `/api/friends/:userId` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | Friendship lifecycle |
| Messaging | POST/GET | `/api/conversations/direct`, `/api/conversations` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated/member | PostgreSQL | supported | Direct conversation is idempotent |
| Messaging | POST/GET | `/api/conversations/:id/messages`, `/api/conversations/:id/read` | Contest/Messaging V1 | yes | COMPOSED_PASS | member | PostgreSQL | supported | Message send/list/read |
| Messaging | GET | `/api/messages/unread-count` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | Recipient-scoped unread count |
| Notifications | GET | `/api/notifications` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | User-scoped list |
| Notifications | GET | `/api/notifications/unread-count` | Contest/Messaging V1 | yes | COMPOSED_PASS | authenticated | PostgreSQL | supported | User-scoped count |
| Notifications | POST | `/api/notifications/:id/read`, `/api/notifications/read-all` | Contest/Messaging V1 | yes | COMPOSED_PASS | owner | PostgreSQL | supported | Read state |
| Profile | GET | `/api/profile/capabilities` | Runtime Gap Closure V1 | yes | COMPOSED_PASS | public/session/guest | PostgreSQL contract | supported/unavailable | Truthful per-capability availability and reasons |
| Profile | GET | `/api/profiles/:username` | Runtime Gap Closure V1 | yes | COMPOSED_PASS | public | PostgreSQL | supported | Safe public projection excludes email and phone |
| Profile | GET/POST/DELETE | `/api/profile/favorites`, `/api/profile/favorites/:problemId` | Runtime Gap Closure V1 | yes | COMPOSED_PASS | password session | PostgreSQL | supported | User-scoped, idempotent public published problem favorites |
| Profile | GET | `/api/profile/contests` | Runtime Gap Closure V1 | yes | COMPOSED_PASS | password session | PostgreSQL | supported | Created, managed and registered projections reuse contest data |
| Profile | GET | `/api/profile/problems` | Runtime Gap Closure V1 | yes | COMPOSED_PASS | password session | PostgreSQL | supported | Authored projection reuses `problems.author_id` |
| Platform | GET | `/health`, `/ready`, `/openapi.json` | Integration | yes | COMPOSED_PASS | public | dependency checks | supported | Readiness requires PostgreSQL, Redis and Storage |

No Web, Judge Worker, Sandbox, Queue, Phase 2C or Verdict Engine route was
introduced by this Goal. Standings and contest submission binding remain honest
upstream boundaries rather than synthetic results.
