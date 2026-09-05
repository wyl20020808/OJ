# OJPlatform Submission Direct Evaluation V2

## Result

SUBMISSION DIRECT EVALUATION V2 = PASS

Traditional submit now navigates directly to existing Submission/Evaluation Detail (`/submissions/:submissionId`) after successful `ApiClient.createSubmission`. API projection already includes the current evaluation when dispatch creates it; no separate `evaluation_id` exists. The detail destination remains valid while asynchronous evaluation state loads.

ACCEPTED PAGE USED = NO
DIRECT EVALUATION NAV = PASS
DUPLICATE SUBMISSION = NO
ERROR HANDLING = PASS

## Evidence

- Focused Web tests: PASS (`tests/web.test.tsx`, 12/12), including direct navigation and absence of accepted page.
- TYPECHECK = PASS (`pnpm typecheck`)
- BUILD = PASS (`pnpm build`)
- BROWSER = NOT VERIFIED (no low-cost smoke run)
- DIFF CHECK = PASS (scoped changes only)

Submission errors stay on form with real API error text. Submit button disables during request and a ref guard rejects same-tick duplicate submits. No Evaluation visual UI, JudgeData pipeline, or Runtime Manager changes.

FINAL COMMIT = `codex/submission-direct-evaluation-v2`
TRACKED CLEAN = YES after commit
