# OJPlatform V3 UI Final Integration V1 Report

Date: 2026-09-05
Status: PASS
Starting main HEAD: `1549815194690f70f38dbdfd9647042f64e720a7`
Integration branch: `codex/v3-ui-final-integration-v1`

## Scope

This Goal integrates the completed Problem Page UX V3, Evaluation Detail UX V3,
and Admin Chinese + Notification V1 branches into current canonical `main`.
No new product feature, Runtime qualification, browser E2E, real SSE diagnosis,
ZIP 500 diagnosis, `INFRA_FAILED` diagnosis, Launcher change, Runtime Manager
change, or plugin change is included.

## Sources and Ancestry

- Problem source: `b8dcaa5edb14038859ca688c45f94a7386696929`
- Evaluation source: `2f8e5fe5c6ab8a7a608f73fa46669877d4fb3618`
- Admin source: `4d7b83c156906deb25323432be878fe9fad10c98`
- Notification source included by Admin ancestry:
  `85ab145b4ba798de71f2177a9e453ec60fde5d7d`

All three source worktrees were tracked-clean. Each source diverged directly
from starting main and was absent from main. Problem fast-forwarded into the
integration branch. Evaluation and Admin used normal merge commits. Their only
merge conflicts were independent additions at the top of
`Docs/PROJECT_STATUS.md`; all status entries were retained.

## Feature Coverage

- Traditional Problem submission route, language selector, source input, and
  formal Submission API: PRESENT.
- Problem right information card in normal document flow: PRESENT.
- Public revision UUID and JudgeData version label hidden: PRESENT.
- Sample copy preserves input only: PRESENT.
- Sample panels use light styling with whitespace preservation: PRESENT.
- Top testcase progress grid: PRESENT.
- Evaluation desktop right information card and mobile stacking: PRESENT.
- SSE subscription after asynchronous snapshot: PRESENT.
- Terminal testcase non-regression and post-terminal stale delta rejection:
  PRESENT.
- Admin Judge Chinese presentation with backend enums unchanged: PRESENT.
- Notification outside-click, close button, Escape, and listener cleanup:
  PRESENT.

The inherited `WEB-V4-054` CSS contract still required a sticky Problem side
card. The integration updated only that stale assertion to require no
sticky/fixed positioning, matching the approved V3 behavior.

## Validation

- Problem focused tests: TESTED, 2 files / 20 tests PASS.
- Evaluation focused tests: TESTED, 2 files / 10 tests PASS.
- Admin and notification focused tests: TESTED, 3 files / 172 tests PASS.
- Web TypeScript typecheck: TESTED, PASS.
- Web production build: TESTED, PASS. Existing Vite large-chunk advisory only.
- Targeted ESLint for changed Web and test files: TESTED, PASS.
- `git diff --check`: TESTED, PASS before each merge and final integration.
- Runtime qualification: NOT RUN by explicit task constraint.
- Real SSE: NOT VERIFIED.
- ZIP 500: NOT VERIFIED.
- `INFRA_FAILED`: NOT VERIFIED.

The first validation attempt encountered `ERR_PNPM_EPERM` after concurrent
dependency hydration in the fresh worktree. A serial offline frozen-lockfile
install completed successfully; all recorded gates above were then rerun and
passed.

## Architecture, Security, and Compatibility

No architecture boundary, Judge backend, public backend contract, database
schema, dependency, or security model changed. User submissions remain outside
API/Web execution. Backend enum values are unchanged. This integration changes
only existing Web presentation/state handling, tests, and documentation.

## Plugin and User Files

`D:\OJPlatformPlugins\OnlineCodeEditor` remained on `main` at
`b8fbfcc49643e2487e47ac0c5b55d966270d13cc`, tracked-clean, with its existing
untracked `pnpm-lock.yaml` untouched. Existing untracked artifacts in
`D:\OJPlatform` were not modified or included. Feature branches were not
deleted.

## Runtime Limitations

No Start, Stop, Restart, browser E2E, formal Submission, JudgeData upload, or
runtime diagnosis was performed. The integrated source is ready for the user to
start, but no new Runtime or real-SSE PASS is claimed.

## Final Git State

The integration branch contains all source commits and the integration contract
update. The normal main merge and final hashes are recorded after merge in this
report's finalization note. Canonical root untracked user artifacts remain
outside all commits.
