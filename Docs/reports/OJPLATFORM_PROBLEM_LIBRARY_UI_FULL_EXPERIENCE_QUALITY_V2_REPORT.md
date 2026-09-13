# Problem Library UI + Full Experience Quality Report

Date: 2026-09-13  
Branch: `codex/problem-library-quality-v2`  
Implementation commit: `b4be347`

## Browser Method

- Used the Codex in-app browser against the real local Web application.
- The current branch Web dev server ran on `http://127.0.0.1:5174/problems` and reused the already running local API on port 3010.
- The Runtime Manager refused a checkout switch because the existing runtime reported `RUNNING_VERSION_MISMATCH_ACTIVE_JOBS_UNKNOWN`; no forced shutdown or unsafe takeover was performed.
- Browser checks used semantic controls and DOM/computed-layout inspection. A browser-local network block was temporarily injected to exercise the error state, then removed and recovery was verified.

## Reference Screenshot

- Reference: `Goals/题库界面.png`.
- Source image dimensions: `1448 × 1086`.
- The reference establishes the desktop information architecture: compact mountain Hero, left filter rail, dense central problem table, right overview rail, and compact bottom pagination.

## Viewport / Zoom

- Desktop CSS viewport: `1448 × 1086`.
- Browser DPR: approximately `1.25`.
- `visualViewport.scale = 1`; no page zoom was applied.
- The in-app browser screenshot surface applies host scaling, so emitted JPEG pixel dimensions are not the CSS viewport dimensions. DOM viewport metrics were treated as authoritative.
- Responsive check: CSS viewport `680 × 880`; `body.scrollWidth = 668`, `documentElement.clientWidth = 668`, therefore no horizontal page overflow.

## Screenshot Comparison

- Before: 20-row table made the page overly tall and visually dense; the right rail and filter area competed for width; legacy global grid rules produced overflow during the refactor.
- After: the reference hierarchy is retained with a `216px / flexible / 272px` desktop grid, a compact Hero, ten-row page, fully visible side rails, balanced card rhythm, and pagination directly below the table.
- The final desktop DOM reported `bodyOverflowX = false`; the page displayed all three columns and ten rows at the reference CSS viewport.
- Long titles and tag groups use bounded columns and truncation instead of expanding the table.

## UI Issues Found

- Problem Library owned roughly 900 lines inside global `App.tsx` and roughly 800 lines inside global `app.css`.
- Default page size was 20, producing a long page and weakening the screenshot hierarchy.
- The page duplicated tag selection UI instead of reusing the authoring tag selector.
- Pagination exposed only previous/next navigation and had weak page-position feedback.
- Unicode glyphs were mixed with interface icons.
- Legacy global `.problem-filters` columns leaked into the extracted feature and caused horizontal overflow.
- Long titles/tags and narrow widths needed explicit containment.
- Several backend-unsupported controls looked closer to active controls than their actual capability justified.

## UI Issues Fixed

- Extracted the feature to `apps/web/src/features/problem-library/` with separate page, table, pagination, icon, and CSS ownership.
- Removed Problem Library-specific CSS from global `app.css` and kept only route wiring in `App.tsx`.
- Restored a one-column feature-local filter grid to neutralize the legacy global selector.
- Added bounded table columns, ellipsis handling, responsive rail collapse, mobile table scrolling, explicit empty/error/loading surfaces, and consistent local SVG icons.
- Preserved real problem links and existing API-driven fields; no static production problem rows or fabricated metrics were introduced.

## Tag Selector Changes

- Reused the shared `TagSelector` used by Problem Create/Edit.
- Extracted its reusable styling to `apps/web/src/components/TagSelector.css`.
- Added an optional canonical `catalog` input to avoid a duplicate catalog request when the page already owns the data.
- Added `single` and `multiple` selection modes; existing authoring behavior remains multiple, while Problem Library uses single selection.
- Single selection closes the popup, clears the tag search, writes canonical `tagIds`, resets `page` to 1, and triggers the server query.
- Real-browser validation selected canonical tag `动态规划`, producing `?tagIds=32`; the popup was fully inside the viewport (`620 × 435.83`, `z-index: 40`) and was not clipped.

## Page Size Changes

- Problem Library now requests `limit=10`.
- Offset remains server-side and is calculated from the URL page.
- Runtime evidence: page 1 and page 2 each rendered 10 rows; page 3 rendered 7 rows from a 27-problem local dataset.

## Pagination Changes

- Added current/total summary, numeric pages, ellipsis support, previous/next SVG controls, active and disabled states, loading protection, and mobile fallback.
- Page changes update URL state and request the corresponding server offset.
- Runtime evidence: `page=2` displayed 10 different rows; `page=3` displayed 7 rows, disabled Next, and kept Previous enabled.

## Backend Contract Audit

