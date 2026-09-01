# OJPlatform Product Web V4 Layout / Information Architecture Polish R3

## Result

`PASS`

The Web/Product Frontend Worker scope is complete. R3 removes redundant page headings, compacts the global shell, makes breadcrumbs transparent and aligned, modernizes the problem list, relocates contest actions, and consolidates messaging navigation into a responsive left-rail workspace. Existing truthful capability, authorization, pagination, and no-fake-data behavior remain intact.

`READY FOR LEAD INTEGRATION = YES`

No merge and no Lead Integration were performed.

## Git And Scope

- Goal: `OJPLATFORM_PRODUCT_WEB_V4_LAYOUT_INFORMATION_ARCHITECTURE_POLISH_R3_DETAILED_V1`
- Branch: `codex/product-web-v4-layout-information-architecture-polish-r3`
- Starting HEAD: `622f2a1ecade5ed46122c11f8180e9aca139811b`
- Final HEAD: recorded after the scoped commit
- Commit: `style(web): polish layout information architecture r3`
- Goal ZIP: 30 Markdown files were fully extracted and read before implementation.
- `Docs/PROJECT_STATUS.md`: not modified.
- Backend changes = NONE
- Auth Backend changes = NONE
- Guest Backend changes = NONE
- Contest Backend changes = NONE
- Messaging Backend changes = NONE
- Problem Backend changes = NONE
- Database, Judge, Sandbox, runc, Queue, and Phase 2C changes = NONE

## Implemented

### Guest Auth Method Layout

Before: guest entry was a separate secondary action below the primary login/register method, alongside separate email and phone choices.

After: Login and Register expose one shared two-option segmented control: `邮箱/手机号 | 游客登录`. The identifier field accepts either value, detects a valid email or phone format, selects the corresponding `EMAIL` or `PHONE`/`SMS` backend contract, and normalizes phone destinations before requests. Selecting the guest tab opens the existing Guest panel. Capability loading, unavailable, error, retry, and success semantics remain typed and truthful; no local or fabricated guest session was added.

### Problem Heading And List

The standalone `题库` heading and its obsolete wrapper spacing were removed; the page now flows from transparent breadcrumb to filter toolbar, modern list rows, and numeric pagination. Each row uses a light surface, compact radius, vertical rhythm, title-first hierarchy, monospace secondary ID, soft metadata/tag treatments, tonal difficulty chip, and restrained hover/focus elevation. R2 numeric pagination, ellipsis, previous/next, URL state, browser history, mobile condensation, `aria-current`, and authoritative totals remain unchanged.

### Contest Heading And Action

The standalone `比赛` heading was removed. The `新建比赛` action now sits at the right side of the contest internal navigation while preserving existing capability and authorization gating. Desktop, 1024px, and mobile layouts prevent the action from overflowing.

### Platform Status And Global Shell

The visible `平台状态检测` / readiness strip was removed while the real `api.readiness()` runtime call remains. Main navigation, breadcrumb, and page content spacing was tightened; no readiness or health logic was deleted.

### Breadcrumb Primitive

Breadcrumbs now have transparent background, compact secondary typography, lightweight separators, clickable ancestors, stronger current item, visible focus treatment, content-width alignment, and mobile ellipsis/overflow protection. Problems, problem detail, contests, contest detail, contest create, profile, messages, and notifications continue to use the shared primitive.

### Messaging Information Architecture

The standalone `通讯中心` heading and full-width internal navigation were removed. `会话`, `通讯录`, `新的朋友`, `添加好友`, search, and recent lists are integrated into one left rail; the right side remains the chat header, messages, and composer. The desktop surface is cohesive with one outer workspace and separator. At `390x844`, the default is list mode and the chat mode can occupy the content area without forcing a double-column layout or horizontal overflow.

### Redundant Headings

`REDUNDANT HEADINGS REMOVED = 4`

