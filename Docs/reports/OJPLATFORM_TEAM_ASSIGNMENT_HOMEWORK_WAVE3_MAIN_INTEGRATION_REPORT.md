# OJPlatform Team Assignment & Homework Wave 3F Main Integration V1

Status: PASS for qualification and candidate merge gate; runtime/manual UI remain pending.

Preflight: main `04c78bd08f0ca6b15bd5cbd894f0406fe94ea3f5`; feature source/code `9ec96ec038d6e6021751588bcc547b13e63d1095`; candidate `0f412495610a8709de274cb99b01c1bd765be3c5`.

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
- Formal full-history runner reaches the pre-existing `0020 judge_artifacts` duplicate-table failure; `0028` was present and current-state `0029` forward apply passed.
- `0029` second run passed. Schema inspection passed for tables, PK/FK, unique constraints, indexes, status check, team FK, public ID sequence, and normalized problem relation.
- PostgreSQL fixture matrix passed: owner/manager create and edit allowed; member/nonmember/anonymous denied; public-team nonmember denied; draft member denied; publish/close and invalid rollback enforced.
- Read-time membership passed: member sees Homework, leave removes My Homework and direct detail access; cleanup left zero fixture rows.
- Real submission progress passed: `0/3`, first AC `1/3`, WA remains `1/3`, second AC `2/3`, pending remains `2/3`.
- Windows TCP and Node PostgreSQL connectivity passed. Fixture cleanup passed; real user data mutated: NO.

## Not Verified / Blocked

- Product PostgreSQL migration apply, schema inspection, second-run qualification, real authorization/visibility/leave-team matrix, and real AC progress fixture: NOT VERIFIED in this candidate.
- Runtime HTTP smoke: `BLOCKED_BY_EXISTING_PLUGIN_RUNTIME`; no runtime code was modified.
- Manual UI acceptance: PENDING USER.

## Safety

- No `OnlineCodeEditor`, Judge Runtime, or sandbox changes.
- No user data mutation; no reset, clean, or force operations used.
- Existing main untracked user artifacts remain untouched.

## Merge Gate

Candidate is eligible for normal main merge after final candidate-side checks. Full historical replay remains blocked only by pre-existing `0020`; no historical migration was changed.
