# Blog Screenshot Repair Report

Date: 2026-09-13
Branch: `codex/blog-screenshot-repair-pass`

## Browser Method

- Used Codex in-app browser for live `/discussion` screenshots, DOM geometry,
  computed styles, hover, navigation, filtering, loading, empty, and error-state
  checks.
- Used installed Google Chrome headless only to persist exact-size PNG evidence.
- The Runtime Manager refused a version restart with
  `RUNNING_VERSION_MISMATCH_ACTIVE_JOBS_UNKNOWN`; no possible active Judge work
  was interrupted. The existing Vite process watches the same checkout, and live
  computed geometry confirmed the repaired CSS was loaded.

## Reference Screenshot

- Input: `D:\OJPlatform\Goals\博客界面.png`
- Size: `1484 × 1060` pixels.

## Before Screenshot

- [Before PNG](OJPLATFORM_BLOG_SCREENSHOT_REPAIR_V1_BEFORE.png)
- Desktop article cards measured about `220.38px` high.
- Thumbnail frame measured `165 × 192.85px` and was incorrectly portrait-like.
- Meta footer measured `87.53px` high because global `footer` padding applied
  `20px 152.13px` inside each article card.

## After Screenshot

- [After PNG](OJPLATFORM_BLOG_SCREENSHOT_REPAIR_V1_AFTER.png)
- [Mobile PNG](OJPLATFORM_BLOG_SCREENSHOT_REPAIR_V1_MOBILE.png)
- Covered desktop cards measure `120.81px`; coverless cards measure `117.53px`.
- Thumbnail frame measures `165 × 92.81px` (`16:9`).
- Meta footer measures `25px`; dates measure one `16px` line.
- Five article cards intersect the `1484 × 1060` viewport, close to reference
  feed density.

## Viewport / Zoom

- Supplied current screenshot: `2323 × 1371` pixels.
- In-app comparison: CSS viewport `1484 × 1060`, DPR `1.25`, browser zoom
  `100%`, `visualViewport.scale = 1`.
- Persisted Chrome screenshots: viewport and screenshot `1484 × 1060`, DPR `1`,
  browser zoom `100%`, `visualViewport.scale = 1`.
- Responsive checks: `900 × 1000` tablet and `390 × 844` mobile.

## Issues Fixed

- **Card Height:** removed leaked global footer padding and default heading
  margins; desktop card height dropped about 45% from `220.38px` to
  `117–121px`.
- **Thumbnail Ratio:** cover frame now uses stable `16:9`, centered within the
  card, with existing `object-fit: cover` retained.
- **Meta Alignment:** footer is a stable desktop row with counts pinned right;
  it no longer drifts into the card center.
- **Date Wrapping:** date and direct Meta fields cannot shrink or wrap; live date
  geometry is `68.85 × 16px`.
- **Title/Summary Spacing:** reset inherited `h2` margins and removed the forced
  summary minimum height.
- **Badge Position:** heading badges remain inline with titles; `DEMO` stays in
  the Meta row without forcing a second line on desktop.
- **Empty-data Card:** live coverless `123` card stays compact at `117.53px` and
  naturally expands its copy column.
- **Right Rail:** widened to `360px`, raised panel heading/avatar legibility, and
  retained compact list spacing.
- **Three-column Ratio:** desktop columns are `242px / minmax / 360px`; measured
  `242 / 796 / 360px` with the live scrollbar present.
- **Responsive:** medium layout moves the right rail below the main two columns;
  mobile returns to one column, hides feed thumbnails, wraps Meta intentionally,
  and has `0px` horizontal overflow.

## Interaction States Checked

- Card/image hover changed background without geometry shift.
- Category switch selected `technical-sharing`.
- Sort switch selected `最多浏览` and reordered the feed.
- Tag switch selected `Backend` and preserved URL state.
- Search submitted `Judge` through the real navbar search.
- Load more increased live cards from `7` to `13`.
- Author and thumbnail links reached their exact profile/article routes.
- Loading skeleton was observed during live reload.
- No-match search rendered the real empty state.
- Request blocking rendered the real error/retry state; blocking was removed and
  the page was restored afterward.
- Desktop, tablet, and mobile geometry were checked for overlap and overflow.

## CSS Changes

- Changed only
  `apps/web/src/features/discussion/DiscussionExperience.css`.
- No Blog rules were added to `app.css`; no global CSS refactor was performed.
- Root cause was neutralized at the feature boundary with scoped footer padding
  and border resets.

## Assets Added

- Before, after, and mobile PNG validation artifacts under `Docs/reports/`.
- No product asset or dependency was added.

## Tests

- `vitest tests/discussion-hub-experience-wave2.test.tsx`: `8/8 PASS`.
- Focused Blog Playwright E2E: `4/4 PASS` across desktop, tablet, mobile, and
  article detail.
- E2E now asserts card density, Meta height, horizontal dates, `16:9` covers,
  overlap, and document overflow.
- Focused ESLint: PASS.
- `git diff --check`: PASS.

## Build

- Root TypeScript typecheck: PASS.
- Web production build: PASS.
- Existing Vite large-chunk advisory remains a non-blocking follow-up and was
  not changed by this UI repair.

SCREENSHOT COMPARISON = PASS
BLOG UI QUALITY = PASS
CARD LAYOUT = PASS
META ALIGNMENT = PASS
RESPONSIVE = PASS
TYPECHECK = PASS
BUILD = PASS
MANUAL FINAL REVIEW = PENDING USER
MAIN MERGE = NOT PERFORMED
