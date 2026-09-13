# Evaluation Records Visual Fidelity + Full Experience Report

## Browser Method

- Runtime: `scripts/dev-runtime.ps1 restart -UseCurrentCheckout`; final managed restart PASS at `http://127.0.0.1:5173`.
- Interactive review: Codex in-app browser through Computer Use, with accessibility actions and its Playwright locators for repetitive checks.
- Persistent captures: installed Google Chrome channel through Playwright screenshot tooling.
- Runtime data source: local Application PostgreSQL on the managed development runtime; no production endpoint was used.

## Reference Screenshot

- Source: `Goals/评测记录1.png`.
- Measured raster size: `1478 × 1064`.
- Used as the visual authority for hierarchy, density, two-column balance, summary-card proportions, table completeness, and analytics-rail composition.

## Before Screenshot

- `Docs/reports/artifacts/evaluation-records-screenshot-repair-v1/before-desktop-1480x1064.png`.
- Browser viewport was `1480 × 1064`; the earlier full-page capture raster is `1480 × 1090` because the page exceeded one viewport.
- The supplied current-state screenshot was also reviewed; it showed placeholder summary/analytics values, sparse table metrics, and a weaker reference match.

## After Screenshot

- Reference-matched: `Docs/reports/artifacts/evaluation-records-screenshot-repair-v1/after-reference-1478x1064.png`.
- Desktop: `Docs/reports/artifacts/evaluation-records-screenshot-repair-v1/after-desktop-1480x1064.png`.
- Tablet: `Docs/reports/artifacts/evaluation-records-screenshot-repair-v1/after-tablet-1024x1024.png`.
- Mobile: `Docs/reports/artifacts/evaluation-records-screenshot-repair-v1/after-mobile-390x844.png`.

## Viewport / Zoom

- Reference comparison: CSS viewport `1478 × 1064`, DPR `1`, page zoom `100%`.
- Additional responsive captures: `1480 × 1064`, `1024 × 1024`, and `390 × 844`, all DPR `1` and page zoom `100%`.
- Mobile body overflow check passed; the wide table scrolls only inside its dedicated container.

## Overall Layout

- Restored the reference hierarchy: global header, mountain hero, record tabs, four summary cards, filter/search toolbar, dense submission table, pagination, and three-card analytics rail.
- Desktop uses an approximately `minmax(0, 1fr) / 365px` main-to-rail split; tablet tightens the rail; mobile stacks the rail and keeps controls usable.
- Styles remain feature-owned in `SubmissionHistoryPage.css`; global application CSS was not used for page-specific accumulation.

## Hero

- Reused the existing `/blog-mountain-hero.png` asset with a light overlay and reference-like focal position.
- Restored the title, supporting copy, motto, and full-width visual balance without adding an external asset.

## Summary Cards

- Replaced placeholder values with real aggregate statistics: total, accepted, failed, judging, ratios, day-over-day signal, and trend sparklines.
- Renamed card selectors to `submission-history-summary-card*` to prevent collision with Submission Detail styles.
- Desktop/tablet preserve four columns; practical mobile widths preserve a readable two-by-two overview.

## Submission Table

- Rows now expose public submission number, exact time, user, public problem number/title, readable language, verdict, runtime, peak memory, source size, and detail navigation.
- Server returns `sourceBytes` only, never submission source text.
- Hover was exercised in the browser; the active row computed background was `rgb(248, 251, 255)`.
- Detail navigation was exercised and reached the canonical `/submissions/:id` route; anonymous access correctly showed the existing login gate.

## Filters

- Result filters cover all, accepted, failed, and judging; failed uses a real server-side aggregate predicate.
- Language filters cover C++, Python, Java, plus a working More disclosure for concrete language profiles.
- Search now supports internal problem ID, slug, title, and displayed public ID such as `P0054`; the live PostgreSQL query returned `1,234` matching rows.
- Browser checks confirmed the failed total (`30,959`), language-only row consistency, public-ID search row consistency, and More-menu visibility.

## Pagination

- Uses authoritative server totals and offset pages; no current-page-only filtering remains.
- Previous/next, first/nearby/last page, ellipsis, 10/20/50/100 page sizes, and jump-to-page are implemented.
- Browser checks confirmed page 2, 20 rendered rows after page-size change, and jump to page 3 with `aria-current="page"`.

