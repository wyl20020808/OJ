# Web Profile Backend Contract Mapping V1

Goal: `OJPLATFORM-PRODUCT-WEB-BACKEND-POST-PARALLEL-REQUALIFICATION-V1`

## Capability Contract

| Backend contract | Web client / route | UI behavior | Boundary |
|---|---|---|---|
| `GET /api/profile/capabilities` | `profileCapabilities()`; `/profile` | Drives each Profile capability state and reason | Missing/error state has retry; unavailable state has no fake data |
| `activity` | Profile overview / 做题记录 | Shows `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE` | No local activity aggregation |
| `heatmap` | Profile overview capability card | Shows upstream-blocked explanation | No heatmap cells are fabricated |
| `favorites` | Profile 收藏 tab | Lists, adds, removes and loads cursor pages when supplied | Password session only; Guest/anonymous denied |
| `myContests` | Profile 我的比赛 tab | Filters all/CREATED/MANAGED/REGISTERED and renders relationship | Password session only |
| `myProblems` | Profile 我的题目 tab | Renders authored-problem projection and cursor continuation | Password session only |
| `wrongbook` | Profile overview capability card and `/wrong-book` truth boundary | Shows submission-outcome dependency | No inferred failed submissions |
| `teams` | Profile overview / 团队 tab | Shows `PRODUCT_DOMAIN_NOT_IMPLEMENTED` | No fabricated memberships |
| `homework` | Profile overview capability card and `/homework` truth boundary | Shows `PRODUCT_DOMAIN_NOT_IMPLEMENTED` | No fabricated assignments or progress |

## Public Profile

`GET /api/profiles/:username` is mapped to `/profiles/:username`. Only `username`, `displayName`, `createdAt` and capabilities are rendered. Live and test evidence confirms email, phone, session and token fields are not rendered.

## Favorites

`GET /api/profile/favorites?limit=&cursor=`, `POST /api/profile/favorites/:problemId`, and `DELETE /api/profile/favorites/:problemId` are exposed by `createApiClient`. Add/remove actions clear or update server-backed state and expose actionable retry feedback instead of optimistic success on failure. Backend runtime evidence: first add 201, duplicate add 200, remove 204, and state survives API restart.

## My Contests / My Problems

The Web uses the dedicated password-only projections rather than substituting the public contest/problem lists. Contest relationship filters are `CREATED`, `MANAGED`, and `REGISTERED`; authored problems come from `/api/profile/problems`.

## Error and Privacy Contract

401, 403, 404, 409, 429 and 5xx responses map to user-facing actionable messages. Stable Backend reason codes remain in capability notices. Public projections never display private identifiers. Unavailable data is not replaced by empty local authoritative state.
