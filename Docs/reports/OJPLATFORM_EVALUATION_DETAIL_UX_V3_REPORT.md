# OJPlatform Evaluation Detail UX + Live State Prep V3 Report

Date: 2026-09-05  
Branch: `codex/evaluation-detail-ux-v3`  
Baseline: `main` at `1549815`

## Scope

This Goal reorganized Evaluation Detail summary data into one responsive right-side information card and performed the permitted static/frontend live-state audit. It did not start, stop, or restart the Runtime, create a real Submission, or perform real SSE qualification.

## Implementation

- The Evaluation ID and problem title remain at the top. The testcase progress grid now follows them directly and remains independent of the testcase/code detail tabs.
- Desktop uses a main-detail column plus one lightweight information card. At `800px` and below, the information card follows the main content in natural DOM order without a horizontal layout track.
- The information card renders only existing values: language, submission time, evaluation time, verdict, total execution time, peak memory, and status. Missing measurements render as `未提供`.
- Per-testcase verdict, time, memory, runtime reason, and exit code remain in the testcase result list.
- The initial Evaluation snapshot is still authoritative. The SSE subscription now starts after that asynchronous snapshot supplies the selected evaluation generation. Previously, the effect read a ref while its dependencies never changed when the snapshot arrived, so the EventSource could remain unopened.
- Live snapshots merge by testcase ordinal. A terminal testcase cannot regress to WAITING/RUNNING, and a terminal Evaluation ignores later deltas. Native EventSource reconnection retains its cursor because ordinary QUEUED/RUNNING status changes no longer recreate the subscription.

## Evidence

- Focused Web and SSE tests: PASS, 2 files / 10 tests.
- Fixture flow: WAITING x3, testcase 1 RUNNING then AC, testcase 2 RUNNING then WA, testcase 3 SKIPPED/infra mark, stale testcase 1 RUNNING regression rejected, Evaluation terminal closes the stream.
- TypeScript typecheck: PASS.
- Targeted ESLint: PASS.
- Web production build: PASS. Vite reported the existing chunk-size advisory only.
- `git diff --check`: PASS.
- Runtime/browser/SSE qualification: NOT RUN by explicit task constraint.

## Result

```text
EVALUATION DETAIL UX V3 = PARTIAL

RIGHT INFO CARD = PASS
LANGUAGE = PASS
EVALUATION TIME = PASS
VERDICT = PASS
TIME = PASS
MEMORY = PASS
STATUS = PASS

MAIN CONTENT UNRELATED REORDER = NO
TOP PROGRESS GRID PRESERVED = YES

STATIC LIVE EVENT FLOW = PASS
TESTCASE_STARTED FIXTURE = PASS
TESTCASE_TERMINAL FIXTURE = PASS

REAL SSE = NOT RUN
REAL SSE ROOT CAUSE = FRONTEND BUG FOUND

TESTS = PASS (2 files / 10 tests)
TYPECHECK = PASS
BUILD = PASS
DIFF CHECK = PASS

FINAL COMMIT = SELF (resolved as branch HEAD)
TRACKED CLEAN = YES after commit
```

Overall status remains `PARTIAL` solely because the explicitly deferred real SSE/browser runtime qualification has not run. No Runtime root-cause claim is made beyond the proven frontend subscription defect.
