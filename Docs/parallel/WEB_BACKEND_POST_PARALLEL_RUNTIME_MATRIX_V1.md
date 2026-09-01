# Web Backend Post-Parallel Runtime Matrix V1

Goal: `OJPLATFORM-PRODUCT-WEB-BACKEND-POST-PARALLEL-REQUALIFICATION-V1`

Date: 2026-09-02 (Asia/Shanghai)

Overall result: `PARTIAL`. Web-owned wiring and all Web quality gates are implemented and tested. The result remains partial because the fixed Backend has known contract gaps and the shared local dependency containers were externally stopped after the final runtime evidence.

## Runtime Topology

| Item | Evidence | Result |
|---|---|---|
| Web branch / start HEAD | `codex/product-web-backend-post-parallel-requalification-v1` / `5df3a1f52693cde1ffd923c9de8869e53d6ef989` | MATCH |
| Backend branch / HEAD | `codex/product-backend-runtime-gap-closure-v1` / `3faec4de0449f453115f6258a017a615caf886de` | MATCH |
| Product API | `http://127.0.0.1:3010` | RUNTIME VERIFIED intermittently |
| Web | Vite `http://127.0.0.1:5177` | RUNTIME VERIFIED |
| API health/readiness | `/health` and `/ready` returned `200`; dependencies reported PostgreSQL, Redis and Storage `ok` during qualified runs | PASS |
| Browser API path | Vite same-origin `/api` and `/ready` proxy to `127.0.0.1:3010`; direct cross-port CORS is a Backend gap | MATCH / BACKEND_BUG |

## WB-RQ-01..90