| UI capability | Contract status | Evidence / treatment |
| --- | --- | --- |
| Keyword search | Fully supported | Server `q`; combined filter tests pass. |
| Difficulty | Fully supported | Server `difficulty`; real browser returned the single difficult item. |
| Canonical tag | Fully supported | Server `tagIds`; shared catalog ID used. |
| Source | Fully supported | Server `sourceType`; real browser query used `CREATOR`. |
| Sorting | Fully supported | Whitelisted `sort`/`order`; browser verified recent-update selection. |
| Pagination/total | Fully supported | Server `limit`/`offset` and authoritative total. |
| Difficulty/source/tag facets | Fully supported | Server facets use the same visibility-aware predicate. |
| Submission/accepted counts | Fully supported | Authoritative aggregate fields; no UI fabrication. |
| Signed-in overview | Fully supported | Existing profile overview contract; signed-out UI shows unavailable values. |
| Recent updates | Partial | Derived from the current server result, not a dedicated global recent-updates query. |
| Time/memory/acceptance/personal-status filters | Missing API | Explicitly disabled and labelled; not simulated. |
| Grid view/favorites/recently-viewed | Missing API | Explicitly disabled or unavailable; not simulated. |
| Popular/recommendation/difficulty-distribution services | Missing API | Not rendered as fake business data; outside this page-quality scope. |

## API / Backend Changes

- None required. Existing Problem contracts already support every active dynamic control on this page.
- No route, schema, migration, authorization, visibility predicate, or database query was changed.

## Development Data Added

- No new records were added during this pass because the local environment already exposed 27 public problems, three ten-item pages, multiple source/difficulty/search cases, tags, and non-zero statistics.
- The existing opt-in `scripts/seed-problem-library-development-fixtures.mjs` remains the sanctioned development path. It is guarded by `OJPLATFORM_DEVELOPMENT_FIXTURES=true`, accepts local database hosts only, and seeds 30 visibly marked `TEST_FIXTURE` problems across five difficulties and broad canonical tag coverage.
- Fixture provenance is explicit (`DEVELOPMENT_FIXTURE / PROBLEM_LIBRARY_FULL_EXPERIENCE_V1`); it is not part of migrations or production startup.

## Statistics Fixture

- Not added. Existing authoritative submission aggregates were sufficient to validate non-zero acceptance and submission counts.
- No fake submissions, accepted results, user activity, or profile statistics were created.

## Assets Added

- None.
- Reused the existing Problem Library mountain banner and added small inline SVG interface icons in the feature component.
- No third-party asset, copied licensed source, or new dependency was introduced.

## Interaction States Checked

- Search: `Phase 2C.1` returned 5 rows and removed the previous `page=2` URL state.
- Difficulty: `困难` returned the expected real item.
- Source: `平台创建` wrote `sourceType=CREATOR` and retained the authoritative total.
- Sorting: `最近更新` wrote `sort=updatedAt&order=desc`.
- Tag selector: searched and selected a real canonical tag; URL, close behavior, empty result, and reset were verified.
- Pagination: page 1/2/3 counts, current state, previous/next state, and terminal disabled state were verified.
- Empty state: verified through a valid canonical tag with no matching published problems.
- Error state: browser-local blocking of `/api/problems*` produced `题库暂不可用 / 暂时无法加载题目，请稍后重试 / 重试`; removing the block and reloading restored 27 results.
- Loading state: implementation and automated tests cover `aria-busy`, loading rows, and duplicate navigation protection; transient runtime loading was observed during real requests.
- Focus/hover/selected/unselected/disabled: styles and accessible state are present; list view reported pressed, grid and unsupported filters reported disabled, active page and terminal navigation state were visible.
- Overlap/clipping: desktop page had no horizontal overflow; the pagination remained in document flow below the ten-row table; the tag popup remained inside the viewport.
- Responsive: `680 × 880` CSS viewport hid secondary rails, retained the filter/table path, and had no page-level horizontal overflow.

## Tests

- Focused Problem Library/Problem/Product tests: 7 files, 37 tests passed.
- Focused Guest create-entry regression: 1 test passed.
- Total focused result: 38/38 passed.
- Root typecheck: passed.
- Changed TypeScript/TSX ESLint: passed.
- `git diff --check`: passed before report finalization and rerun after final changes.
- The full legacy `web-ui-polish.test.tsx` still has two unrelated Evaluation-list assertions tied to older markup/click behavior. Problem Library focused coverage is green; those tests were not weakened or modified.

## Build

- Web production build: passed.
- Existing Vite large-chunk warning remains informational.
- API build: not run because backend code and contracts were unchanged.
- Full managed-runtime checkout switch: blocked safely by active-job state uncertainty; no forced service interruption was used.

## Remaining Debt

- A dedicated global recent-updates projection would make the right rail independent of the current page result.
- Time, memory, acceptance-rate, personal-status, favorite, recent-view, and grid-mode controls need real backend/product contracts before activation.
- The two unrelated Evaluation-list assertions in the broad UI polish suite need separate ownership.
- Manual visual acceptance remains with the user.

```text
SCREENSHOT COMPARISON = PASS
UI QUALITY = PASS
TAG SELECTOR = PASS
PAGINATION = PASS
BACKEND SUPPORT = PASS
DEV DATA = PASS
NO PROD POLLUTION = PASS
INTERACTION CHECKED = YES
TYPECHECK = PASS
BUILD = PASS
MANUAL FINAL REVIEW = PENDING USER
MAIN MERGE = NOT PERFORMED
```
