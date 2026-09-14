# Contest Full Experience V1 Integration Report

## Status

PASS

## Live Main Before

- Branch and HEAD: `main` / `21d624834bf54eb6110491c985db459659a833e3`
- Canonical root had protected tracked edits, untracked entries, three stashes, and registered worktrees.

## Feature Topology and Integration

- Feature tip: `77e182dc6be87a7c48e93a2bc9ae3476ac180ba8`
- Feature history: `a359d40` -> `3e2d524` -> `77e182d`; no extra or unrelated commits.
- None of these commits was already an ancestor of Main.
- Fresh candidate: `codex/contest-full-experience-integration-v1`.
- Method: normal `--no-ff` merge; merge commit `f7f581b`.
- Conflicts: none.

## Validation

- Contest-focused tests: 20/20 PASS across Contest Web, PostgreSQL, development fixtures, Contest API, and product runtime regressions.
- Targeted ESLint, targeted Prettier, and `git diff --check`: PASS.
- Root typecheck, API build, and Web build: PASS.
- Targeted `0036_contest_development_provenance` migration: PASS against local PostgreSQL.
- Fixture guard, deterministic/idempotent provenance-scoped seed, and scoped cleanup: PASS. Cleanup left zero `CONTEST_FULL_EXPERIENCE_V1` fixture contests.
- Isolated candidate API: `home-summary` returned 3 running, 6 upcoming, and 15 recent ended contests. One running, upcoming, and ended detail each returned HTTP 200 with organizer, participant count, problem count, and registration state.

## Standings Boundary

- NOT AVAILABLE. Verified HTTP 503 with `available: false` and `SCORING_ENGINE_NOT_INTEGRATED`.
- No fake leaderboard or silent fallback.

## Runtime and Browser Scope

- Shared Runtime Manager retained existing mismatched runtime ownership; it was not force-switched.
- Browser acceptance deferred to user. It is not an integration blocker.

## Main Finalization and Workspace Preservation

- `refs/heads/main` was fast-forwarded to the validated candidate after all code-level checks passed.
- Canonical root `D:\OJPlatform` had five tracked user edits and preserved untracked work. To avoid overwriting or reinterpreting that work against the new Main tree, it remains detached at its pre-integration commit `21d6248`.
- No user file, stash, unknown directory, or registered worktree was deleted or overwritten. Three stashes and 121 registered worktrees remain preserved.

## Qualification Labels

- CONTEST V1 MERGE: PASS
- FRONTEND BACKEND SYNC: PASS
- CONTEST LANDING: PASS
- CONTEST DETAIL: PASS
- DEVELOPMENT FIXTURE: PASS
- REAL DB VERIFIED: YES
- REAL API VERIFIED: YES
- BROWSER VERIFIED: PENDING USER
- STANDINGS: NOT AVAILABLE
- NO PRODUCTION DATA POLLUTION: PASS
- FOCUSED TESTS: PASS
- TYPECHECK: PASS
- API BUILD: PASS
- WEB BUILD: PASS
- MANUAL UI ACCEPTANCE: PENDING USER
