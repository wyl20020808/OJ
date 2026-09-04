# OJPlatform Evaluation Detail SSE D1 Real Progress V1 Report

EVALUATION SSE D1 = PARTIAL

START HEAD = b373effb34b2bc63b19aec27b392ad282eef73e

JUDGE EVENT SOURCE = Judge Service assignment lifecycle and accepted `completeReal` result; safe contract in `packages/judge-runtime/src/events.ts`; Judge publishes `oj:judge-progress-events:v1`.

EVALUATION_STARTED = IMPLEMENTED: emitted after durable lease claim.

TESTCASE_STARTED = IMPLEMENTED: emitted when Judge hands a testcase-bearing assignment to a registered node; no timer or browser simulation.

TESTCASE_TERMINAL = IMPLEMENTED: derived from sealed accepted execution records, with testcase ordinal/id, verdict, runtime and memory only.

EVALUATION_TERMINAL = IMPLEMENTED: emitted after accepted completion, cancellation, synthetic completion, or terminal failure.

HIDDEN JUDGEDATA SAFE = YES: progress payload excludes testcase input, expected output, stdout/stderr and raw JudgeData.

PRODUCT PROJECTION = PASS: Redis Judge progress bridge validates job/generation ownership, updates the existing durable `submission_evaluations.detail` snapshot, and emits the existing authorized Product SSE delta. Terminal sealed Judge projection remains authoritative.

REDIS FANOUT = PASS: Product event hub uses bounded Redis Pub/Sub fanout; Judge publishes safe progress on a separate channel and never writes Product DB.

REDIS MODE = PUBSUB

REDIS MODE RATIONALE = Durable DB snapshot plus bounded SSE replay already handles reconnect/replay-gap; Pub/Sub supplies low-latency cross-instance delivery without unnecessary Streams retention.

MULTI-INSTANCE FANOUT = PASS: second-consumer delivery covered by focused Redis hub contract test; real multi-process runtime delivery not qualified in this turn.

SSE ENDPOINT = `/api/submissions/:id/evaluations/:generation/stream`

AUTHORIZATION = PASS

LAST EVENT ID = PASS

RECONNECT = PASS

DUPLICATE SAFETY = PASS: Judge fingerprint suppression, Product duplicate-safe publication, bounded replay and terminal stale-event guard.

DISCONNECT CLEANUP = PASS

NO FIXED POLLING = PASS

MIGRATION = NONE: existing `submission_evaluations.detail` JSONB remains sufficient.

FOCUSED TESTS = PASS: 15 tests across Judge lifecycle, hidden-data filtering, Redis bridge/cross-consumer fanout, SSE auth/terminal/replay behavior.

WEB TYPECHECK = PASS

WEB BUILD = PASS

API BUILD = PASS

JUDGE TESTS = PASS: `tests/judge-service.test.ts` and D1 event tests.

DIFF CHECK = PASS

REAL FORMAL SUBMISSION = BLOCKED: active runtime is owned by `D:\OJPlatform` on port 3010, while this worktree is not the running source; no authenticated current-branch Product formal submission was performed.

REAL TESTCASE STARTED OBSERVED = NO

REAL TESTCASE TERMINAL OBSERVED = NO

REAL SSE DELIVERY OBSERVED = NO

REAL BROWSER LIVE UPDATE = NO

FINAL VERDICT OBSERVED = NO

REAL LIVE SSE QUALIFICATION = BLOCKED_BY_JUDGE_DATA

FINAL COMMIT = current HEAD on `codex/evaluation-live-sse-v1`

TRACKED CLEAN = YES

USER UNTRACKED ARTIFACTS TOUCHED = NO

## Scope note

No Evaluation Detail redesign, C2, Run Code, Profile, Submit navigation, runtime script, Docker/WSL runtime, public ID schema, or JudgeData limits were changed.
