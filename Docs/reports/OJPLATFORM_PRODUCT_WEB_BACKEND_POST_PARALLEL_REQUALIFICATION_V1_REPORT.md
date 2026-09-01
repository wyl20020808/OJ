# OJPlatform Product Web Backend Post-Parallel Requalification V1 Report

## Final Status

`PARTIAL`

The Web implementation is complete for the in-scope wiring and passes the Web quality gates. The overall Goal is `PARTIAL` because the fixed Backend exposes three known contract gaps (direct CORS credentials, malformed contest-id validation, and manager-role `canManage`) and the shared dependency runtime was externally stopped after the final passing runtime/integration evidence. No production-readiness claim is made.

## Required Flags

`WEB ↔ BACKEND RUNTIME MATCH = PARTIAL`

`PROFILE NEW CONTRACTS WIRED = YES`

`AGGREGATE TEST SUITE = PASS`

`3-VIEWPORT BROWSER ACCEPTANCE = BLOCKED` for final live-content refresh after the shared runtime shutdown; qualified pre-shutdown runs and final-code layout checks passed

`READY FOR PRODUCT INTEGRATION NEXT STEP = NO` (Lead Integration was explicitly not executed; resolve/accept the listed gaps first)

## Git and Scope

- Web worktree: `D:\OJPlatform-worktrees\phase1b-web-authoring`
- Web start HEAD: `5df3a1f52693cde1ffd923c9de8869e53d6ef989`
- Web branch: `codex/product-web-backend-post-parallel-requalification-v1`
- Backend runtime branch/HEAD: `codex/product-backend-runtime-gap-closure-v1` / `3faec4de0449f453115f6258a017a615caf886de`
- Final implementation commit: recorded by the final Git audit after this report was added.
- Only Web source/tests and this Goal's Web documentation were changed. Backend and Judge were not modified. `Docs/PROJECT_STATUS.md` was not updated. No merge and no Lead Integration were performed.

## Runtime Topology and Evidence

The qualified topology was Vite Web `127.0.0.1:5177` using its same-origin `/api` and `/ready` proxy to the fixed Product API `127.0.0.1:3010`, backed by real PostgreSQL, Redis and Storage. `/health` and `/ready` returned 200 with all dependencies `ok` during the successful runs. The direct cross-port CORS limitation is recorded as `BACKEND_BUG`; browser traffic was never qualified by bypassing the proxy.

The two-account fixture completed contest creation/edit/membership/publish/register/participants, social request/duplicate/accept/friends/remove, direct conversation/message/read/idempotency, notification list/unread/read/read-all, 401/403/404/409/429 paths, and controlled API restart persistence. Fixture identities and rows were removed.

## Implemented Web Work

- Added Profile capability and public-profile routing with privacy-safe projection.
- Wired Favorites list/add/remove, idempotency-aware server behavior, cursor continuation, and retryable errors.
- Wired My Contests relationship projections and My Problems authored projection.
- Preserved truthful Activity, Heatmap, Wrong-book, Teams and Homework unavailable states.
- Preserved Contest/Social/Messaging/Notifications runtime wiring and actionable 5xx/unread/profile retry states.
- Preserved Backend standings reason `SCORING_ENGINE_NOT_INTEGRATED` instead of replacing it with a generic integration label.
- Kept the Vite same-origin proxy as the browser contract; no Backend CORS workaround was added.

## Quality Gates

| Command | Result |
|---|---|
| `pnpm test` | PASS: 29 files, 638 passed, 4 skipped |
| `pnpm test:web` | PASS: 11 passed |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm test:architecture` | PASS |
| `pnpm build` | PASS |
| `pnpm integration` | PASS: 1 file, 4 passed after temporary infrastructure recovery |
| `git diff --check` | PASS |

## Profile / Domain Results

Profile capabilities, public profile, Favorites, My Contests and My Problems are wired to the dedicated Backend contracts. Password accounts use server-scoped projections; Guest receives `403 GUEST_ACCOUNT_REQUIRES_UPGRADE`; anonymous protected projections receive `401 UNAUTHENTICATED`. Public profile output omits email, phone, session and token. Capability reasons remain visible and no local fake data is generated.

Contest list/detail/create/edit/problems/publish/register/participants and authorization paths passed the isolated fixture. Social search/request/accept/friends/remove, direct conversation/message send/read/unread and client-message idempotency, and notification list/unread/single-read/read-all/user scoping passed. Manager projection, friend reject/cancel, and nonempty conversation-list live fixtures remain explicitly test-blocked; Web regression tests cover their client wiring. Standings remains explicitly unavailable with `SCORING_ENGINE_NOT_INTEGRATED`.

## Browser Acceptance

Required viewports `1440x900`, `1024x768`, and `390x844` were checked on login/register/Guest presentation, problem list/detail, contest routes, social/messaging, notifications, public/profile routes and unavailable capability states. Screenshots and DOM metrics showed no horizontal overflow; qualified browser runs observed zero console errors, zero warnings, no uncaught promise rejection and no retry loop. A later final refresh could not rehydrate server data because the shared API/dependency process was externally stopped; this is recorded as `ENVIRONMENT_BLOCKED`, while the completed browser evidence remains valid.

## Error Paths and Persistence

401, 403, 404, 409 and safely reproducible 429 responses were observed with stable error semantics. Web regression tests cover 5xx-to-retry-to-success for contest, notification, messaging and Profile projections, and unread-count failures no longer become false zero states. A malformed contest ID is a Backend-owned 500/`22P02` gap; Web does not expose raw internals. Favorite add/remove, contest registration, message and notification state survived the controlled API restart/reload checks.

## WB-RQ-01..90

The itemized ledger is in [WEB_BACKEND_POST_PARALLEL_RUNTIME_MATRIX_V1.md](../parallel/WEB_BACKEND_POST_PARALLEL_RUNTIME_MATRIX_V1.md). The complete result is: `WB-RQ-01..16 MATCH`, `WB-RQ-17 TEST_BLOCKED`, `WB-RQ-18..21 MATCH`, `WB-RQ-22 TEST_BLOCKED`, `WB-RQ-23..43 MATCH`, `WB-RQ-44 TEST_BLOCKED`, `WB-RQ-45..47 MATCH`, `WB-RQ-48 TEST_BLOCKED`, `WB-RQ-49..65 MATCH`, `WB-RQ-66 PARTIAL / BACKEND_BUG`, `WB-RQ-67..80 MATCH`, `WB-RQ-81..83 PARTIAL / ENVIRONMENT_BLOCKED`, and `WB-RQ-84..90 MATCH` with the final cleanup audit noted below. Every item, evidence source and classification is itemized in the matrix.

## Remaining Gaps

See [WEB_BACKEND_POST_PARALLEL_REMAINING_GAPS_V1.md](../parallel/WEB_BACKEND_POST_PARALLEL_REMAINING_GAPS_V1.md). Classifications are `BACKEND_BUG`, `CAPABILITY_UNAVAILABLE`, `UPSTREAM_BLOCKED`, `TEST_BLOCKED`, and `ENVIRONMENT_BLOCKED`; no known `WEB_BUG` remains. The manager-role, malformed-id and direct-CORS issues remain outside Web ownership and were not silently patched.

## Cleanliness and Stop Conditions

The temporary `.goal-requal-read` extraction directory and fixture artifacts are removed. The final scoped commit and final `git status`/`git diff` audit establish a clean tracked Web worktree. The Goal does not update `PROJECT_STATUS`, merge branches, or start Lead Integration. Final HEAD is the SHA printed by the final Git audit after the scoped commit.
