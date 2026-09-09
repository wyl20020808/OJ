# OJPlatform Product Experience Wave 4E

Status: PASS for implemented and automated scope; manual UI remains pending user.

## Implemented

- Fixed Team Assignment crash: `/api/teams/:slug/assignments` now returns the `{ items }` shape already required by `AssignmentPage`.
- Added global `作业` navigation for `/homework` and active state for homework detail.
- Preserved canonical routes: `/teams/:slug`, `/homework`, `/homework/:publicId`, `/teams/:slug/assignments`.
- Reused `TeamJoinRequest`; duplicate pending join is idempotent and returns the existing request. Team detail exposes pending status for hydration.
- Added manager/owner pending request list, approve, and reject wiring with server-side team and role authorization.
- Polished Team tabs, join CTA pending state, request panel, assignment empty states, and responsive styling.

## Root causes

- Homework crash category: API/UI data-contract mismatch. Assignment route returned an array while UI dereferenced `value.items`.
- Admin visibility category: existing repository/service review capability had no list route or UI projection.

## Validation

- Focused tests: `tests/team-core.test.ts`, `tests/assignment.test.ts`, `tests/product-ux-repair-wave1.test.tsx`: 18/18 passed.
- Root typecheck: PASS.
- API build: PASS.
- Web build: PASS.
- Changed-file lint: PASS.
- Architecture checks: PASS.
- `git diff --check`: PASS.
- PostgreSQL/runtime/browser/manual UI: NOT RUN / PENDING USER per task scope.
- No schema migration.

## Delivery

- Worktree: `D:\OJPlatform-worktrees\wave4-team-homework-join-v2`
- Branch: `codex/wave4-team-homework-join-v2`
- Main modified or merged: NO.
