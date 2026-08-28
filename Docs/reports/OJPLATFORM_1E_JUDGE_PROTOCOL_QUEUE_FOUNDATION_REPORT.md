# PHASE 1E Judge Protocol & Queue Foundation

## Executive Status

PHASE 1E FINAL STATUS = PARTIAL / REAL_RUNTIME_CONTAINER_LIFECYCLE_AND_MISSING_FULL_MATRIX

The Worker deltas were integrated and the minimum composed Submission -> Judge Job boundary was added. Static regression and selected real Redis/API checks passed. The mandatory V2 qualification is not PASS because the full concurrency, failure-injection, authorization, and two-run real browser matrix was not completed; the Playwright run was disrupted by infrastructure processes exiting during the run.

## Provenance and Integration

STARTING LEAD HEAD = `71464a8475cd9b3ff03c9af47be6bd7184036f23`
COMMON BASELINE = `dd997c9482e2eb3b2fa6bc5952f96c928a1f665a`
AUTH WORKER TIP = `08438666f690cc80f3c7ba2050b2357703898f09`
QUEUE WORKER TIP = `7075396bc0fb2a0577d73cb828a8368a9eeedef6`
WEB WORKER TIP = `4b220f230b761e0f957f29058d440db52d91fe47`

All three tips descend from `dd997c9`. Auth and Queue reported starts differed from the bootstrap field, but exact Git deltas were ownership-safe and were merged normally. Merge conflicts = none.

Integration added central Judge registration, submission-created idempotent enqueue, server-backed submission Judge projection, and owner-protected Judge job inspection. No migration was created; Redis is the authoritative Judge Job persistence for this foundation, with the compose volume/RDB restart behavior explicitly qualified below.

## State Machine

| From | Event | To | Actor | Persistence/Redis effect | UI projection | Idempotent/retry-safe |
|---|---|---|---|---|---|---|
| none | enqueue | QUEUED | API | persist job/index, publish id | Queued | duplicate enqueue returns same job |
| QUEUED/RETRYABLE_FAILURE | claim | LEASED | worker | pop id, write owner/token/expiry, increment attempt | Leased | competing claim loses |
| LEASED | complete | COMPLETED | matching worker | clear lease, terminal synthetic state | Synthetic completion | duplicate complete is no-op |
| LEASED | retry | RETRYABLE_FAILURE or TERMINAL_FAILURE | matching worker | clear lease, record reason, requeue if retryable | Retryable/terminal protocol state | bounded by maxAttempts |
| LEASED | expiry recovery | RETRYABLE_FAILURE or TERMINAL_FAILURE | recovery | clear stale lease, requeue if retryable | Retryable/terminal | stale token rejected |

`Submission` remains immutable intake source-of-truth; `JudgeJob` is a separate lifecycle object linked by submission, revision, testdata and language metadata.

## Queue and Durability Evidence

Real Redis Q01-Q03/Q05/Q09-Q12 selected checks: 20 concurrent duplicate enqueues produced one logical job; ten concurrent claims produced one lease; wrong lease was rejected; valid and duplicate completion converged. A Redis container restart reloaded a queued job from its RDB volume. The compose setup uses a named volume and Redis default RDB shutdown snapshot. This proves configured local restart persistence, not HA durability or crash-consistent publication. Full Q04-Q24 and F01-F10 matrix = NOT VERIFIED.

The Redis adapter now writes the job body before the submission index and serializes claim with a short Redis lock. A broader atomic Lua/transaction design and production durability remain deferred.

## Security / No Source Execution

The deterministic fake worker consumes control metadata only and returns `SYNTHETIC_QUALIFICATION_ONLY`. A composed API test submitted inert text containing `system eval import shell syntax <script>`; it remained stored/renderable data and no execution path was invoked. No compiler/interpreter/child process/network/filesystem instrumentation matrix was completed. Therefore the V2 no-execution hard gate is NOT VERIFIED in full, though no source execution was observed.

## Authorization

Worker policy tests pass for owner view/inspect, unrelated denial, inactive/disabled denial, operator role checks, terminal denial, and safe audit metadata. Central GET job inspection uses the public Authz policy. Full composed matrix for enqueue/retry/cancel, forged ids, and operator audit under real runtime = NOT VERIFIED.

## Web / Browser

Submission responses now include `judgeJobId`, queue status, attempt metadata, and synthetic flag from the server-backed repository. Existing Web status UI preserves explicit synthetic qualification-only wording and never renders AC/WA/TLE/MLE/RE/CE. `pnpm test:e2e` was executed against the configured real-runtime workflow: platform shell passed, while four existing real-runtime specs failed because PostgreSQL/Redis containers exited during the run and one fixed registration identity returned 500. Dedicated two-run V2 browser journey = NOT VERIFIED.

## Regression

PASS: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (51 tests), `pnpm test:architecture`, `pnpm build`, `pnpm integration` (4 tests), `pnpm db:migrate`, `git diff --check`.
PARTIAL: real runtime browser qualification and complete V2 queue/failure matrix.

## Known Limitations / Deferred

- No `0006` migration; Redis remains authoritative and requires stronger production durability qualification before real Judge use.
- No real Judge, Sandbox, user-source execution, contest, or Phase 2 work.
- Central retry/cancel endpoints and full operator workflow remain to be implemented/qualified.
- Runtime container lifecycle is unstable under the current Windows/WSL orchestration during Playwright.

PHASE 2 READINESS = NO; resolve the listed Phase 1E blockers first.
INTEGRATION COMMIT = pending
CLOSURE COMMIT = pending
FINAL HEAD = pending
GIT STATUS = see final closure commit
