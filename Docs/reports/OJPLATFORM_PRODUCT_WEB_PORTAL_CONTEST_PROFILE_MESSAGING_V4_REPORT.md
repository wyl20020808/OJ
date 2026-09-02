# OJPlatform Product Web Portal Contest Profile Messaging V4 Report

## Result

`PASS WITH INTEGRATION REQUESTS` for the Web/Product Worker scope. The 14 requested Web V4 product changes are implemented. Domains without an authoritative backend expose complete UI structure, typed contracts, disabled operations, and truthful empty/unavailable states; no production fixture data is used.

`READY FOR LEAD INTEGRATION = YES`. This is a readiness statement only. No merge or Lead Integration was performed.

## Git

- Starting HEAD: `9f7f7500201ed9cc1452aa79e677ed2cb8c5f3d5`
- Branch: `codex/product-web-portal-contest-profile-messaging-v4`
- Node: `v22.20.0`
- pnpm: `11.19.0`
- Commit: `feat(web): build portal contest profile and messaging v4`
- Final HEAD: the enclosing Goal commit; a commit cannot include its own hash. The final response and Git history provide the resolved hash.
- Final worktree requirement: clean after the enclosing commit.
- Goal ZIP: all 34 Markdown files were extracted, enumerated, and read before implementation.

## User Requirements

| # | Requirement | Result |
|---|---|---|
| 1 | Remove Home problem activity | PASS; the recent-problem activity section is absent |
| 2 | Announcement in the upper-left | PASS; truthful version-controlled announcements occupy the first main section |
| 3 | Rename daily challenge to daily problem | PASS; `每日一题` uses only `/api/home` problem data |
| 4 | Click-to-reveal fortune and remove old labels | PASS; initially hidden, deterministic per local day and anonymous/user-id seed |
| 5 | Wrong-book | PASS WITH IR; full route/table/capability state, no inferred verdict |
| 6 | Homework below announcement | PASS WITH IR; full route/table/capability state, no fake assignments/progress |
| 7 | Remove Home quick-start search | PASS; problem search remains on `/problems` |
| 8 | Remove slogan and old CTA pair | PASS |
| 9 | Breadcrumb under global navigation | PASS; parents are links and current item has `aria-current` |
| 10 | Complete contest frontend | PASS WITH IR; list/mine/detail/problems/submissions/standings/create/settings and Home entry |
| 11 | Problem list redesign | PASS; compact keyword/difficulty/tag/source filters, URL state and truthful unavailable fields |
| 12 | Problem detail redesign | PASS; readable main column plus real-data-only sidebar and sample copy feedback |
| 13 | Profile and heatmap | PASS WITH IR; cover, round fallback avatar, tabs, capability sections and real-data-only heatmap |
| 14 | Notifications, messaging and friends | PASS WITH IR; bell/popover/page, two-pane messaging, contacts/add/request UI with disabled backend operations |

## Home Before And After

V3's slogan, old CTA block, quick/random jump, recent problem activity, `每日小工具`, and `仅供娱乐` badge were removed. V4 uses an information-first two-column portal: announcement, homework and wrong-book in the main column; daily problem, click-to-reveal fortune and contest/ranking capability summary in the side column. Mobile preserves this priority as one column.

Announcements are explicitly identified as version-controlled static Web content. Daily problem selection uses only real API problems. Homework, wrong-book, contests and rankings never display invented counts, dates, entries or standings.

## Contest

Routes: `/contests`, `/me/contests`, `/contests/new`, `/contests/:id`, `/problems`, `/submissions`, `/standings`, and `/settings` under a contest. Typed lifecycle, visibility, registration, format, registration, create request, problem and standings contracts are defined.

The create form covers title, description, time range, timezone, format, visibility, registration, private password capability, ordered problem IDs, scores and freeze minutes. It validates required title, positive time range, duplicate problems, positive one-to-one scores and non-negative freeze time. `发布比赛` remains disabled; a local draft is page-memory only and explicitly not persisted or published.

Standings render only supplied backend rows and highlight the contract-provided current user. The Web does not compute authoritative ICPC/IOI/OI rankings.

## Problem List And Detail

The list removes redundant top copy, shows id/title and optional real difficulty/tags, supports keyword plus capability-aware difficulty/tag/source filters, mirrors state to the URL, and provides clear/no-result states. Missing backend fields are labeled unavailable rather than invented.

The detail view uses a main statement column and sticky facts/actions sidebar. It displays real version, testdata, source, difficulty, tags, limits and optional statistics only. Memory values below 1 MB use KB so a real `65536` byte limit is not misrepresented as `0 MB`. Clipboard success/failure is explicit.

## Profile, Notifications And Communication

Profile provides a cover, centered round fallback avatar, verified account identity, truthful missing-bio copy, overview/activity/favorites/team/contest/authoring/submission tabs, and capability sections. Heatmap cells and totals render only passed `UserActivityDay` data and expose textual/ARIA alternatives; production defaults to an integration notice.

