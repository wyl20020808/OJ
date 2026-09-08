# OJPlatform Product UX Repair Wave 1 Report

## Result

```text
PRODUCT UX REPAIR WAVE 1 = PASS
MAIN HEAD BEFORE = 82475afb90f1ff7947042adec9a61288d5ab7840
RUNTIME-QUALIFIED HEAD = 524f2714837c7955d69fe56f1facb3aac4fa75ab
MANUAL UI ACCEPTANCE = PENDING USER
```

The implementation, focused automated checks, build gates, and controlled local
runtime qualification passed. Browser control was not used. The user retains
manual visual acceptance responsibility.

## Scope Delivered

### Tag Selector

- Problem create and edit continue to share `TagSelector`.
- The catalog is hidden by default behind a compact pill trigger.
- Hover opens with a 180 ms leave delay; moving between trigger and popover
  preserves the surface. Click pins/unpins it, outside click closes it, and
  Escape closes it.
- Selected tags remain outside the popover and can be removed directly.
- Search matches name, slug, and category. Categories without results disappear,
  and an explicit empty state is shown.
- Categories render compact responsive tag matrices with selected, hover, focus,
  and `aria-pressed` states.
- Existing `tagIds` hydrate selected chips after the catalog loads.

### Team Duplicate Root Cause

Classification: **D - Web state/render duplication**.

`TeamPage` loaded `/api/teams/mine` and `/api/teams`, then concatenated both
arrays. A public Team owned or joined by the viewer legitimately appears once in
each API response, so the Web array contained the same Team twice. The create
handler, API route, service, transaction, and repository each performed one
create. PostgreSQL contained one Team row and one OWNER membership.

The fix presents membership and discoverable results as separate views. The
discoverable projection excludes IDs already present in membership results.
Pagination appends only previously unseen IDs as a defensive client boundary;
this is additional protection after fixing the actual cross-query composition
error, not a mask for duplicate backend rows.

Create Team also uses a synchronous submission ref plus disabled/loading state,
so two submit events before a React render still issue one mutation and one
redirect.

### Discussion Navigation

Inspection found Discussion Core absent from actual `main`, contrary to the task
premise. Its existing qualified implementation at
`codex/discussion-blocker-repair-v1` was merged rather than reimplemented. Team
Core and Problem Tags changes were preserved. The Discussion migration was
renumbered from the conflicting source number `0023` to `0025`, after Team `0023`
and Problem Tags `0024`.

The shared responsive primary navigation now includes Chinese label `讨论`, links
to `/discussion`, and remains active for all route names with the `discussion`
prefix, covering list, create, detail, and edit routes. Problem, Team, contest,
submission, profile, and admin navigation remains intact.

### Team UI

- Team list: product header, create action, membership/discovery segmented views,
  search, count indicators, responsive cards, role/visibility/join-policy
  metadata, loading state, and complete empty states.
- Team detail: initial avatar, slug, description, policy badges, truthful actions,
  overview facts, section navigation, and member list with roles and joined dates.
- Create Team: structured sections, field help/errors, slug suggestion that stops
  after manual editing, URL preview, selectable visibility and join-policy cards,
  live Team preview, server error banner, invalid/submitting disablement, and
  responsive two-to-one-column layout.
- No upload, ownership transfer, archive/delete, Team Problem Collection,
  Assignment, or Homework UI was added.

## Automated Evidence

```text
Focused Tag/Team/Discussion/Problem tests = PASS, 48/48
Submission/JudgeData/API/Web regression = PASS, 69/69
Additional product regression = 256/257 PASS
API typecheck = PASS
Web typecheck = PASS
Root typecheck = PASS
API build = PASS
Web build = PASS
Changed-file lint = PASS
Architecture gate = PASS
git diff --check = PASS
```

The additional product regression failure is
`WEB-PROD-15 profile is available to signed-in users`: its legacy mock omits
`capabilities.activity`, while `ProfileExperience` expects that field. Neither
the failing component nor test changed in this Goal. The other 256 tests in that
run passed. This is recorded as an unrelated baseline test defect, not hidden or
weakened.

Full lint reproduces 8 existing unrelated errors in `code-run/routes.ts`,
`judge-service/projection.ts`, and the generated online editor declaration. All
changed-file lint checks pass.

## Runtime Evidence

`OJPlatform-Start.bat` applied `0025_discussion_core` and started the canonical
runtime. `OJPlatform-Status.bat` reported canonical/product root
`D:\OJPlatform`, branch `main`, matching code commit, and `MIXED SOURCE = False`.

A controlled fixture named `UX Duplicate Test 20260908111735447` used one API
create action. Evidence before cleanup:

```text
POST /api/teams request count = 1
Created Team ID = cc1f439c-6dc7-4122-af4b-0b8541897efc
PostgreSQL Team rows = 1
PostgreSQL OWNER membership rows = 1
GET /api/teams/mine occurrences = 1
GET /api/teams occurrences = 1
React rendered logical item = 1 (component test)
```

Only the fixture Team and fixture user were deleted. The exact Team slug query
returned `0` afterward. Runtime smoke also reported API readiness `ok`, Web HTTP
200, 81 tags across 10 categories, and Discussion API HTTP success.

## Acceptance Matrix

```text
DEFAULT CATALOG HIDDEN = YES
BUBBLE TRIGGER / HOVER / CLICK / POPOVER = PASS
MATRIX / CATEGORY GROUPING / SEARCH = PASS
SELECT / REMOVE / EDIT HYDRATION = PASS
CREATE/EDIT SHARED = YES

TEAM DUPLICATE BUG = FIXED
DOUBLE SUBMIT GUARD = PASS
PAGINATION/REFRESH = PASS

DISCUSSION NAV ENTRY = PASS
ROUTE = /discussion
ACTIVE STATE = PASS
TEAM NAV PRESERVED = YES
PROBLEM NAV PRESERVED = YES

TEAM LIST / CARD / EMPTY STATE = PASS
TEAM DETAIL / MEMBERS = PASS
CREATE TEAM / LIVE PREVIEW = PASS
VISIBILITY / JOIN POLICY CARDS = PASS
VALIDATION / SUBMIT STATE / RESPONSIVE = PASS

TEAM CORE / PROBLEM TAGS / DISCUSSION = PASS
PROBLEM AUTHORING / SUBMISSION / JUDGEDATA = PASS
NEW REGRESSIONS = NONE
```

## Safety

User dirty `Docs/PROJECT_STATUS.md` work was protected through merge autostash
and reapplied after the code commit. The pre-existing stash still resolves to
`3e72fac9251e58b930182bf95e61a6790b60194f`. Untracked user artifacts were not
modified or removed. No clean, hard reset, force checkout, history rewrite, or
browser automation was used.

```text
USER DIRTY FILES PRESERVED = YES
UNTRACKED ARTIFACTS PRESERVED = YES
MAIN MODIFIED = YES
MANUAL UI = PENDING USER
READY FOR USER UI ACCEPTANCE = YES
```
