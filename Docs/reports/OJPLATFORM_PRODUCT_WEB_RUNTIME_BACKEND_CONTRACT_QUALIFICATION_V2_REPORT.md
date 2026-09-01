# OJPlatform Product Web Runtime Backend Contract Qualification V2

## Result

`PASS WITH BACKEND GAP REPORT`

The Web R3 runtime was started against the specified composed backend and qualified with real HTTP, PostgreSQL, Redis, MinIO storage, and the in-app browser. Platform readiness, Guest persistence, regular auth, problems, contest reads, and the backend social/messaging/notification contracts passed. Web-owned mutation controls that remain disabled are recorded as `WEB_BUG` for the next Web gap-closure slice; missing authoritative activity/favorites/team data is recorded as `CAPABILITY_MISMATCH`.

`READY FOR BACKEND GAP CLOSURE = YES`

No backend files were edited. No merge, Lead Integration, or `Docs/PROJECT_STATUS.md` update was performed.

## Git And Runtime

- Web branch: `codex/product-web-runtime-backend-contract-qualification-v2`
- Web starting HEAD: `c4a94e65331085ddd7cb2d8ae19b486fec4c7803`
- Backend tested: `codex/integration-product-backend-runtime-v1` at `a4ae19fef2b06cad43fd8f0c02f1e93496e11ccc`
- Runtime topology: Web Vite `http://127.0.0.1:5177` -> same-origin `/api` proxy -> API `http://127.0.0.1:3011`; PostgreSQL `55432`, Redis `56379`, MinIO `59000`
- `GET /health`: `200 {"status":"ok"}`
- `GET /ready`: `200`, dependencies `postgres=ok`, `redis=ok`, `storage=ok`
- OpenAPI: `200`, composed auth/problem/contest/social/messaging/notification paths present

## Qualification Summary

- Guest: real first continue, authenticated `/me`, logout, same-browser resume, refresh, API restart; same display identity remained `游客 F303E02B`; no fake email/phone.
- Auth: email/phone password capability enabled; identifier UI auto-detects email vs phone; external providers truthfully `not_configured`.
- Problems/pagination: live response contained `14` items and `page.total=14`; Web rendered matching visible count and authoritative total; URL/numeric controls and detail metadata loaded without overflow.
- Contest: live list/detail/problem reads pass; standings correctly remains unavailable with `SCORING_ENGINE_NOT_INTEGRATED`; create/edit/register/publish Web actions remain gaps.
- Social/Friends: sanitized A/B HTTP flow passed search, request, incoming, accept, both friend lists, duplicate conflict, and restart persistence. Web controls remain gaps.
- Messaging: direct conversation idempotence, send/list, recipient visibility, unread `1 -> 0`, notification creation and restart persistence passed at API level. Web composer/read actions remain gaps.
- Notifications: list and unread count real API responses passed; Web page now consumes list; mark-one/all and bell count remain gaps.
- Home/Profile: recent problems are real; static announcements and explicit homework/wrong-book notices remain truthful. Activity/heatmap/favorites/teams/contest/problem tabs have no authoritative composed API and remain capability shells.
- Authz/errors: anonymous protected calls rejected; owner/member boundaries are present in backend routes; 401/404/409 envelopes observed. Full browser 429 and injected 5xx matrix remains `NOT_VERIFIED`, documented without weakening production behavior.
- Persistence: Guest, friendship, conversation, messages and notification data survived API restart checks; Web-only contest draft is intentionally non-persistent and classified `WEB_BUG`.

## WEB-BE-QA-01..130

All IDs are accounted for in [WEB_RUNTIME_BACKEND_QUALIFICATION_MATRIX_V2.md](/D:/OJPlatform-worktrees/phase1b-web-authoring/Docs/parallel/WEB_RUNTIME_BACKEND_QUALIFICATION_MATRIX_V2.md). Groups 01..53 cover runtime/auth/problems; 54..65 contest; 66..95 social/messaging/notifications; 96..120 home/profile/authz/errors; 121..130 evidence and gates.

## Web-Owned Changes

- Added typed `BackendContest` and composed API client methods for contests, friends, conversations, messages, unread counts and notifications.
- Wired Web contest list/detail/problem reads, notification list reads, and messaging/friends read projections to the composed runtime.
- Corrected `AuthenticatedUser.email` to allow the backend Guest contract's `null` projection.
- Added regression coverage for composed route construction and standings capability response.
- Preserved the R3 Login/Register two-option control: browser measured equal tab widths and exact alignment with the identifier input at 1440, 1024 and 390 widths.

## Backend/Upstream Gaps

Backend-owned or upstream boundaries are not silently changed: standings is `UPSTREAM_BLOCKED` by scoring integration; contest submissions remain upstream blocked; homework, wrong-book, activity, favorites and teams have no authoritative composed contract; OAuth providers are `NOT_CONFIGURED_EXTERNAL_PROVIDER`.

Web-owned gaps and minimal reproductions are in the Gap Report and Repro Cases:

- [WEB_RUNTIME_BACKEND_GAP_REPORT_V2.md](/D:/OJPlatform-worktrees/phase1b-web-authoring/Docs/parallel/WEB_RUNTIME_BACKEND_GAP_REPORT_V2.md)
- [WEB_RUNTIME_BACKEND_REPRO_CASES_V2.md](/D:/OJPlatform-worktrees/phase1b-web-authoring/Docs/parallel/WEB_RUNTIME_BACKEND_REPRO_CASES_V2.md)

## Tests And Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, `622 passed / 4 skipped` (the one added composed-client regression test explains the increase from the R3 baseline `621 passed / 4 skipped`)
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- `git diff --check`: PASS
- Browser: Login, Register, Problems, Contests, Notifications, Messages at `1440x900`, `1024x768`, `390x844`; no horizontal overflow; console had `0` errors and `0` warnings on the audited tab.

## Final

- Final HEAD: `90dc8e4`
- Commit: `feat(web): qualify composed backend runtime contracts`
- Web worktree: clean after commit
- Backend worktree: read-only and unchanged by this Worker
- `READY FOR BACKEND GAP CLOSURE = YES`
