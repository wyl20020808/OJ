# Home UI Quality Pass Report

## Status

Engineering visual acceptance is **PASS** for the Home-only scope. Manual UI acceptance remains pending the user.

## Browser Method Used

`INTERNAL BROWSER`

Codex's in-app Chromium browser was used against the official current-checkout runtime at `http://127.0.0.1:5173/`. The page was inspected through real browser screenshots, DOM snapshots, computed layout measurements, Console logs, and Network events. Neither Vite HTML nor a static mock was used as a screenshot substitute.

## Reference Screenshot

- Source: `Goals/首页界面.png`
- Size: `1448 × 1086`

## Current Screenshots

- Before: `Docs/ui/HOME_UI_QUALITY_PASS/home-before.png`
- After: `Docs/ui/HOME_UI_QUALITY_PASS/home-after.png`
- Notification open: `Docs/ui/HOME_UI_QUALITY_PASS/home-notification-open.png`
- Fortune open: `Docs/ui/HOME_UI_QUALITY_PASS/home-fortune-open.png`
- Mobile menu: `Docs/ui/HOME_UI_QUALITY_PASS/home-mobile-menu.png`
- Loading: `Docs/ui/HOME_UI_QUALITY_PASS/home-loading.png`
- Error: `Docs/ui/HOME_UI_QUALITY_PASS/home-error.png`

## Viewport / Zoom

### Before capture

- Browser viewport: `1456 × 1088` CSS px
- Device pixel ratio: `1.25`
- `visualViewport.scale`: `1`
- CSS root zoom: `1`
- Saved screenshot: `1444 × 1079`

### Final capture

- Browser viewport: `1448 × 1086` CSS px
- Device pixel ratio: `1.25`
- `visualViewport.scale`: `1`
- CSS root zoom: `1`
- Saved screenshot: `1447 × 1086`; Chromium excluded the 1 px scrollbar edge

The final viewport matches the reference screenshot dimensions and aspect ratio. No browser zoom correction was applied.

## Screenshot Comparison

### Hero and Navbar Transition

**Reference:** Clean, pale mountain illustration under the 64 px navbar; title starts near the left content axis; no unrelated UI appears inside the image.

**Current before:** Reused the full Problem Library screenshot as a background. Filter controls and table content leaked into the Home hero, and the background contained duplicate lettering.

**Difference:** Wrong source crop dominated the hero and weakened the navbar-to-content transition.

**Fix:** Reused the existing clean `blog-mountain-hero.png`, applied Home-only scaling, positioning, and whitening gradients, and preserved the existing Home copy and routes.

### Overall Width and Whitespace

**Reference:** Approximately 22 px outer gutters with a three-column `401 / 574 / 401` composition at the captured width.

**Current before:** 42 px outer gutters and a narrower 1360 px grid.

**Difference:** All cards were visibly narrower than the reference.

**Fix:** Home content now uses a maximum width of 1404 px and 22 px responsive gutters. Final measured grid width is 1404 px.

### Card Heights and Vertical Rhythm

**Reference:** Announcement, contest, recommendation, homework, wrong-book, and fortune cards terminate on consistent column baselines.

**Current before:** Sparse real runtime data collapsed the contest and homework panels; long recommendation titles expanded the recommendation row and pushed the footer below the reference baseline.

**Difference:** Large uneven empty areas, mismatched card outlines, and a late footer.

**Fix:** Reserved the reference card heights without fabricating rows, clamped recommendation text, fixed recommendation card height, reserved the daily-tag row, and removed Home shell bottom padding. Footer and card baselines now align with the reference.

### Icons

**Reference:** Consistent blue line icons, with red error and gold fortune accents.

**Current before:** Mixed Unicode glyphs varied by platform font and had inconsistent visual weight.

**Difference:** Icon sizes and styles were inconsistent.

**Fix:** Added a dependency-free Home-owned SVG icon component for announcements, contests, daily problem, recommendations, calendar, progress, homework, wrong-book, and fortune.

### Long Content

**Reference:** Short card titles remain within one or two lines.

**Current before:** Real English fixture titles expanded recommendation cards and crowded metadata.

**Difference:** Recommendation row became taller than the reference.

**Fix:** Applied two-line clamping, single-line metadata ellipsis, and fixed row sizing while preserving real API data.

### Footer

**Reference:** Footer begins immediately after the aligned content grid and uses the Home content gutter.

**Current before:** Extra Home shell padding delayed the footer; global footer padding placed content too far inward.

**Difference:** Footer/meta baseline and horizontal alignment did not match.

**Fix:** Added Home-scoped footer spacing and background overrides only.

## Issues Fixed

- Removed Problem Library controls/table bleed from the Home hero.
- Corrected desktop content width, column ratios, gutters, and footer baseline.
- Stabilized card heights with sparse real data.
- Prevented long recommendation titles from expanding the grid.
- Replaced platform-dependent glyphs with consistent local SVG icons.
- Added a visible Home search focus ring without changing other pages.
- Fixed fortune expansion from `393 px` uncontrolled growth to a contained `142 px` card with no overflow.
- Reworked the Home mobile menu from a 472 px side-stretched header into a two-column overlay with no horizontal overflow.

## Interaction States Checked

- Recommendation card hover: dimensions and parent grid remained unchanged; no layout shift.
- Search focus: visible focus outline; navbar geometry unchanged.
- Notification bell/dropdown: overlay opened above content, was not clipped, and closed normally. Guest notification error state remained contained.
- Fortune button: deterministic detail opened, remained within the 142 px card, and did not increase document height.
- Mobile menu: tested at `390 × 844` CSS px; overlay remained within the 378 px visual width.
- Loading state: Home API requests were safely paused in the browser; loading copy remained contained.
- Error state: Home API requests were safely failed in the browser; explicit error/empty copy rendered without horizontal overflow.
- Calendar buttons were visually inspected; they currently have no month-state behavior, which predates this visual pass.

## Assets Added

None. Existing `apps/web/public/blog-mountain-hero.png` is reused. `HomeIcon.tsx` contains inline SVG markup and adds no package dependency.

## CSS Changes

All new styles are in `apps/web/src/features/home/HomePage.css`. No Home rules were added to `apps/web/src/app/app.css`. Global layout behavior is unchanged outside Home; navbar/footer adjustments use `:has(.home-reference)` scope.

## Browser Validation

- Final Home DOM snapshot: captured successfully.
- Final clean Console: no warnings or errors.
- Home API and hero asset requests: HTTP 200.
- Guest `/api/auth/me` and `/api/notifications/unread-count`: expected handled HTTP 401 responses; no console error.

## Tests

- `pnpm typecheck`: PASS.
- `pnpm exec vitest run tests/home-full-experience.test.tsx`: PASS, 1/1.
- An accidental full-suite invocation ran the broader repository tests and reproduced 35 unrelated baseline failures outside Home scope. No failing assertion targeted this Home visual change.
- `git diff --check`: PASS.

## Build

- `pnpm build:web`: PASS.
- Existing Vite large-chunk warning only.

## Final Matrix

```text
SCREENSHOT COMPARISON = PASS
HOME UI QUALITY = PASS
VISUAL ISSUES FIXED = YES
INTERACTION STATES CHECKED = YES
TYPECHECK = PASS
BUILD = PASS
MANUAL FINAL REVIEW = PENDING USER
MAIN MERGE = NOT PERFORMED
```
