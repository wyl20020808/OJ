# OJPlatform Team Assignment & Homework Wave 3F Main Integration V1

Status: PARTIAL

## Implemented

- Integrated Worker F from `9ec96ec038d6e6021751588bcc547b13e63d1095` into a fresh worktree based on main `04c78bd08f0ca6b15bd5cbd894f0406fe94ea3f5`.
- Preserved Remember Me, Discussion V3/comment likes, Team/Profile correctness, and sticky Problem pagination.
- Added team-bound Assignment/Homework API and Web routes, role/status authorization, read-time membership checks, normalized problem bindings, stable sequence-backed public IDs, and submission-derived AC progress.
- Resolved Team Detail overlap by retaining canonical `/teams/:slug` and adding the Assignment tab.
- Renumbered temporary `0099_team_assignment_v1` to formal `0029_team_assignment_v1` and registered it after `0028_discussion_comment_likes`.
- Replaced per-problem Assignment detail reads with a bounded batch ProblemRepository query.

## Tested

- Assignment focused tests: PASS, 2/2.
- API typecheck: PASS.
- Web typecheck: PASS.
- `git diff --check`: PASS.

## Not Verified / Blocked

- Product PostgreSQL migration apply, schema inspection, second-run qualification, real authorization/visibility/leave-team matrix, and real AC progress fixture: NOT VERIFIED in this candidate.
- Runtime HTTP smoke: NOT RUN; existing Plugin Runtime blocker remains out of scope.
- Manual UI acceptance: PENDING USER.

## Safety

- No `OnlineCodeEditor`, Judge Runtime, or sandbox changes.
- No user data mutation; no reset, clean, or force operations used.
- Existing main untracked user artifacts remain untouched.

## Merge Gate

Candidate is not eligible for main merge until PostgreSQL/domain qualification and required regression/build evidence pass.
