# OJPlatform Problem Page UX Remediation V3 Report

Date: 2026-09-05

## Scope

This Goal changes only the requested Problem page submission entry, information
card behavior and public metadata, and sample copy/presentation behavior.
JudgeData upload, `INFRA_FAILED`, Evaluation SSE, Launcher / Runtime Manager,
and Admin behavior are unchanged.

## Baseline

- Source: `D:\OJPlatform`, branch `main`
- BASE HEAD: `1549815194690f70f38dbdfd9647042f64e720a7`
- Worktree: `D:\OJPlatform-worktrees\problem-page-ux-v3`
- Branch: `codex/problem-page-ux-v3`
- Source checkout had existing untracked files; none were copied into or changed
  by this Goal.

## Implementation

### Traditional submission

Git history confirmed that the traditional submission UI remains implemented
at `/problems/:id/submit`. The Problem title action is reconnected to that route
instead of `#solve`. The existing form retains its language selector, source
textarea, validation, and `ApiClient.createSubmission` formal Submission API
call. Clicking the title action itself does not create a Submission.

### Problem information

The right information card remains in the desktop grid's normal document flow;
all sticky/fixed positioning declarations were removed. The public Problem
heading no longer renders the current revision UUID or JudgeData version label.
No stored fields or diagnostic/admin data were changed.

### Samples

Sample input and output are rendered separately. `复制样例` passes the exact
sample input string to the Clipboard API and excludes output, titles, numbering,
and other text. Sample code blocks use a light gray background, dark text,
border, padding, monospace type, preserved whitespace, and horizontal overflow.
The two-column desktop layout becomes one column on narrow screens.

## Evidence

- Focused Web tests: PASS, 2 files / 20 tests
  - Problem Submit navigation uses `/problems/sum/submit`, not `#solve`
  - Traditional form exposes language selector, source field, and submit button
  - Existing formal Submission API intake test passes
  - Internal revision and JudgeData labels are absent
  - Clipboard receives input only with leading/trailing whitespace and newlines
  - Output is excluded
  - CSS contracts reject sticky/fixed right-card positioning and require light,
    whitespace-preserving sample styling
- Web typecheck: PASS (`tsc -p apps/web/tsconfig.json --noEmit`)
- Web build: PASS (`vite build`); existing large-chunk advisory remains
- Root repository typecheck diagnostic: NOT A REQUIRED WEB GATE / pre-existing
  `pg` declaration errors in Judge Service and Database code
- Runtime/browser E2E: NOT RUN, per Goal instruction

## Final Status

```text
PROBLEM PAGE UX V3 = PASS

BASE HEAD = 1549815194690f70f38dbdfd9647042f64e720a7

TRADITIONAL SUBMIT ROUTE = PASS

LANGUAGE SELECTOR = PRESENT

ONLINE EDITOR USED BY TITLE BUTTON = NO

RIGHT CARD STICKY = NO

INTERNAL VERSION HIDDEN = YES

JUDGEDATA LABEL HIDDEN = YES

SAMPLE COPY INPUT ONLY = PASS

SAMPLE LIGHT STYLE = PASS

TESTS = PASS (20/20 focused Web tests)
TYPECHECK = PASS (Web)
BUILD = PASS
DIFF CHECK = PASS

FINAL COMMIT = this Goal commit
TRACKED CLEAN = YES
```

## Qualification

- IMPLEMENTED: YES
- TESTED: YES, focused Web tests plus Web typecheck/build
- RUNTIME VERIFIED: NO, explicitly excluded
- PRODUCTION READY: NOT CLAIMED