Removed visual-only headings: `题库`, `比赛`, `通讯中心`, and `平台状态检测`. Meaningful problem titles, contest titles, user names, form titles, and notification content remain.

## WEB-R3-01..80

All 80 Goal checks are accounted for:

| IDs | Result | Evidence |
| --- | --- | --- |
| WEB-R3-01..10 | PASS | Login/Register use the same two-option `邮箱/手机号 | 游客登录` segmented control; valid email/phone input detection selects the matching backend channel; guest selection opens the existing panel; capability/loading/error/success semantics and no-fake-session rule are preserved; mobile layout remains usable. |
| WEB-R3-11..20 | PASS | Standalone problem heading and wrapper whitespace removed; transparent breadcrumb, toolbar, modern rows, numeric pagination, ellipsis, URL state, history, mobile condensed controls, and `aria-current` verified by focused tests and browser runtime. |
| WEB-R3-21..30 | PASS | Problem rows use light surfaces, vertical gaps, title/ID hierarchy, soft tags, tonal difficulty, metadata, hover/focus accent, dense responsive structure, and no card-wall regression. |
| WEB-R3-31..40 | PASS | Contest heading removed; create action moved into internal nav; authorization/capability gating retained; 1440px, 1024px, and 390px layouts do not overflow. |
| WEB-R3-41..50 | PASS | Visible platform status label removed; real readiness call retained; global shell top spacing compacted; no spacer regression. |
| WEB-R3-51..60 | PASS | Breadcrumb primitive is transparent, compact, aligned, clickable, focus-visible, current-item emphasized, separator-light, and mobile-safe across audited routes. |
| WEB-R3-61..70 | PASS | Messaging title removed; tabs, search, add-friend, recent conversations, contacts, and requests integrated into left rail; cohesive desktop workspace and mobile list/chat behavior verified. |
| WEB-R3-71..80 | PASS | Redundant-heading audit, Chinese UI, no fake data, problem/contest/detail/notifications regressions, console cleanliness, full quality gates, scope restrictions, report, and commit requirements satisfied. |

## Tests And Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, `27 passed / 1 skipped` files; `621 passed / 4 skipped` tests. R2 baseline was 615 passed; the increase is the six focused R3 tests.
- `pnpm test:architecture`: PASS; allowed fixture accepted and forbidden plugin/core plus web/API-internal fixtures rejected.
- `pnpm build`: PASS
- `git diff --check`: PASS
- `tests/product-web-r3.test.tsx`: PASS, 6/6
- No tests were deleted, skipped, weakened, or replaced with fake production branches.

## Browser Acceptance

Real in-app browser checks used the requested viewports:

- `1440x900`: Login, Register, Problems, valid Problem Detail (`phase2c1-cancel-1788098077422`), Contests, Contest Detail/Standings, Messages, and Notifications loaded without horizontal overflow.
- `1024x768`: the same route set loaded without horizontal overflow; contest action and messaging workspace remained within the viewport.
- `390x844`: Login/Register segmented controls, mobile problem pagination, contest navigation, Messages list mode, and Notifications loaded without horizontal overflow.
- Console evidence: `0` unexpected errors and `0` unexpected warnings from the audited browser tab.
- Visual screenshots were captured for desktop Problems and mobile Messages; the list row rhythm and left-rail workspace matched the R3 target.

## Runtime Evidence

- Web: `http://127.0.0.1:5176/`
- API: `http://127.0.0.1:3010/`
- `GET /health`: `200 {"status":"ok"}`
- `GET /ready`: `200` with PostgreSQL, Redis, and Storage all `ok`
- `GET /api/problems?offset=0&limit=1`: `200` with authoritative problem data
- Browser same-origin API access remains through the existing Vite proxy; no backend or CORS change was made.

## Final

`OJPLATFORM_PRODUCT_WEB_V4_LAYOUT_INFORMATION_ARCHITECTURE_POLISH_R3 = PASS`

`READY FOR LEAD INTEGRATION = YES`

No merge or Lead Integration was started.
