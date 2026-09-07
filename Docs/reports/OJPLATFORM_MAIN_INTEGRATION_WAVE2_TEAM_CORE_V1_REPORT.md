# OJPlatform Main Integration Wave 2 - Team Core V1

Date: 2026-09-07
Status: PASS for conservative integration and local PostgreSQL qualification.
Manual UI acceptance remains PENDING USER.

## Source

- Main before: `8d0353f6b51618a46a6a7d4e44458fed90af0898`
- Main after: `39b3d289990f3b7c8d41e242fe9973ba1303e5a7`
- Team branch: `codex/team-core-v1`
- Team head: `98141786d3887c21572d30d56b8792f0843f8d2f`
- Candidate branch: `codex/team-core-integration-v1`
- Candidate final: `be00baa` (Team merge `3d1948b` plus integration evidence)
- Team delivery: VALID. Scope contains Team domain/API/Web/migration/tests, minimal registration, contract and status docs only.
- Excluded: Problem Tags, Discussion, Homework, Assignment, Team Problem Collection, Launcher, Judge, Sandbox.

## Migration

- Main latest before: `0022_problem_delete_provenance`
- Team original/final: `0023_team_core_v1`
- Migration number unique: YES
- Migration apply: PASS. Applied only `0023_team_core_v1` through the product runtime ledger; existing `0000`-`0022` entries and tombstone data were not replayed.
- Database verification: PASS. Tables, foreign keys, primary/unique constraints, owner partial index, pending indexes, lookup indexes, and pagination indexes exist.

## Validation

- Team focused tests: PASS (`9/9` Vitest tests; source qualification recorded 25 assertions).
- API integration/regression: PASS (`20/20` across `tests/api.test.ts`, `tests/web.test.tsx`, `tests/authz.test.ts`).
- PostgreSQL repository smoke: PASS. Create/owner, open join, request/approve, invitation accept, invite-code guarded use, concurrency, and member count verified; explicit temporary teams removed.
- Web tests: PASS via `tests/web.test.tsx`; route/component contract is registered for `/teams`, `/teams/new`, `/teams/:slug`.
- API typecheck: PASS.
- Web typecheck: PASS.
- API build: PASS.
- Web build: PASS.
- Targeted lint: PASS.
- Architecture: PASS.
- Diff check: PASS.
- Existing product regression: targeted API/Web/authz subset PASS. Broad unrelated Judge/Sandbox matrix not run.

## Runtime and safety

- Runtime start/status on main: PASS. `OJPlatform-Start.bat` rebuilt/restarted owned services; `OJPlatform-Status.bat` reported canonical root/product root `D:\OJPlatform`, branch `main`, product commit `39b3d289990f3b7c8d41e242fe9973ba1303e5a7`, all services running/reachable, and `MIXED SOURCE = False`.
- Manual UI acceptance: PENDING USER.
- User dirty files preserved: YES.
- User untracked artifacts preserved: YES.
- `git clean`: NOT USED.
- `git reset --hard`: NOT USED.
- `git stash`: TEMPORARILY USED only to preserve pre-existing dirty `Docs/PROJECT_STATUS.md` across merge; stash remains available and user content was reapplied unchanged.

## Deferred

Ownership transfer, archive/delete, Team Problem Collection, Assignment, Homework, Tags, and Discussion remain deferred and are not part of this integration.
