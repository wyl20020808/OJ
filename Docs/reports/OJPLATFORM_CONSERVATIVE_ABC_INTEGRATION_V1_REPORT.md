# OJPlatform Conservative ABC Integration V1 Report

Status: PARTIAL

Reason: ABC integration and targeted validation passed. Full-suite baseline remains red in six tests reproduced from base main; browser smoke was not run.

## Baseline

- Base main HEAD: `7b812a861e827a16bc0e4ff923747e18145d729a`
- Integration branch: `codex/conservative-abc-integration-v1`
- Final integration HEAD: `03a3785`
- Main merged: NO
- User artifacts touched: NO

## C - Problem List Compact V3

- Merge: PASS
- Before: `7b812a8`
- After: `3f49aff`
- Public `P000x`: PASS
- UUID leak: NO
- Compact layout: PASS
- Horizontal tags: PASS
- Source absent: PASS
- Focused validation: `tests/product-web-chinese-rich-experience-v3.test.tsx`, `tests/product-web-r3.test.tsx` - 67/67 PASS

## B - Problem Authoring V3

- Merge: PASS
- Before: `3f49aff`
- After: `faae960`
- Field preview: PASS
- Markdown toolbar: PASS
- Samples in preview: NO
- Focused validation: `tests/problem-editor.test.tsx`, `tests/problem-statement-renderer.test.tsx` - PASS

## A - Evaluation Detail UX V5

- Merge: PASS
- Before: `faae960`
- After: `3b5cea2`
- Result/code tabs: PASS
- Copy code: PASS
- Right info card: PASS
- Problem link: PASS
- Generation History: REMOVED
- Testcase overflow: NO
- SSE: PRESENT
- 3-second refresh: PRESENT
- Terminal polling stop: PRESENT
- Stale protection: PRESENT
- Focused validation: `tests/evaluation-detail-ux-v5.test.tsx` - PASS

## Baseline Regression

Targeted regression set passed: admin navigation, breadcrumb behavior, evaluation filters/navigation, problem authorization, submission authorization/source, and plugin host slot.

The full suite still has six pre-existing failures reproduced on base main:

- `tests/foundation.test.ts`
- `tests/product-identity-auth-jit-v2.test.ts`
- `tests/phase2a-worker-ops-ui.test.tsx` (W2A-11, W2A-13, W2A-37, W2A-38)

No ABC-specific regression remained after updating affected UI test contracts.

## Validation Evidence

- ABC plus baseline targeted tests: 13 files, 285/285 PASS
- Web typecheck: PASS
- Web build: PASS
- Targeted lint: PASS
- Full lint: BLOCKED by 9 existing errors in API/Judge/plugin declaration files outside ABC scope
- `git diff --check`: PASS
- Browser smoke: NOT VERIFIED

## Readiness

ABC candidate ready for D integration. Do not merge this branch to `main`; do not start D in this goal.
