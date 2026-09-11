# Evaluation / Submission Detail UI Iteration V1 Report

Date: 2026-09-11

## STATUS

PARTIAL

The frontend implementation and automated code validation are complete. Pixel-level visual acceptance remains `PENDING USER`, as requested.

## IMPLEMENTED

- Replaced the former App-owned submission detail UI with the feature-owned `SubmissionDetailPage`.
- Recreated the supplied evaluation-detail composition: mountain hero, local breadcrumb/title, problem and submission summary, live progress, testcase matrix, run overview, resource comparison, verdict totals, source tab, and live event log.
- Preserved the existing submission, problem, source, evaluation-history, evaluation-detail, polling, and SSE API usage.
- Preserved secure source behavior: the code tab is only available after the canonical source endpoint succeeds.
- Added monotonic SSE/snapshot reconciliation so completed testcase facts cannot regress to waiting/running state.
- Derived counts, percentages, time, memory, limits, and verdicts only from real API data. Score, ETA, missing limits, and absent logs render `—` or an explicit empty state.
- Kept all new page code and CSS in `apps/web/src/features/submissions/`; no backend, schema, migration, Judge Service, API contract, dependency, router structure, shared layout, or shared design-system change was made.

## CHANGED FILES

- `apps/web/src/features/submissions/SubmissionDetailPage.tsx`
- `apps/web/src/features/submissions/SubmissionDetailPage.css`
- `apps/web/src/app/App.tsx` — composition and route-class wiring only; the previous embedded detail implementation was removed.
- `Docs/PROJECT_STATUS.md`
- `Docs/reports/OJPLATFORM_EVALUATION_SUBMISSION_DETAIL_UI_ITERATION_V1_REPORT.md`

## VALIDATION

- Focused detail tests: PASS, 15/15
  - `tests/evaluation-detail-ux-v5.test.tsx`
  - `tests/phase3d1-submission-detail-web.test.tsx`
- Web regression tests: PASS, 12/12
- Web typecheck: PASS
- Changed-file ESLint: PASS
- Web production build: PASS
- Architecture dependency gate: PASS
- `git diff --check`: PASS

The Vite build retains the repository's existing large-chunk advisory; it is not introduced as a functional failure by this feature.

## NOT VERIFIED

- Manual browser/pixel comparison against `Goals/评测详情界面.png` is `PENDING USER`.
- Backend/runtime qualification was not run because this is a frontend-only feature and no backend contract changed.

## BLOCKERS

- No code blocker.
- Final visual PASS depends on user acceptance.
