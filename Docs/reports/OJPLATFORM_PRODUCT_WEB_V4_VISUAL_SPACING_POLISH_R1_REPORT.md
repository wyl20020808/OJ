# OJPlatform Product Web V4 Visual Spacing Polish R1 Report

## Result

`PASS` for the Web/Product Worker ownership. This change is a visual polish pass only: it introduces a shared spacing and interaction-state vocabulary, repairs the Home panel hierarchy, and rebalances messaging and other V4 product surfaces without changing product behavior, API calls, contracts, persistence, or backend-owned capability states.

`READY FOR LEAD INTEGRATION = YES`

No merge or Lead Integration was performed.

## Git And Scope

- Branch: `codex/product-web-v4-visual-spacing-polish-r1`
- Starting HEAD: `af37c2a74c01de7f9052010999bfc82ef2741417`
- Final HEAD: the immutable enclosing Goal commit; resolved after commit with `git rev-parse HEAD` and recorded in the task completion response.
- Commit: `style(web): polish v4 visual spacing`
- Starting worktree: clean.
- Final worktree: clean after the enclosing commit.
- Goal ZIP: all 30 Markdown files were extracted, enumerated, and read before implementation.
- Backend changes: NONE.
- Auth backend changes: NONE.
- Database or migration changes: NONE.
- Judge, Sandbox, runc, Queue, and Phase 2C changes: NONE.
- `Docs/PROJECT_STATUS.md`: not modified.

## User Issues

| Issue | Result | Evidence |
| --- | --- | --- |
| Home Card / Panel interior padding | FIXED | Every `.home-section` now uses the shared `--panel-padding` (`20px` at runtime), a surface, border, radius, heading gap, and stable grid gap. The 1440, 1024, and 390 browser checks all showed no horizontal overflow. |
| Messaging density | FIXED | A local search field filters only already loaded real conversations; conversation rows, headers, empty state, message stream, bubbles, composer, contacts, notifications, and social panels now use shared row/panel spacing tokens and visual separators. |
| Messaging active color/state | FIXED | Default tabs use neutral foreground; hover uses `--state-hover`; selected tabs and contact navigation use `--state-selected`, neutral foreground, and a non-color accent inset indicator. The runtime check recorded selected text as `rgb(23, 32, 42)` on `rgb(228, 243, 247)`, never green text on a dark green surface. |

## Shared UI Changes

- Added an ordered `--space-1` through `--space-12` scale plus semantic page gutter, section, panel, row, and state tokens.
- Standardized panel interiors at `--panel-padding`, row density at `--row-padding`, and Chinese body line-height at `1.6`.
- Established default, hover, selected, disabled, and keyboard focus behavior from shared CSS. Selected controls now pair a light accent surface with an inset border indicator; focus uses the visible `--focus` outline.
- Added a local message-list filter for loaded conversations only; it sends no request and never creates or persists message data.
- Applied these primitives to Home, messages, contacts, notifications, contest tabs/tables, problem filters/sidebar, profile sections, social/request panels, and capability notices.

## UI Audit Issues Found

`UI AUDIT ISSUES FOUND = 17`

`UI AUDIT ISSUES FIXED = 17`

`REMAINING = NONE within Web/Product Worker ownership`

