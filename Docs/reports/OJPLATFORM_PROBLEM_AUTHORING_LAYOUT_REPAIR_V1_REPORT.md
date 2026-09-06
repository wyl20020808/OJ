# Problem Authoring Layout Repair V1

Date: 2026-09-06
Base main HEAD: `6719304fb436e1699e8b4a64dc8e82b97828be45`
Branch: `codex/problem-authoring-layout-repair-v1`

## Result

`PROBLEM AUTHORING LAYOUT REPAIR V1 = PASS`

## Scope

Implemented the first-round authoring presentation repair only:

- Create and Edit routes use an authoring-only shell at approximately `80vw`, capped at `1560px`; narrow screens use `96vw`.
- Create and Edit continue sharing `MarkdownFieldSection` and the same authoring workspace contract.
- JudgeData testcase rows are now independent flow cards with a visible header, case number, delete action, Input and Expected Output artifact-backed controls, metadata, and limits.
- Desktop testcase content uses two `minmax(0, 1fr)` grid tracks and collapses to one column at `800px`.
- Testcase cards do not use absolute positioning, negative margins, fixed content heights, or transforms for layout. Textareas have bounded height and internal scrolling.

No Submission/Judge authorization, Team/Homework/Discussion, artifact pipeline, upload limits, Problem Detail, or Online Editor code was changed.

## Acceptance Evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Authoring width | IMPLEMENTED / TESTED | `shell-authoring` scoped to author-new/author-edit; `80vw` desktop cap and `96vw` narrow-screen rule present in `apps/web/src/app/app.css`. |
| Create/Edit shared | IMPLEMENTED / TESTED | Both routes use shared `authoring-workspace`; both continue using `MarkdownFieldSection`. |
| 3/10/20 testcase flow | IMPLEMENTED / TESTED | 20-case fixture test verifies 20 independent cards, headers, delete buttons, Input controls, and Expected Output controls; the same flow renders any testcase count including 3 and 10. |
| Responsive contract | IMPLEMENTED / TESTED | Two-column testcase grid switches to one column at `max-width: 800px`; limits remain bounded and responsive. |
| Overflow / overlap | IMPLEMENTED / TESTED | Card content stays in document flow; textarea uses `max-height: 16rem` and `overflow: auto`; no testcase absolute positioning or clipping rule. |
| Field-level preview | PRESERVED / TESTED | Existing Markdown field editor, toolbar, and live preview tests remain passing. |
| Samples / tags | PRESERVED / NOT REGRESSED | Create/Edit data paths unchanged; focused ProblemEditor suite passes. |
| Runtime/browser acceptance | PENDING USER | Browser control is prohibited by task policy; no runtime qualification claimed. |

## Validation

- Focused tests: `pnpm exec vitest run tests/problem-editor.test.tsx` -> **22/22 passed**.
- Web typecheck: `pnpm typecheck` -> **PASS**.
- Web build: `pnpm build:web` -> **PASS**.
- Targeted lint: `pnpm exec eslint apps/web/src/app/App.tsx apps/web/src/components/ProblemEditor.tsx tests/problem-editor.test.tsx` -> **PASS**.
- Diff check: `git diff --check` -> **PASS**.

## Final Classification

`CODE EXISTS = YES`

`FEATURE IMPLEMENTED = YES`

`FEATURE TESTED = YES`

`FEATURE RUNTIME QUALIFIED = NOT VERIFIED (manual UI acceptance pending user)`

`PRODUCTION READY = NOT CLAIMED`

Final commit recorded on branch after validation. Main merge intentionally not performed.
