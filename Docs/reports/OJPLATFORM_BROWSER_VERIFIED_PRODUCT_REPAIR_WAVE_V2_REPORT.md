# OJPlatform Browser-Verified Product Repair Wave V2

Status: PARTIAL. Candidate integration branch: `codex/browser-verified-repair-v2-integration`.

## Implemented

- Admin source authorization recognizes configured operator usernames across infrastructure and memory auth paths (`submission:view:any`).
- Create and Edit Problem share the Markdown authoring field/preview components and toolbar. Explicit published save updates the canonical published problem content; draft autosave remains separate. JudgeData testcase editor flow is scoped and uses normal layout flow.
- Profile heatmap has accessible hover/focus tooltips for every cell, including zero activity, rendered outside the overflow scroller with edge clamping.
- Evaluation testcase card grid rules preserve number, verdict, time, and memory with bounded wrapping. Existing focused card regression coverage remains present.

## Automated evidence

- Focused Vitest: 5 files, 35 tests passed.
- Web TypeScript: passed.
- API TypeScript: passed.
- Web build: passed.
- API build: passed.
- `git diff --check`: passed.

## Browser/runtime gate

Not verified. Managed Runtime and real browser acceptance were not run in this integration turn. Therefore Issues 1, 4, 5, and 6 cannot claim full browser PASS. Runtime qualification remains `BLOCKED_BY_ENVIRONMENT` for this report.

## Integration

- A: `427c08e8b9f746f18397ca0aac9c1448b3f0705f`
- B: `fbea139baac5f858e801f9b31deed45944193050`
- C: `127182f`
- D: existing card layout commit `014897c` was audited; its test hunk was empty against the integrated baseline and was skipped, while the CSS rules are present in the candidate.
- Integration HEAD: `22546220e3eb97849bed98b4df15e256e83de26a`.
- Mixed source: not runtime verified.
- Main merge: not allowed pending browser acceptance.

## Gate matrix

1. Admin source: implementation PASS; browser NOT VERIFIED.
2. Create Problem UI: implementation PASS; browser NOT VERIFIED.
3. Heatmap tooltip: implementation PASS; browser NOT VERIFIED.
4. Published Problem save: implementation PASS; real DB/browser NOT VERIFIED.
5. JudgeData editor: implementation PASS; browser NOT VERIFIED.
6. Evaluation testcase cards: implementation PASS; browser NOT VERIFIED.

User dirty files and untracked artifacts in canonical `D:\OJPlatform` were preserved. `scripts/dev-runtime.ps1` was not modified by this wave.
