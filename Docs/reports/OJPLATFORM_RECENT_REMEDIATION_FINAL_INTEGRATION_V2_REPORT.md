# OJPlatform Recent Remediation Final Integration V2

Date: 2026-09-05

## Result

PARTIAL. Recent remediation histories merged without unresolved conflicts. Runtime/browser qualification remains deferred per task scope.

## Source Matrix

- MAIN BEFORE: `2659b346`
- Launcher: `7628297`, already included: YES
- JudgeData V2: `codex/judgedata-execution-reliability-v2`, included: YES (`03a6e6e`)
- Submission/Evaluation UX V2: `codex/submission-live-eval-ux-v2`, included: YES (`1c125fd`)
- Shared Product remediation: already inherited through branch ancestry

## Feature Coverage

Canonical start: PRESENT. Status/Stop fix: PRESENT. JudgeData replace and authoritative refresh: PRESENT. Submit-code navigation: PRESENT. React root cleanup: PRESENT in plugin. Top-level testcase grid: PRESENT. Evaluation row keyboard/mouse navigation: PRESENT.

## Plugin

- MAIN BEFORE: `560a5ae`
- Feature: `codex/submission-live-eval-plugin-v2` (`8b2412c`)
- Min-height fix: PRESENT (`373b9bc`)
- React host fix: PRESENT (`8b2412c`)
- `@lezer/highlight` root cause: manifest and canonical `package-lock.json` already declare it; local `node_modules` restore was incomplete.

## Validation

Focused OJ tests and web typecheck were attempted. Fresh-worktree pnpm linking failed with `ERR_PNPM_EEXIST/EBUSY`; plugin `npm test` failed because `vitest` was unavailable before restore. These are NOT VERIFIED. `git diff --check` passed on both integration worktrees.

Not rerun: few-MB ZIP browser qualification, DELETE 400 reproduction, Validate/Publish browser flow, INFRA_FAILED root cause, real testcase-terminal SSE.

## Merge / Root

OJ integration tip: `7d0f3c8`; OJ main merge commits: `266a2ee`, `28c64ce`, followed by latest launcher latency fix `0447d2a`. Plugin main merge commit: `1a0db92` (includes `8b2412c` and `373b9bc`). Root checkouts are on `main`. User artifacts and feature worktrees retained.

Root `OJPlatform-Status.bat` smoke produced visible output with all services DOWN. Shared registry currently reports an older product worktree, so canonical runtime identity is NOT RUNTIME VERIFIED until the user starts the latest main.

## Not Yet Runtime Verified

FEW-MB ZIP UPLOAD: YES. DELETE 400 FIX: YES. INFRA_FAILED ROOT CAUSE: YES. REAL SSE TESTCASE TERMINAL: YES.
