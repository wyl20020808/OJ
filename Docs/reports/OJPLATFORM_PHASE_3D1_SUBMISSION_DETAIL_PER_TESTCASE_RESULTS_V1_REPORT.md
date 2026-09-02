# OJPlatform Phase 3D.1 Submission Detail and Per-Testcase Results V1

## Result

`OJPLATFORM-PHASE-3D1-SUBMISSION-DETAIL-PER-TESTCASE-RESULTS-V1 = PASS`
for the qualified local scope.

## Baseline

- Phase 3D final closure resolved from the Git graph:
  `74091081cb96ffb13e39fcad541f1eb0144f5339`
  (`docs: close phase 3d runtime qualification`).
- Branch: `codex/phase3d1-submission-detail-per-testcase-results-v1`.

## Implemented

- `submission_evaluations.detail` is an additive JSONB durable projection, bound
  to its immutable evaluation generation by migration `0016`.
- Judge Service reduces only sealed terminal Judge facts to ordered testcase
  rows. It reads authoritative `wall.value` and `memory.peak.value`, preserves
  safe RE/TLE/MLE facts, and never decides a verdict.
- Product accepts a strict allow-list projection, provides selected-generation
  detail at `GET /api/submissions/:id/evaluations/:generation`, and retains
  history summaries without embedded detail.
- Terminal migration-era detail backfill requires an exact generation, job,
  status, verdict, attempt, and either matching evaluation envelope or sealed
  verdict digest. It may fill only a missing `detail`; it cannot mutate the
  current pointer or any verdict. Other late old-generation publications remain
  `STALE_EVALUATION`.
- Submission Detail displays status, language, submitted/completed timestamps,
  generation history, truthful aggregates, terminal testcase rows, bounded CE
  diagnostics, and the specified nonterminal message. No cancel or rejudge UI
  was added.

## Security

- The projection allow-lists ordinal, verdict, measurements, bounded safe
  runtime reason/exit code, and bounded compiler diagnostics only.
- Compiler output is capped at 8192 UTF-8 bytes and replaces host paths and
  common secret assignments before Product persistence.
- Tests verify Product/browser DTOs omit testcase input/output, expected output,
  object keys, storage credentials, Judge/node tokens, leases, sandbox paths,
  stdout, and source hashes. Non-owner selected-generation access returns 403.

## Runtime Evidence

- **RUNTIME VERIFIED:** sealed Phase 3D Redis Judge records for AC, WA, CE, RE,
  TLE, and MLE were projected through the production projection function. AC,
  WA, RE, TLE, and MLE each have three ordered real testcase rows; CE has zero
  testcase rows and a 410-byte scrubbed diagnostic. RE preserves exit code 7;
  TLE has 2000/2001 ms limit facts; MLE has 64 MiB peak memory facts.
- **RUNTIME VERIFIED:** those eight terminal generations (including the existing
  rejudge Generation 1 and Generation 2) were persisted through
  `PostgresSubmissionRepository.publishEvaluation`. Generation 1 remained
  noncurrent and Generation 2 remained current. Generation 2 has one missing
  authoritative memory value, so its peak memory is deliberately absent.
- **RUNTIME VERIFIED:** authenticated local Product/browser rendering loaded
  the durable detail at 1440x900 (AC and CE), 1024x768 (RE), and 390x844 (MLE
  and TLE). All checked pages had no horizontal overflow or console warnings or
  errors. CE showed scrubbed diagnostics and no fake testcase execution.
- **TESTED:** focused Product tests cover selected current/historical API
  reads, owner authorization, strict duplicate/conflict/stale behavior, and
  historical missing-detail backfill. Focused Web tests cover generation
  selection, terminal/nonterminal/error states, CE, and responsive testcase
  display. The existing Generation 1 to 2 browser account was not available in
  this session, so actual browser generation switching is not claimed beyond
  those tests and the durable Product records.

## Quality Gates

- `pnpm db:migrate`: PASS.
- Focused `tests/submission-detail.test.ts` and Phase 2C.6 publication tests:
  PASS, 14 tests.
- Focused `tests/phase3d1-submission-detail-web.test.tsx`: PASS, 3 tests.
- `pnpm test`: PASS, 747 passed / 5 skipped.
- `pnpm test:web`: PASS, 11 tests.
- `pnpm integration`: PASS, 9 tests.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, and `git diff --check`: PASS.

## Permanent Contracts

- `Docs/parallel/SUBMISSION_DETAIL_PRODUCT_CONTRACT_V1.md`
- `Docs/parallel/SUBMISSION_PER_TESTCASE_RESULT_PROJECTION_V1.md`
- `Docs/parallel/SUBMISSION_DETAIL_SECURITY_MATRIX_V1.md`
- `Docs/parallel/WEB_SUBMISSION_DETAIL_UI_STATE_MATRIX_V1.md`

## Boundaries

Product is a safe durable read projection, not a second Judge verdict engine.
No production, HA, Host Agent, Elastic Pool, SPJ, interactive, subtasks,
contest scoring, cancellation UI, or rejudge UI qualification is claimed.

`CODE EXISTS`: YES.

`FEATURE IMPLEMENTED`: YES.

`FEATURE TESTED`: YES.

`FEATURE RUNTIME QUALIFIED`: YES for the stated local authoritative
projection, persistence, and owner-browser detail scope.

`PRODUCTION READY`: NO.