| ID | Route / viewport | Symptom and root cause | Fix and evidence | Severity |
| --- | --- | --- | --- | --- |
| UI-01 | `/`, all | Home panels had `0px` horizontal padding because `.home-section` only supplied vertical spacing. | Shared panel primitive supplies `20px` runtime padding and bounded surfaces. | HIGH |
| UI-02 | `/`, all | Announcement rows, titles, and notices met a border or page edge without a stable interior rhythm. | Home heading/list gaps now live inside the shared panel padding. | HIGH |
| UI-03 | `/`, all | Homework, wrong-book, daily problem, fortune, and contest summaries used incompatible unframed section treatment. | All six Home modules use the same panel primitive while retaining their semantic top accents. | HIGH |
| UI-04 | `/messages`, all | Internal messaging tabs relied on an underline and accent text without a selected surface. | Neutral default, subtle hover, light selected surface, and inset indicator were verified in Chromium. | HIGH |
| UI-05 | `/messages`, all | Conversation list lacked a local filter and rows, avatar/text alignment, and unread-badge area had no shared row sizing or selected indicator. | Added a local filter over loaded conversations plus tokenized row padding/min-height, hover, selected inset indicator, and badge sizing. | MEDIUM |
| UI-06 | `/messages`, all | Chat header, message stream, bubbles, composer, and empty state had inconsistent local spacing. | Added panel/row spacing and a grid message rhythm; no behavior or local message data was introduced. | HIGH |
| UI-07 | `/messages` contacts, all | Contact navigation inherited generic button hover behavior and selected state was color-only. | Added neutral hover and light selected surface plus directional indicator responsive to the layout. | HIGH |
| UI-08 | `/notifications`, desktop/mobile | Notification popover header/body/footer spacing lacked separation. | Added shared interior padding and header divider; Chromium measured `20px` padding and a visible divider. | MEDIUM |
| UI-09 | `/notifications`, all | Notification rows did not establish a compact, repeatable text rhythm. | Rows now use grid gap and shared row/panel tokens. | MEDIUM |
| UI-10 | `/contests`, all | Capability states were visually flat and inconsistent with other panels. | `capability-notice` now has shared padding, radius, and complete warning boundary. | MEDIUM |
| UI-11 | contest tabs, standings, all | Tab controls had no distinct hover surface and dense table rows used isolated values. | Shared tab state and row tokens apply to contest pages and standings. | MEDIUM |
| UI-12 | `/problems`, all | Filter toolbar had uneven spacing and no bounded panel rhythm. | Tokenized gaps/padding and radius produce a stable filter surface. | MEDIUM |
| UI-13 | problem detail, desktop/mobile | Sticky facts aside had only a top border, so its panel hierarchy was weak. | Added full border, radius, panel padding, and tokenized facts/actions gaps. | MEDIUM |
| UI-14 | `/profile`, all | Profile section and feature grid used unrelated 19.2/16px spacing and heavy nested surface treatment. | Tokenized outer section and feature-grid spacing while keeping internal feature sections unframed. | LOW |
| UI-15 | forms and controls, all | Chinese body text was comparatively tight and focus was not represented by the shared focus token. | Body line-height is `1.6`; all controls share a visible `--focus` outline. | MEDIUM |
| UI-16 | social request/add-friend, all | Social panel and request columns did not share the panel rhythm of other product surfaces. | Added shared padding, radius, and grid gaps without enabling backend-owned operations. | LOW |
| UI-17 | Home, messages, problems, contest, profile, auth, settings, submissions, all | Desktop/tablet/mobile spacing had not been requalified after the system changes. | 42 route/viewport checks reported `overflowCount: 0` and `mojibakeCount: 0`. | HIGH |

## UI-POLISH Matrix

