# OJPlatform Problem Detail Reference UI V1 Report

## Status

`PARTIAL`

The requested Problem Detail implementation and automated verification are complete. Manual browser visual acceptance is intentionally `PENDING USER` per the user's instruction, so the Goal is not reported as a full runtime/visual PASS.

## Implemented

- Reworked the Problem Detail header to show real submission count, accepted count, calculated acceptance rate, and difficulty with consistent inline SVG icons.
- Added first-class `题面`, `讨论`, and `提交记录` secondary navigation.
- Added a Problem discussion panel that queries the existing Discussion API by public problem ID and title, deduplicates real posts, and provides loading, empty, error, retry, and signed-in authoring states.
- Added a `相关题目` card backed by the existing server-side Problem list API, preferring the first canonical tag and falling back to difficulty, excluding the current problem.
- Replaced Problem Detail symbol-style decoration with a consistent stroke-icon system without adding a dependency.
- Replaced the history-style Problem breadcrumb on this route with a deterministic `题库 › 编号 + 标题` breadcrumb inside the Problem workspace.
- Redesigned the desktop and responsive layout around a wide reading surface, compact action/info/category/related cards, lighter borders, restrained shadows, serif display typography, and mobile/tablet breakpoints.
- Internal revision and testdata identifiers remain hidden from the public Problem presentation.

## Truthfulness and Scope

- No statistics, discussion entries, related problems, favorites, or other business data are fabricated.
- Missing server statistics render as `—`.
- The disabled favorite action remains visibly unavailable because no real favorite write contract is present on this surface.
- Discussion matching uses the existing free-text Discussion API because the current public contract has no formal Problem-to-Discussion relation.
- No API, database, migration, Judge, Sandbox, Plugin SDK, or public contract was changed.

## Automated Evidence

- Dedicated Problem Detail reference UI tests: `2/2 PASS`.
- Existing focused Problem Detail regression from Web UI polish: `5/5 PASS`.
- Existing V4 Problem Detail and breadcrumb regression: `13/13 PASS`.
- Root TypeScript check: `PASS`.
- Changed TypeScript ESLint: `PASS`.
- Web production build: `PASS`.
- Git diff check: `PASS`.

The wider historical V4/Web UI test selection still contains unrelated pre-existing expectations for removed Home, Homework, and Problem Library fixture content. Those failures do not intersect the focused Problem Detail selections above.

## Runtime and Visual Acceptance

- Runtime Manager startup and shutdown were exercised successfully while preparing validation.
- Browser automation was not performed and no screenshot evidence was produced, following the user's explicit request to reserve visual acceptance for manual review.
- Manual desktop and responsive visual acceptance: `PENDING USER`.

## Files

- `apps/web/src/app/App.tsx`
- `apps/web/src/app/app.css`
- `tests/problem-detail-reference-ui.test.tsx`
- `Docs/PROJECT_STATUS.md`
- `Docs/reports/OJPLATFORM_PROBLEM_DETAIL_REFERENCE_UI_V1_REPORT.md`
