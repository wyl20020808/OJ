# OJPlatform Product Web V4 Problem Library / Pagination / Guest / Messaging Polish R2

## Result

`PASS WITH GUEST AUTH AND SOCIAL GRAPH INTEGRATION REQUESTS`

Web/Product Worker ownership is complete. The problem library, authoritative numeric pagination, filters, guest UI/capability handling, and messaging control spacing are implemented. Guest account creation/resume remains deliberately unavailable because the authoritative backend routes do not exist; the Web does not fake a session or browser resume identity.

`READY FOR LEAD INTEGRATION = YES`

No merge and no Lead Integration were performed.

## Git And Scope

- Goal: `OJPLATFORM-PRODUCT-WEB-V4-PROBLEM-LIBRARY-PAGINATION-GUEST-MESSAGING-POLISH-R2`
- Branch: `codex/product-web-v4-problem-library-pagination-guest-messaging-polish-r2`
- Starting HEAD: `b4543e086c3a0ebaece61d937ca05f5fc0a6ad48`
- Final HEAD: recorded after the scoped commit in the completion response
- Commit: `feat(web): polish problem library pagination and guest entry`
- Starting baseline: R1 visual polish commit `b4543e0`; worktree was clean before R2 edits
- Final worktree: clean after the scoped commit
- Goal ZIP: 30 Markdown files enumerated and read before implementation
- `Docs/PROJECT_STATUS.md`: not modified
- Backend changes: NONE
- Auth backend changes: NONE
- Contest/Messaging backend changes: NONE
- Judge, Sandbox, runc, Queue, and Phase 2C changes: NONE

## Pagination Before And After

Before, the list exposed only offset-based previous/next controls. After, the list uses a reusable numeric pagination primitive with:

- Previous and next controls with correct disabled boundaries.
- Numeric page buttons, current-page `aria-current`, hover/active/focus states, and stable spacing.
- Ellipsis windows for large totals, including near-first and near-last windows.
- URL `?page=N` state with browser back/forward restoration.
- Total pages calculated only from backend `page.total / page.limit`; no guessed totals.
- Empty and unknown-total states do not invent page buttons.
- Mobile condensed status (`current / total`) with compact controls at `390x844`.

The real API currently reports 12 total problems, so runtime shows one authoritative page. The focused test supplies a 180-item backend total and verifies pages, ellipsis, URL navigation, and back navigation without fake production data.

## Problem Library Redesign

The list is now a dense semantic list rather than a table or a stack of large cards. Each row establishes a clear identifier/title hierarchy, optional real difficulty and tags, compact metadata, generous row padding, dividers, hover/focus affordances, and a stable arrow affordance. Difficulty and tags remain textual and are never color-only.

The filter toolbar uses a bounded, responsive disclosure on mobile, a keyword input, capability-aware selects, applied filter chips, clear actions, and explicit loading, empty, filtered-empty, and error states. Search is sent through the existing backend `search` query contract. Existing page content remains visible while a filter request is pending, avoiding a blank flash.

## Guest Login UI And Capability

Login and Register both expose `以游客身份继续`, a guest warning, capability loading/error states, disabled unavailable state, retry handling, and the required integration identifier. A successful response is accepted only when the typed response has `guest: true`, then normal user state/navigation is used.

Runtime evidence:

- `GET /api/auth/capabilities` on API `3010`: `404 NOT_FOUND`.
- `POST /api/auth/guest/continue` on API `3010`: route unavailable (`404 NOT_FOUND`).
- Login/Register therefore show truthful pending/unavailable UI and `GUEST-AUTH-BACKEND-INTEGRATION-REQUEST`.
- No `localStorage` bearer/session, random local account, browser fingerprint, IP binding, MAC/device fingerprint, fake email/phone, or fake success path was added.
- Long-term same-browser resume remains a backend responsibility using a server-issued opaque resume credential and HttpOnly cookie.

## Messaging Spacing Audit

Conversation, contacts, add-friend, friend-request, chat-header, composer, and mobile control groups use the shared `.control-group` spacing vocabulary. Contacts and friend-request surfaces retain truthful empty/disabled states and `SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST`; no backend data or actions were fabricated.

## Autonomous Visual Audit

The R2 audit found and addressed: offset-only pagination, missing numeric hierarchy, weak row rhythm, filter controls without applied-state feedback, mobile filter density, absent skeleton state, ambiguous filtered-empty state, guest controls without capability feedback, and inconsistent communication action gaps. No unrelated module or backend refactor was introduced.

## WEB-R2-01..80

