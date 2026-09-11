# OJPlatform Submission Records Reference UI V1 Report

Date: 2026-09-11

Status: PARTIAL

## Scope

Replaced the existing `/submissions` frontend with the supplied two-state
submission-records design. This goal is frontend-only. No API route, database,
judge, migration, or backend business logic changed.

## Implemented

- Added an isolated `features/submissions` owner for the page component and CSS.
- Added the full-width mountain hero, contextual title/copy, and reference motto.
- Added the two supplied secondary-tab states:
  - `全部记录 / 我的记录` in the all-records view.
  - `我的总览 / 我的记录` in the personal-records view.
- Added four summary cards, result/language filters, exact problem-ID search,
  responsive record table, page-size selection, cursor-backed pagination, and
  details links.
- Added the right-side daily metrics, verdict-distribution, and seven-day trend
  surfaces.
- Preserved the real evaluation list API and submission detail route.
- Reused the existing profile overview/activity APIs for personal totals and
  seven-day trend data.
- Added the already-supported `language` evaluation query to the typed frontend
  client without changing the backend.
- Preserved loading, error, retry, empty, anonymous-all-records, and
  login-required personal-records states.
- Removed the obsolete submission-list styles from global `app.css`; all new
  page CSS is colocated with the feature.

## Data Integrity

The frontend does not fabricate business data. Backend contracts do not expose
all-site totals, aggregate pending counts, active duration/user counts, or
verdict-distribution totals. Those visual slots render `—` plus an explicit API
availability note. Personal submission totals, accepted totals, today's counts,
and trend points render only from existing real profile endpoints.

## Verification

- `pnpm typecheck`: PASS.
- `pnpm --filter @ojplatform/web build`: PASS.
- `pnpm test:web`: PASS, 12/12 tests.
- Changed-file ESLint: PASS.
- `pnpm test:architecture`: PASS.
- `git diff --check`: PASS.
- Existing Web regression now also verifies both record scopes, the
  `submitterId` personal filter, secure source retrieval, and navigation to the
  submission detail page.

Vite retains its existing large-chunk advisory; the production build succeeds.

## Not Verified

- Pixel-level/manual browser acceptance: PENDING USER by explicit request.
- Full local runtime and real backend fixture: NOT VERIFIED; this task requested
  code acceptance, and no backend work was authorized.

## Final Assessment

Code implementation and automated frontend gates pass. Overall status remains
PARTIAL until the user completes the requested visual acceptance.
