# OJPlatform Team Assignment & Homework V1

Status: PARTIAL for runtime qualification; implementation and focused automated validation pass.

## Delivery

- Observed main head: `38c6ab944d45324bacfb4ed72ea8d093498962a5`
- Worktree: `D:\OJPlatform-worktrees\team-homework-wave3`
- Branch: `codex/team-homework-wave3`
- Final head: `3b455384e9b6036b568d8163bc814aafa14d8228`
- Feature migration: `0099_team_assignment_v1` (final number pending integration)
- Main modified: NO. Main merged: NO.

## Domain Model

`assignments` is team-bound and stores title, description, lifecycle (`DRAFT`, `PUBLISHED`, `CLOSED`), optional UTC timestamps, creator, and stable `A0001`-style public IDs. `assignment_problems` is a normalized many-to-many relation with display order, foreign keys, and duplicate/order constraints. No member snapshot or copied problem/judge data is stored.

## Permissions and Visibility

TeamService membership projection is the authorization boundary. OWNER and MANAGER may create, edit, publish, and close. MEMBER and non-members cannot create or access drafts. Published and closed assignments are visible only to current team members, including private teams. Team membership is evaluated at read time, so leaving a team removes assignments from `/api/assignments/mine`.

## Completion

Completion is read-only and derived from current Submission evaluations. A problem is complete only when the viewer has a submission with `COMPLETED_WITH_VERDICT` and verdict `AC`. Assignment list/detail projection batches the viewer's accepted submission query and maps the result to ordered problems; no manual completion flag exists.

## API and Web

Added team list/create routes plus mine/detail/update/publish/close routes under `/api`. DTOs expose public IDs, team summary, counts, ordered problems, progress, and server capabilities only. Web adds `/homework`, `/homework/:publicId`, `/teams/:slug/assignments`, and creation flow, with loading, empty, error, responsive cards, and problem links. Team Detail now exposes an 作业 tab. Existing global toast infrastructure remains reused.

## Validation Evidence

- IMPLEMENTED: API service/repository, PostgreSQL migration, app wiring, Web client/page, Team tab.
- TESTED: `tests/assignment.test.ts` (2/2), Team/Problem/Submission focused regression (26/26).
- TESTED: root typecheck, root build, API/Web typechecks, changed-file ESLint, architecture-compatible diff check.
- TESTED: full Vitest reached 908 passed and 8 skipped; 12 pre-existing baseline failures remain outside this feature (authentication, unavailable PostgreSQL, and older Judge/Web fixtures).
- NOT VERIFIED: isolated PostgreSQL migration apply, HTTP assignment matrix against real database, runtime smoke, and manual browser acceptance (pending user).
- Judge Worker, scheduler, sandbox, evaluation execution, Discussion, Remember Me, and Problem pagination were not changed.

## Delivery State

Feature files are fully committed. Canonical main remains at `38c6ab944d45324bacfb4ed72ea8d093498962a5`. The worktree still reports pre-existing untracked user artifacts inherited from the repository (`.phase*`, `Goals/`, `_tmp_*`, and existing reports/fixtures); they were not modified or deleted under the repository safety rules. Therefore repository-level untracked count is NOT VERIFIED as zero despite a clean feature diff.

## Integration Risks

Team Detail has MEDIUM/HIGH overlap with Worker D's Team/Profile correctness changes; integrate this branch using latest main semantics. Migration uses temporary number `0099` and must be renumbered if needed. No rebase or merge with Worker D was attempted.