The notification bell has accessible name `通知`, shows no badge without a real unread count, opens a truthful preview, and links to `/notifications`. Messaging provides desktop list/chat panes, mobile split behavior, no-selected state, disabled composer, contacts, add-friend and received/sent request surfaces. React text rendering preserves the XSS-safe display contract; no HTML injection path was added.

## Integration Requests

| Request | UI need / proposed contract | Owner | Status / fallback |
|---|---|---|---|
| `IR-WRONG-BOOK` | authoritative failed/not-passed aggregation with problem, verdict and recovery state | Verdict/Problem backend | Non-blocking; unavailable table, never infer from raw execution |
| `IR-HOMEWORK` | assignment, assignee, due time, problem set and completion progress | Homework backend | Non-blocking; complete empty table and disabled operations |
| `IR-CONTEST` | CRUD, registration, permissions, problems, submissions, scoring, lifecycle and standings | Contest backend | Non-blocking; complete routes/forms, no publish or fake standings |
| `IR-PROFILE-ACTIVITY` | daily solved-problem or submission aggregation with declared metric | Profile/Submission backend | Non-blocking; no production heatmap cells |
| `IR-FAVORITES` | authorized favorite list and mutation contract | Profile backend | Non-blocking; capability state |
| `IR-TEAM` | memberships, visibility and role contract | Team backend | Non-blocking; capability state |
| `IR-NOTIFICATIONS` | persistence, categories, unread count, read state and delivery | Notification backend | Non-blocking; no badge and truthful unavailable state |
| `IR-MESSAGING` | friendship/requests, conversations/messages, unread state, SSE/WebSocket, block/report, rate limits and moderation | Social/Messaging backend | Non-blocking; full disabled UI, no fake contacts or messages |

Typed Web contracts and stable request identifiers live in `apps/web/src/services/portal-contracts.ts`.

## Test Matrix

- `WEB-V4-001..060`: 60/60 PASS (Home, breadcrumb, problem list/detail).
- `WEB-V4-061..120`: 60/60 PASS (contest, profile, heatmap, notifications, messaging, friends).
- `WEB-V4-121..150`: 30/30 PASS (regression, truth, accessibility, responsive and gates).
- Total: `WEB-V4-001..150 = 150/150 PASS`.
- Legacy Web V1/V3 assertions superseded by explicit V4 requirements were reconciled semantically; no removed V3 module was restored.
- `WEB-V3-01..60 = 60/60 PASS` under the authoritative V4 product contract.
- Modified-test audit: no added `.skip`, `.todo`, tautological assertion, swallowed failure, hidden English alias or test-only production branch.

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS; 612 passed, 0 failed, 4 pre-existing skipped
- `pnpm test:architecture`: PASS; allowed fixture accepted and two forbidden dependency fixtures rejected
- `pnpm build`: PASS
- `git diff --check`: PASS

## Runtime

- API: `http://127.0.0.1:3010`
- Web: `http://127.0.0.1:5176`
- `GET /health`: 200, `{"status":"ok"}`
- `GET /ready`: 200
- PostgreSQL: `ok`
- Redis: `ok`
- Storage: `ok`
- Web same-origin `GET /ready`: 200
- Web same-origin `GET /api/problems?offset=0&limit=20`: 200 JSON
- CORS dependency: none in the Web runtime path; the browser calls same-origin `/api` through Vite proxy.

## Browser And Console

Real in-app Chromium review used exact CSS viewports after accounting for Windows display scaling:

- `1440x900`: 16/16 routes opened; no horizontal overflow or mojibake.
- `1024x768`: 16/16 routes opened; no horizontal overflow or mojibake.
- `390x844`: 16/16 routes opened; no horizontal overflow or mojibake; mobile navigation opened successfully.

Routes included Home, problem list/detail/submit, contest list/detail/standings/create, profile, messages, notifications, login, register, submissions, settings and Sandbox operations. Fortune reveal, notification popover, problem filtering, contest validation, disabled publish, disabled friend operation and mobile navigation were exercised.

- Console unexpected errors: `0`
- Console unexpected warnings: `0`

## Truth And Ownership Audit

- Fake verdicts: NONE. Raw execution is not mapped to AC/WA/TLE/MLE/RE/CE.
- Fake homework/wrong-book/contest/standings/heatmap/notifications/messages/friends/unread counts: NONE in production defaults.
- Static announcements: explicit Web-owned static content, labeled as such.
- Capability lies: NONE; absent backends use unavailable/empty states and disabled actions.
- Judge production changes: NONE
- Sandbox/runc production changes: NONE
- Queue/Phase 2C changes: NONE
- Auth backend changes: NONE
- Problem/Testdata backend changes: NONE
- Database/migration/shared domain changes: NONE
- `Docs/PROJECT_STATUS.md`: not modified

## Final

`PRODUCT WEB PORTAL CONTEST PROFILE MESSAGING V4 = PASS WITH INTEGRATION REQUESTS`

`READY FOR LEAD INTEGRATION = YES`

No merge or Lead Integration was started.