| ID | Result | Evidence |
| --- | --- | --- |
| UI-POLISH-01 | PASS | Shared Home panel padding. |
| UI-POLISH-02 | PASS | Announcement panel interior. |
| UI-POLISH-03 | PASS | Homework panel interior. |
| UI-POLISH-04 | PASS | Daily problem panel interior. |
| UI-POLISH-05 | PASS | Fortune panel interior. |
| UI-POLISH-06 | PASS | Wrong-book panel interior. |
| UI-POLISH-07 | PASS | Home contest panel interior. |
| UI-POLISH-08 | PASS | Tokenized Home section gap. |
| UI-POLISH-09 | PASS | `390x844` Home panel padding. |
| UI-POLISH-10 | PASS | Runtime `20px` panel inset. |
| UI-POLISH-11 | PASS | Tokenized messaging tab gap. |
| UI-POLISH-12 | PASS | Local real-conversation search and panel gap. |
| UI-POLISH-13 | PASS | Conversation row padding/min-height. |
| UI-POLISH-14 | PASS | Avatar/text token gap. |
| UI-POLISH-15 | PASS | Stable text/preview layout. |
| UI-POLISH-16 | PASS | Sized unread badge styling. |
| UI-POLISH-17 | PASS | Tokenized chat header. |
| UI-POLISH-18 | PASS | Padded message stream. |
| UI-POLISH-19 | PASS | Grid bubble rhythm. |
| UI-POLISH-20 | PASS | Composer boundary and inset. |
| UI-POLISH-21 | PASS | Neutral default tab foreground. |
| UI-POLISH-22 | PASS | Distinct subtle hover surface. |
| UI-POLISH-23 | PASS | Selected surface plus inset indicator. |
| UI-POLISH-24 | PASS | Neutral selected text on light surface. |
| UI-POLISH-25 | PASS | Shared visible focus rule. |
| UI-POLISH-26 | PASS | Selected conversation indicator. |
| UI-POLISH-27 | PASS | Mobile message panel spacing. |
| UI-POLISH-28 | PASS | `44px` mobile tab target. |
| UI-POLISH-29 | PASS | Notification popover `20px` padding. |
| UI-POLISH-30 | PASS | Notification row grid rhythm. |
| UI-POLISH-31 | PASS | Ordered shared spacing tokens. |
| UI-POLISH-32 | PASS | Shared panel primitive consistency. |
| UI-POLISH-33 | PASS | Tokenized global form spacing retained. |
| UI-POLISH-34 | PASS | Shared table/list row density. |
| UI-POLISH-35 | PASS | Existing tag/badge gap preserved. |
| UI-POLISH-36 | PASS | Chinese line-height `1.6`. |
| UI-POLISH-37 | PASS | Shared selected-state system. |
| UI-POLISH-38 | PASS | Shared hover-state system. |
| UI-POLISH-39 | PASS | Existing disabled opacity/readability retained. |
| UI-POLISH-40 | PASS | Browser regression audit clean. |
| UI-POLISH-41 | PASS | Home `1440x900`. |
| UI-POLISH-42 | PASS | Home `1024x768`. |
| UI-POLISH-43 | PASS | Home `390x844`. |
| UI-POLISH-44 | PASS | Messages `1440x900`. |
| UI-POLISH-45 | PASS | Messages `1024x768`. |
| UI-POLISH-46 | PASS | Messages `390x844`. |
| UI-POLISH-47 | PASS | Problems `1440x900`. |
| UI-POLISH-48 | PASS | Problems `390x844`. |
| UI-POLISH-49 | PASS | Problem detail `1440x900`. |
| UI-POLISH-50 | PASS | Problem detail `390x844`. |
| UI-POLISH-51 | PASS | Contest list audit. |
| UI-POLISH-52 | PASS | Contest detail audit. |
| UI-POLISH-53 | PASS | Standings route audit. |
| UI-POLISH-54 | PASS | Contest create audit. |
| UI-POLISH-55 | PASS | Profile audit. |
| UI-POLISH-56 | PASS | Notifications audit. |
| UI-POLISH-57 | PASS | Login audit. |
| UI-POLISH-58 | PASS | Register audit. |
| UI-POLISH-59 | PASS | Account/security audit. |
| UI-POLISH-60 | PASS | Submissions audit. |
| UI-POLISH-61 | PASS | Breadcrumb behavior preserved. |
| UI-POLISH-62 | PASS | Global navigation preserved. |
| UI-POLISH-63 | PASS | No fixture or fake data added. |
| UI-POLISH-64 | PASS | Same-origin `/api` remains unchanged. |
| UI-POLISH-65 | PASS | Chinese UI copy preserved. |
| UI-POLISH-66 | PASS | No backend contract change. |
| UI-POLISH-67 | PASS | Browser errors: `0`. |
| UI-POLISH-68 | PASS | Browser warnings: `0`. |
| UI-POLISH-69 | PASS | No overflow at `1440x900`. |
| UI-POLISH-70 | PASS | No overflow at `1024x768`. |
| UI-POLISH-71 | PASS | No overflow at `390x844`. |
| UI-POLISH-72 | PASS | Keyboard tab focus verified. |
| UI-POLISH-73 | PASS | Existing reduced-motion rule preserved. |
| UI-POLISH-74 | PASS | Focused tab showed `3px` focus outline. |
| UI-POLISH-75 | PASS | Full unit/component suite. |
| UI-POLISH-76 | PASS | `pnpm format:check`. |
| UI-POLISH-77 | PASS | `pnpm lint`. |
| UI-POLISH-78 | PASS | `pnpm typecheck`. |
| UI-POLISH-79 | PASS | Architecture gate and build. |
| UI-POLISH-80 | PASS | `git diff --check`. |

## Quality Gates

- `pnpm format:check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS; `612 passed`, `0 failed`, `4 pre-existing skipped`.
- `pnpm test:architecture`: PASS; allowed fixture accepted and two forbidden dependency fixtures rejected.
- `pnpm build`: PASS.
- `git diff --check`: PASS.

## Browser, Console, And Runtime

- Runtime endpoints: `GET http://127.0.0.1:3010/ready = 200`, `GET http://127.0.0.1:5173/ready = 200`, and same-origin `GET /api/problems?offset=0&limit=1 = 200`.
- API dependencies: PostgreSQL, Redis, and Storage reported `ok` during the runtime check.
- Browser review: Home, Messages, Notifications, Problems, problem detail, Contest list/detail/standings/create, Profile, Login, Register, Account/Security, and Submissions were checked at `1440x900`, `1024x768`, and `390x844`.
- Browser evidence: `42` route/viewport checks, `0` horizontal overflows, and `0` replacement-character/mojibake findings.
- Messaging active evidence: selected tabs/contacts use `rgb(23, 32, 42)` foreground over `rgb(228, 243, 247)` with an inset `rgb(13, 113, 143)` indicator.
- Keyboard evidence: the focused `会话` tab showed a `3px solid rgb(242, 184, 75)` outline.
- Console unexpected errors: `0`.
- Console unexpected warnings: `0`.

## Final

`OJPLATFORM-PRODUCT-WEB-V4-VISUAL-SPACING-POLISH-R1 = PASS`

`READY FOR LEAD INTEGRATION = YES`