## Site Statistics

- Added `GET /api/evaluations/statistics` with optional submitter scope.
- Provides all-time totals, pass rate, today totals/AC/active users, yesterday deltas, verdict buckets, and a seven-day trend.
- PostgreSQL day boundaries use `Asia/Shanghai`, matching the product runtime timezone.

## Verdict Analysis

- Replaced the placeholder with a real conic-gradient donut and authoritative verdict totals/percentages.
- Legend spacing was corrected so counts and percentages remain distinct at desktop and tablet rail widths.

## Submission Trend

- Replaced the placeholder grid with an SVG seven-day line chart for total, AC, and failed submissions, including axes, labels, markers, and native `<title>` point descriptions.
- Browser inspection found 21 titled data points; the first title was `2026-09-07 · 总提交数 2,871`.

## Development Fixture Data

- Added `scripts/seed-evaluation-development-fixtures.mjs` and `pnpm seed:evaluation-development`.
- The script is opt-in behind `OJPLATFORM_DEVELOPMENT_FIXTURES=true`, requires an explicit `DATABASE_URL`, supports `--clean`, and is not called by production/runtime startup paths.
- Seeded `11,900` deterministic local records across seven days, six users, twelve problems, C++/Python/Java, AC/WA/RE/TLE/MLE/CE/RUNNING, and varied time/memory/source size.
- Records are identifiable by the `evaluation-history-demo-` ID prefix and development-fixture marker in source/detail data; clean-and-reseed was exercised.

## API / Backend Changes

- `GET /api/evaluations` now supports `page`, authoritative `total`, `failed=true`, `problemSearch`, and returns per-row `sourceBytes`.
- PostgreSQL and in-memory repositories implement the new filters and aggregates.
- Search joins public problem metadata without changing submission ownership, Judge Protocol, Worker, or sandbox boundaries.
- No migration was required and no production data path was modified.

## Assets / Icons

- Reused the existing mountain hero asset.
- Page icons are consistent local inline SVGs; no remote image, emoji placeholder, icon package, or new dependency was added.

## Interaction States Checked

- PASS: initial loading skeleton observed on reload.
- PASS: empty state observed with an impossible problem search.
- PASS: error state produced by temporarily blocking only `/api/evaluations*` in browser DevTools; unblocking and pressing Retry restored the 69,355-row result set.
- PASS: failed filter, language filter, More menu, public problem search, next page, page size, jump page, row hover, detail route, and chart point descriptions.
- PASS: desktop body overflow; mobile body overflow and contained table scrolling.

## Tests

- PASS: `pnpm typecheck`.
- PASS: focused changed-file ESLint.
- PASS: `pnpm vitest run tests/evaluation-history-experience.test.tsx` (`1/1`).
- PASS: `pnpm vitest run tests/product-access-evaluation-v1.test.ts -t "serves a source-free global evaluation list"` (`1/1`, two unrelated tests skipped by focus).
- PASS: PostgreSQL `tests/integration/evaluation-statistics.test.ts` (`1/1`).
- PASS: `git diff --check`.
- Known unrelated baseline: running the entire `product-access-evaluation-v1` file also exercises an older permission-shape assertion that expects only `canEdit` while the current API additionally returns `canDelete`; the Evaluation-focused test passes and that unrelated assertion was not weakened.

## Build

- PASS: `pnpm --filter @ojplatform/api build`.
- PASS: `pnpm --filter @ojplatform/web build`.
- PASS: managed runtime restart from feature commit `a25af2f`.
- PASS: real PostgreSQL API checks for aggregate statistics and displayed-public-ID search.

## Final Status

```text
SCREENSHOT COMPARISON = PASS
EVALUATION UI QUALITY = PASS
EVALUATION FUNCTIONALITY = PASS
STATISTICS QUALITY = PASS
CHART QUALITY = PASS
INTERACTION QUALITY = PASS
NO FAKE DATA IN PRODUCTION PATHS = PASS
DEV DATA QUALITY = PASS
REAL DB VERIFIED = YES
TESTS = PASS
BUILD = PASS
COMMIT = a25af2f (implementation; report commit follows)
BLOCKERS = NONE
MANUAL FINAL REVIEW = PENDING USER
MAIN MERGE = NOT PERFORMED
```