All 80 Goal checks are accounted for. `PASS` means implemented and evidenced; `PASS WITH IR` means the Web contract/state is complete while the named backend capability is intentionally unavailable.

| IDs | Result | Evidence |
| --- | --- | --- |
| WEB-R2-01..20 | PASS | Numeric pagination, previous/next, current state, spacing, <=7 and large-page windows, first/last windows, one/zero-page behavior, mobile condensed status, `aria-current`, keyboard semantics, URL sync, browser back, no fake total, safe unknown-total handling, loading, and boundary disabled state. Focused R2 test: 3/3. |
| WEB-R2-21..40 | PASS | Modern list layout, ID/title hierarchy, textual difficulty/tags, tag gap, hover/focus, row padding/divider, unified filter toolbar, chips/clear, mobile disclosure, skeleton, filtered-empty/error states, and no overflow at requested desktop/mobile viewports. |
| WEB-R2-41..55 | PASS WITH IR | Login/Register guest UI, capability false/true/loading/error/success typed paths, warning, badge/upgrade fields, and integration request. Guest backend 404 is reported truthfully; no local resume identity is created. |
| WEB-R2-56..65 | PASS WITH IR | Shared messaging control groups, add/contact/request/chat/composer spacing, non-touching controls, and mobile navigation/action layout. Social graph backend remains unavailable and explicitly labeled. |
| WEB-R2-66..76 | PASS | Chinese default, breadcrumbs, same-origin `/api`, truthful no-fake-data behavior, provider state preservation, contest/profile/notifications/submissions regression, and browser console clean. |
| WEB-R2-77..80 | PASS | Format, lint/typecheck, test/architecture/build, and `git diff --check`. |

## Tests And Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, `26 passed / 1 skipped` files; `615 passed / 4 pre-existing skipped` tests. The baseline was 612 passed; the increase is the three focused R2 tests.
- `pnpm exec vitest run tests/product-web-r2.test.tsx`: PASS, 3/3
- `pnpm test:architecture`: PASS; allowed fixture accepted and forbidden plugin/core plus web/API-internal fixtures rejected
- `pnpm build`: PASS
- `git diff --check`: PASS
- No tests were deleted, skipped, weakened, or added as fake production branches.

## Browser Acceptance

Real in-app Chromium checks used the requested CSS viewports:

- `1440x900`: `/problems`, `/login`, `/register`, and `/messages` loaded; no horizontal overflow; readiness was `平台服务正常`; console errors/warnings were zero.
- `1024x768`: the same routes loaded with no horizontal overflow and zero console errors/warnings.
- `390x844`: the same routes loaded with no horizontal overflow; mobile navigation and filter disclosure were usable; login/register guest state was visible; `通讯录` and `新的朋友` tabs were clicked and verified; console errors/warnings were zero.

Additional runtime browser checks verified keyword filtering updates `/problems?q=Phase+1C`, returns one real problem, and disables previous/next at the one-page boundary.

## Runtime

- API: `http://127.0.0.1:3010`
- Web: `http://127.0.0.1:5176`
- `GET /health`: `200 {"status":"ok"}`
- `GET /ready`: `200` with PostgreSQL, Redis, and Storage all `ok`
- Web same-origin `/ready`: `200`
- Web same-origin `/api/problems?offset=0&limit=20`: `200` JSON
- The browser uses same-origin `/api` through the Vite proxy; it does not require cross-origin credentials or CORS.

## Integration Requests

| Request | Required backend contract | Owner | Current Web behavior |
| --- | --- | --- | --- |
| `GUEST-AUTH-BACKEND-INTEGRATION-REQUEST` | Capability endpoint plus server-issued opaque guest identity/resume credential, HttpOnly cookie, guest upgrade metadata, and `POST /api/auth/guest/continue` | Auth backend | Capability false/unavailable UI; button disabled; no fake session |
| `SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST` | Durable contacts, friend requests, conversations/messages, unread state, privacy/block/rate-limit/moderation rules | Contest/Messaging or Social backend | Complete navigation and spacing; truthful empty/disabled actions |

Problem pagination is not an integration blocker because the current API supplies authoritative `page.total`, `offset`, and `limit` metadata. Difficulty/tag/source remain disabled when those fields are absent from real responses.

## Final

`OJPLATFORM-PRODUCT-WEB-V4-PROBLEM-LIBRARY-PAGINATION-GUEST-MESSAGING-POLISH-R2 = PASS WITH INTEGRATION REQUESTS`

`READY FOR LEAD INTEGRATION = YES`

No merge or Lead Integration was started.