| ID | Result | Evidence / qualification note |
|---|---|---|
| WB-RQ-01 | MATCH | Web start/final branch audit |
| WB-RQ-02 | MATCH | Fixed Backend HEAD audit |
| WB-RQ-03 | MATCH | Recommended Web branch verified |
| WB-RQ-04 | MATCH | Expected Backend branch verified |
| WB-RQ-05 | MATCH | `/health` 200 |
| WB-RQ-06 | MATCH | `/ready` 200 with all dependencies `ok` during runtime runs |
| WB-RQ-07 | MATCH | Vite proxy and same-origin browser requests |
| WB-RQ-08 | MATCH | `/api/profile/capabilities` loaded in live Guest browser and Web tests |
| WB-RQ-09 | MATCH | Stable capability reason mapping in Profile UI and regression tests |
| WB-RQ-10 | MATCH | Public profile route and safe projection rendered |
| WB-RQ-11 | MATCH | Public response/UI contains no email |
| WB-RQ-12 | MATCH | Public response/UI contains no phone |
| WB-RQ-13 | MATCH | Favorites list client route and Backend runtime evidence |
| WB-RQ-14 | MATCH | Favorite add 201 and Web mutation test |
| WB-RQ-15 | MATCH | Duplicate favorite add 200/idempotent |
| WB-RQ-16 | MATCH | Favorite remove 204 and persistence evidence |
| WB-RQ-17 | TEST_BLOCKED | Cursor support is implemented and client contract-tested; a multi-page live fixture was not created |
| WB-RQ-18 | MATCH | Favorite add/remove survived controlled API restart |
| WB-RQ-19 | MATCH | Guest favorite capability/endpoint denial is truthful (`403 GUEST_ACCOUNT_REQUIRES_UPGRADE`) |
| WB-RQ-20 | MATCH | Anonymous favorite denial is truthful (`401 UNAUTHENTICATED`) |
| WB-RQ-21 | MATCH | My Contests `CREATED` projection and tab mapping |
| WB-RQ-22 | TEST_BLOCKED | `MANAGED` mapping is implemented and Backend query-audited; no isolated live manager-role fixture was created |
| WB-RQ-23 | MATCH | My Contests `REGISTERED` projection and live registration evidence |
| WB-RQ-24 | MATCH | My Problems authored projection and tab mapping |
| WB-RQ-25 | MATCH | Guest My Contests shows exact upgrade boundary and retry |
| WB-RQ-26 | MATCH | Guest My Problems shows exact upgrade boundary and retry |
| WB-RQ-27 | MATCH | Activity shows `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE` |
| WB-RQ-28 | MATCH | Heatmap capability is projected without fabricated data |
| WB-RQ-29 | MATCH | Wrong-book capability is projected without fabricated data |
| WB-RQ-30 | MATCH | Teams/Homework capability reasons are projected truthfully |
| WB-RQ-31 | MATCH | Contest list live browser/API |
| WB-RQ-32 | MATCH | Contest detail live browser/API |
| WB-RQ-33 | MATCH | Contest create 201 in isolated two-account fixture |
| WB-RQ-34 | MATCH | Owner edit 200; non-owner edit 403 |
| WB-RQ-35 | MATCH | Contest problem membership read/write 200 |
| WB-RQ-36 | MATCH | Contest publish 200 |
| WB-RQ-37 | MATCH | Registration 200 `REGISTERED` |
| WB-RQ-38 | MATCH | Participants endpoint included registered account |
| WB-RQ-39 | MATCH | Contest authz 403 evidence |
| WB-RQ-40 | MATCH | Standings remains unavailable and now preserves `SCORING_ENGINE_NOT_INTEGRATED` |
| WB-RQ-41 | MATCH | User search 200 |
| WB-RQ-42 | MATCH | Friend request create 201 |
| WB-RQ-43 | MATCH | Friend request accept 200 `ACCEPTED` |
| WB-RQ-44 | TEST_BLOCKED | Duplicate request 409 is live; cancel/reject request action is covered by Web regression tests but not isolated live fixture |
| WB-RQ-45 | MATCH | Friends list hydrated |
| WB-RQ-46 | MATCH | Remove friend 204 |
| WB-RQ-47 | MATCH | Direct conversation create 201 |
| WB-RQ-48 | TEST_BLOCKED | Direct conversation creation is live; full nonempty list rendering is Web regression tested but not isolated live fixture |
| WB-RQ-49 | MATCH | Message list/read persisted |
| WB-RQ-50 | MATCH | Message send 201 |
| WB-RQ-51 | MATCH | Conversation read 204 and unread transition |
| WB-RQ-52 | MATCH | Duplicate `clientMessageId` returned same message with 200 |
| WB-RQ-53 | MATCH | Unread message count changed authoritatively |
| WB-RQ-54 | MATCH | Notification list 200 |
| WB-RQ-55 | MATCH | Notification unread count 200 |
| WB-RQ-56 | MATCH | Single notification read 204 |
| WB-RQ-57 | MATCH | Notification read-all 204 |
| WB-RQ-58 | MATCH | Notification state survived reload/restart evidence |
| WB-RQ-59 | MATCH | Home contest summary consumed composed route |
| WB-RQ-60 | MATCH | No Home notification summary is exposed; no fake summary is shown (N/A by current product surface) |
| WB-RQ-61 | MATCH | Anonymous protected route 401 `UNAUTHENTICATED` |
| WB-RQ-62 | MATCH | Guest/non-owner 403 boundaries |
| WB-RQ-63 | MATCH | Valid absent contest UUID 404 `CONTEST_NOT_FOUND` |
| WB-RQ-64 | MATCH | Duplicate friend request 409 |
| WB-RQ-65 | MATCH | Isolated search loop produced 429 `RATE_LIMITED` |
| WB-RQ-66 | PARTIAL / BACKEND_BUG | UI 5xx retry paths are tested; malformed contest ID exposes Backend PostgreSQL `22P02` as 500 |
| WB-RQ-67 | MATCH | Controlled API restart and readiness recovery |
| WB-RQ-68 | MATCH | Cookies/server state and Web reload remained authoritative after restart |
| WB-RQ-69 | MATCH | No local-only persistence or optimistic fake success |
| WB-RQ-70 | MATCH | Bounded aggregate test run completed without the historical silent hang |
| WB-RQ-71 | MATCH | No aggregate blocker reproduced in final passing run |
| WB-RQ-72 | MATCH | `pnpm test`: 638 passed, 4 skipped |
| WB-RQ-73 | MATCH | `pnpm test:web`: 11 passed |
| WB-RQ-74 | MATCH | `pnpm typecheck` passed |
| WB-RQ-75 | MATCH | `pnpm lint` passed |
| WB-RQ-76 | MATCH | `pnpm format:check` passed |
| WB-RQ-77 | MATCH | `pnpm test:architecture` passed |
| WB-RQ-78 | MATCH | `pnpm build` passed |
| WB-RQ-79 | MATCH | `pnpm integration`: 4 passed after temporary infrastructure recovery |
| WB-RQ-80 | MATCH | `git diff --check` passed |
| WB-RQ-81 | PARTIAL / ENVIRONMENT_BLOCKED | Desktop `1440x900` content flow passed before final runtime shutdown; final-code layout check passed |
| WB-RQ-82 | PARTIAL / ENVIRONMENT_BLOCKED | Tablet `1024x768` content flow passed before final runtime shutdown; final-code layout check passed |
| WB-RQ-83 | PARTIAL / ENVIRONMENT_BLOCKED | Mobile `390x844` content flow passed before final runtime shutdown; final-code layout check passed |
| WB-RQ-84 | MATCH | No horizontal overflow on required routes/viewports |
| WB-RQ-85 | MATCH | Browser console error count 0 in qualified runs |
| WB-RQ-86 | MATCH | Browser console warning count 0 in qualified runs |
| WB-RQ-87 | MATCH | No uncaught promise rejection observed |
| WB-RQ-88 | MATCH | No obvious failed API retry loop; explicit retry controls only |
| WB-RQ-89 | MATCH | Temporary fixture identifiers and Goal extraction removed; runtime cleanup at finalization |
| WB-RQ-90 | MATCH | Tracked Web worktree clean after scoped commit (final audit) |

## Backend-Owned Findings

- Direct `3010` CORS preflight does not return `Access-Control-Allow-Credentials: true`. Web therefore qualifies only through the Vite same-origin proxy. Classification: `BACKEND_BUG`.
- `GET /api/contests/not-a-real-id` returns 500 with PostgreSQL `22P02`; a valid absent UUID returns the expected 404. Classification: `BACKEND_BUG`.
- `canManage` in the contest projection is owner-only although manager-role management routes exist. Classification: `BACKEND_BUG`.
- Activity, heatmap, wrong-book, teams and homework remain explicit unavailable/upstream-blocked capabilities. Classification: `CAPABILITY_UNAVAILABLE` / `UPSTREAM_BLOCKED`; no fake data is shown.

## Final Environment Note

After the successful fixture and integration evidence, an external/shared process sent SIGTERM to the WSL dependency containers. A final start attempt briefly returned `/ready` 200, then the containers and API were stopped again. This is recorded as `ENVIRONMENT_BLOCKED` for a final live reload, not as a Web implementation failure.
