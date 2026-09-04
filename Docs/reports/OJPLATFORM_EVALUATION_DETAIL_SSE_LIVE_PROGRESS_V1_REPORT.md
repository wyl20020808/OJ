# OJPlatform Evaluation Detail + SSE Live Progress V1 Report

EVALUATION DETAIL SSE V1 = PARTIAL

START BASE = d646a2b

C2 INCLUDED = YES

REMEDIATION INCLUDED = YES

HIGHEST MIGRATION BEFORE D = 0019_editor_code_drafts

D MIGRATION = NONE (existing `submission_evaluations.detail` JSONB stores live snapshot)

EVALUATION DETAIL REDESIGN = IMPLEMENTED: public `#id`, clickable problem public ID/title, verdict, submit/evaluation metadata, and no user-facing “评测代次” fact.

TESTCASE LIVE UI = IMPLEMENTED: WAITING/RUNNING/terminal labels render from authoritative detail; no timer animation.

CODE TAB = IMPLEMENTED

EXACT CODE COPY = IMPLEMENTED: clipboard receives exact submission source.

PUBLIC IDS = IMPLEMENTED and preserved.

SUBMIT METADATA = IMPLEMENTED

JUDGE INCREMENTAL EVENTS = PARTIAL: queued/running product progress is persisted; current Judge result contract exposes sealed testcase detail only at terminal completion, so genuine per-testcase Judge emission was not qualified in this phase.

PRODUCT PROJECTION = IMPLEMENTED: Product repository remains durable source of truth and emits bounded deltas after projection.

EVENT FANOUT = IMPLEMENTED: bounded in-process Product event hub with monotonic cursor and duplicate suppression. Cross-instance Redis fanout is not yet wired.

SSE ENDPOINT = IMPLEMENTED: authenticated `/api/submissions/:id/evaluations/:generation/stream`.

AUTHORIZATION = IMPLEMENTED: stream calls the same `SubmissionService.detail` authorization as snapshot/detail endpoints.

LAST EVENT ID / RECONNECT = IMPLEMENTED: `Last-Event-ID`, bounded replay, replay-gap event for snapshot refresh, and browser EventSource reconnect.

DUPLICATE SAFETY = IMPLEMENTED: event fingerprints and terminal-state monotonic client merge.

DISCONNECT CLEANUP = IMPLEMENTED: listener unsubscribe and response close cleanup.

NO FIXED POLLING = IMPLEMENTED: no per-client DB polling loop or one-second interval.

SUBMIT -> DETAIL = NOT VERIFIED in runtime; existing Submit flow was preserved.

QUEUED/RUNNING DETAIL = TESTED with repository and projection states; runtime qualification unavailable.

REAL TESTCASE TRANSITION = BLOCKED_BY_JUDGE_DATA / runtime qualification unavailable.

FINAL VERDICT = TESTED through existing terminal publication and focused regression tests.

FOCUSED TESTS = PASS: 15 tests across SSE contract, route authorization/terminal close, submission detail projection, and existing detail regressions.

WEB TYPECHECK = PASS

WEB BUILD = PASS

API BUILD = PASS

JUDGE TESTS = NOT RUN (no Judge code changed; incremental runtime emission remains follow-up).

DIFF CHECK = PASS

REAL LIVE SSE QUALIFICATION = BLOCKED_BY_JUDGE_DATA

FULL SUITE = NOT PASS: 9 pre-existing infrastructure/version/UI contract failures remain outside focused Goal D scope; no Goal D focused test fails.

FINAL COMMIT = current HEAD on `codex/evaluation-live-sse-v1`

TRACKED CLEAN = YES after commit

USER UNTRACKED ARTIFACTS TOUCHED = NO

## Follow-up

- Add Judge-side durable/event-bus publication for testcase-started and testcase-terminal deltas, then qualify a real A+B submission through runtime.
- Replace in-process fanout with the project’s configured cross-instance event infrastructure before multi-instance production deployment.
