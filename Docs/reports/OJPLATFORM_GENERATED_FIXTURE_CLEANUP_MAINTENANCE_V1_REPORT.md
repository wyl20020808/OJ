# OJPlatform Generated Fixture Cleanup Maintenance V1

Date: 2026-09-06  
Canonical repository: `D:\OJPlatform`  
Main head at task start: `f9da2e1ab2c48842f07d457d55f614efa8fb70b6`  
Maintenance branch: `codex/generated-fixture-cleanup-maintenance-v1`  
Maintenance script fix commit: `c07f0b1`

## Result

**PARTIAL**. The four approved generated fixture Problems were tombstoned safely. API-process projection checks were not run because scope forbade starting the full Product/Judge runtime; DB projection and focused service tests were used instead. No unknown Problem changed.

## Database and migration

- Database: `postgres://ojplatform:***@127.0.0.1:55432/ojplatform`, healthy.
- Product migration `0022_problem_delete_provenance`: current and applied.
- Baseline: 44 total, 44 active, 0 deleted.
- Post-apply: 44 total, 40 active, 4 deleted.

## Identity gate

All four rows matched audit evidence:

| Problem | Identity evidence | Result |
|---|---|---|
| P0011 | `Fixture problem`; `contest-fixture-*` identity; `author_id=NULL`; `source_type=CREATOR`; direct contest fixture INSERT | MATCH |
| P0012 | `Fixture problem`; `contest-fixture-*` identity; `author_id=NULL`; `source_type=CREATOR`; same fixture family | MATCH |
| P0013 | `Composed fixture`; `composed-*` identity; `author_id=NULL`; `source_type=CREATOR`; direct composition fixture INSERT | MATCH |
| P0014 | `Composed fixture`; `composed-*` identity; `author_id=NULL`; `source_type=CREATOR`; same fixture family | MATCH |

## Reference preflight

Counts were identical before and after apply. Per Problem, `contest_problems` counts were P0011=1, P0012=0, P0013=1, P0014=0. All other checked references were zero: `problem_revisions`, `problem_tags`, `problem_favorites`, `problem_judge_configs`, `problem_judge_drafts`, `problem_judge_draft_testcases`, `editor_code_drafts`, `judge_data_versions`, `problem_judge_data_objects`, `submissions`, and `submission_evaluations` (evaluation history).

Contest reference rows remained present. No physical delete or cascade occurred.

## Dry-run and apply

- Dry-run: PASS.
- Candidate count: 4.
- Unexpected candidates: 0.
- Dry-run mutation: 0.
- Exact allowlist: `P0011`, `P0012`, `P0013`, `P0014`.
- Apply: PASS; one transaction; `deleted_by=system:generated-fixture-cleanup-v1`; `delete_reason=generated fixture cleanup V1`.
- Hard delete count: 0. Total Problem rows remained 44.
- Post-apply active projection contained none of P0011-P0014.

Unknown/other baseline and post-apply fingerprint:

```text
count = 40
sha256 = d01f79764b0609b45075963339450c8565057885d891d2d8bd92b813d0e95296
```

`UNKNOWN/OTHER ROWS TOUCHED = 0`.

## Verification evidence

- `node --check scripts/cleanup-generated-problems.mjs`: PASS.
- Cleanup dry-run after script fix: PASS.
- Focused Vitest: 4 files, 31 tests passed (`problem-delete-foundation`, `problem`, `submission`, `problem-judge-data`).
- DB list projection excludes all four tombstones: PASS.
- Normal detail/new submission through live API: NOT VERIFIED; API was not started under the DB-only scope. Existing service code and focused unit tests cover tombstone filtering and deleted-problem guards.

## Scope and safety

- Product feature code modified: NO.
- Maintenance script modified: YES, one schema-alignment fix; committed separately as `c07f0b1`.
- `scripts/dev-runtime.ps1`: PRESERVED.
- User dirty files and untracked artifacts: NOT TOUCHED.
- Tags, Team, Discussion, Homework, Judge, shared Web UI, schema design, and migrations beyond the already-required `0022` apply: NOT DEVELOPED.
- Manual UI acceptance: NOT APPLICABLE.
