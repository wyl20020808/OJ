# OJPlatform Core Fix Wave 1 Conservative Integration V1

Date: 2026-09-06  
Base main head: `6719304fb436e1699e8b4a64dc8e82b97828be45`  
Integration branch: `codex/core-fix-wave1-integration-v1`

## Verdict

`CORE FIX WAVE 1 CONSERVATIVE INTEGRATION V1 = PASS`

Main had no drift from the required A/B base. Source A and Source B were
normal merged in order, with one documentation-only hunk conflict resolved by
retaining both status entries. Source C added only the four explicitly named
read-only audit documents. No migration, seed, deletion, or DB mutation was
performed. Runtime and browser UI acceptance were not used; manual UI
acceptance remains `PENDING USER`.

## Source A

- Source commit: `494a5ff`; merge commit: `a75e7d7651e146064d4b53e03dccca9ac29772ea`.
- Admin source authorization: owner and capability/admin allow; normal other
  and anonymous deny, through backend policy.
- JudgeData draft clone rebinds current Problem revision while published
  versions remain immutable and artifact identity remains referenced.
- Formal Submission path uses `ProductSubmissionAdapter`; Run path remains
  unchanged. Draft-only formal submission is rejected by existing service
  validation.
- Focused A tests: `23/23` passing across four test files.

## Source B

- Source commit: `ba87039`; merge commit: `c50cdbb`.
- Authoring workspace width, shared Create/Edit workspace, Markdown field
  preview/toolbar, and samples preserved.
- JudgeData testcase cards use normal flow, independent controls, bounded
  textareas, desktop two-column layout, and responsive one-column layout.
- Focused ProblemEditor tests: `22/22` passing.

## Source C

Exact four documents included in independent commit `430b377`:

- `Docs/reports/OJPLATFORM_PROBLEM_DATA_TAGS_READ_ONLY_AUDIT_V1_REPORT.md`
- `Docs/parallel/PROBLEM_TAG_CATALOG_V1.md`
- `Docs/parallel/GENERATED_PROBLEM_CLASSIFICATION_V1.md`
- `Docs/parallel/DELETE_PROBLEM_CONTRACT_V1.md`

Audit facts preserved: current PostgreSQL `tags` + `problem_tags` storage and
`string[]` API projection; normalized catalog target; `P0011`-`P0014` are
`DEFINITELY_GENERATED`, 40 are `UNKNOWN`, zero are definitely manual; safe
hard-delete count is zero and soft delete/tombstone is recommended.

## Combined Validation

- Critical combined regression: `206/206` passing across 9 test files.
- Web typecheck: PASS.
- API typecheck/build: PASS.
- Web build: PASS.
- Architecture check: PASS.
- Changed TypeScript targeted lint: PASS.
- Full targeted command also reports one pre-existing `no-explicit-any` at
  `apps/api/src/app.ts` code-run adapter line (same failure reproduced on latest
  main; outside A/B changed hunk). Classified `PRE-EXISTING BASELINE`, not a
  new regression.
- `git diff --check`: PASS.
- New regressions: NONE.

## Safety / Scope

`scripts/dev-runtime.ps1` and all root user artifacts were untouched. No
runtime startup, browser control, Problem deletion, tag implementation, DB
mutation, migration, Team, Homework, or Discussion work was performed.

Manual UI acceptance: `PENDING USER`. Ready for user manual test: `YES`.
