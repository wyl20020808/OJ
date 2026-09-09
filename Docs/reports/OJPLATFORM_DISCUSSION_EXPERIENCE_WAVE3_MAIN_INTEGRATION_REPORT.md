# Discussion Experience Wave 3C Main Integration V1

## Outcome

**PASS for required integration scope**. Worker C remains on candidate branch `codex/discussion-experience-integration-v1` from live `main` (`5ff136c`) with normal cherry-pick and semantic conflict resolution. PostgreSQL was recovered for Windows Node access, current-state `0028` qualification passed, and candidate is ready for normal merge. Runtime HTTP smoke remains blocked only by the pre-existing plugin runtime issue.

## Evidence

- Feature source: `8207a27735b4624995ecf6ddc340c2ed9a819b6a`.
- Candidate commits: `57924ea` (feature), `6e05353` (status conflict cleanup), `ecea595` (migration renumber).
- Current migration tail: `0027_profile_experience`; final comment-like migration: `0028_discussion_comment_likes`.
- Temporary `00XX_discussion_comment_likes` files: absent.
- Focused Discussion and Hub tests: 16/16 PASS.
- Root typecheck: PASS. API/Web builds: PASS. Architecture gate: PASS. Diff check: PASS.
- Candidate changed-file lint: no errors; CSS warning is expected because stylesheet is outside ESLint config.

## Not Verified / Blocked

- Compose mapping is `0.0.0.0:55432->5432/tcp`; PostgreSQL health and in-container `pg_isready`/`SELECT 1` passed. Windows TCP connectivity passed while the Compose foreground session kept the Product DB alive.
- Full historical runner replay is blocked by pre-existing non-idempotent `0020 judge_artifacts` (`relation "judge_artifacts" already exists`), recorded as `HISTORICAL REPLAY ISSUE`. Forward `0028` apply was executed against current state and passed; second run was idempotent (`IF NOT EXISTS`) and passed.
- Schema passed: columns `comment_id`, `user_id`, `created_at`; composite primary key `(comment_id,user_id)`; cascading FKs to comments/users; expected indexes.
- Real PostgreSQL reply and like fixture passed: nested parent relations, cross-post rejection, deleted-parent tombstone with hidden body, child visibility, idempotent like/unlike, two-user count, viewer projection, reload persistence. Fixture rolled back; real user data unchanged.
- Runtime start/status HTTP smoke: BLOCKED by existing `CANONICAL_PLUGIN_MAIN_NOT_FOUND` from `scripts/dev-runtime.ps1 start`.
- Normal merge completed as `be822941dd23d65e67d756fbce7a403a46a12ec1`. Main-side focused Discussion tests, root typecheck, API/Web builds, architecture, and diff check passed.
- Manual UI: PENDING USER.

## Preservation

Worker A Remember Me, Worker D Team/Profile correctness, and Worker E sticky pagination remain present in candidate history. No Homework, OnlineCodeEditor, Judge Runtime, or Discussion V4 changes were made. Canonical main user artifacts and existing stashes were preserved; no `git clean`, `git reset --hard`, or history rewrite used.

## Gate

## Final State

- Main branch: `main`; HEAD matches `refs/heads/main` at `be822941dd23d65e67d756fbce7a403a46a12ec1`.
- Final migration chain tail: `0025_discussion_core`, `0026_submission_source_permission`, `0027_profile_experience`, `0028_discussion_comment_likes`.
- `00XX_discussion_comment_likes`: absent; duplicate migration ID: none.
- Runtime HTTP smoke: `BLOCKED_BY_EXISTING_PLUGIN_RUNTIME`; no Runtime/Plugin/Judge code changed.
- Manual UI: pending user.
