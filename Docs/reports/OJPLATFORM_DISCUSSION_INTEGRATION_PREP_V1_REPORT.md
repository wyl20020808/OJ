# OJPlatform Discussion Integration Prep V1 Report

Status: **PARTIAL**

This report is a read/audit/test/prep artifact written only in the temporary
prep worktree. No canonical source file, main ref, or shared Product database
was modified. No migration was applied or renamed.

## Source and Candidate

- OBSERVED_MAIN_HEAD: `8d0353f6b51618a46a6a7d4e44458fed90af0898`
- DISCUSSION_BRANCH: `codex/discussion-core-v1`
- DISCUSSION_HEAD: `f9da2e1ab2c48842f07d457d55f614efa8fb70b6`
- DISCUSSION_DELIVERY: VALID scope, provenance PARTIAL. Closeout changes are
  present as dirty tracked and untracked files in the source worktree, not in
  `DISCUSSION_HEAD`; prep candidate was reconstructed from the observed main
  tree plus those exact files.
- PREP_WORKTREE: `D:\OJPlatform-worktrees\discussion-integration-prep-v1`
- PREP_CANDIDATE_HEAD: `90f331d1481e6ee3be38f38d3d8c3ecae5cde7e6`
- MAIN_MERGED: NO

## Delivery Audit

Discussion delivery is limited to the Discussion API/domain, Web Discussion
feature, Discussion tests and docs, migration `0023_discussion_core`, minimal
router/navigation registration, API client methods, and the shared Markdown
toolbar export. No Team, Problem Tags, Homework, Assignment, Judge, Launcher,
or unrelated Problem feature files were found in the Discussion delivery.

## Domain and Security Audit

- POST: PASS for stable V1 fields and ARTICLE/ANNOUNCEMENT lifecycle.
- COMMENT: PASS for nullable `parent_comment_id`, tombstone status, and flat V1 paging contract.
- LIKE: PASS for unique `(post_id,user_id)` and POST/DELETE semantics.
- ARTICLE: PASS; default and ordinary-user path do not grant announcement capability.
- ANNOUNCEMENT: PASS; create/update/publish require `discussion:announcement:create`.
- DRAFT/TOMBSTONE: PASS; public list/detail and comments hide non-published/deleted posts.
- AUTHOR_PROJECTION: FAIL for public response minimization. Safe `author` object and
  deleted-user fallback exist, but top-level `authorId` remains in public Post and
  Comment JSON, exposing an internal identifier unnecessarily.
- PROFILE_LINK: PASS; links use encoded `/profiles/:username`.
- PRIVATE_DATA_LEAK: YES (internal `authorId` exposure; no email, permission, or session metadata observed).
- FALLBACK: PASS; missing users project to `deleted-user` / `Deleted User`.
- RENDERER: PASS for ReactMarkdown + GFM + LaTeX path.
- TOOLBAR: PASS for the shared ProblemEditor Markdown toolbar actions.
- SHARED_TOOLBAR: YES.
- SANITIZATION: PASS in focused XSS/unsafe URL test; `skipHtml`, sanitize, and KaTeX path are present.
- XSS: PROTECTED (focused regression).
- DRAFT_LEAK: NO by route authorization inspection.
- ANNOUNCEMENT_ESCALATION: PROTECTED (focused regression and route inspection).
- IDOR: PROTECTED by ownership/capability checks for posts/comments; expanded integration coverage remains required.
- CSRF: PASS in focused mutation test and all mutation routes.

## Comment Interaction Audit

- LOAD: PASS for initial fetch.
- CREATE: PASS for API route and Web refresh call.
- EDIT: PASS for owner/capability route and Web interaction.
- DELETE: PASS for tombstone route and Web interaction.
- REFRESH: PASS for explicit refresh and post-mutation refresh path.
- COUNT: FAIL in Web detail: heading renders `comments.length`, so a page capped at
  20 is shown as the total and create/delete does not reconcile `post.commentCount`.
- PAGINATION: FAIL for integration readiness. In-memory paging advances offsets,
  but PostgreSQL `list` and `listComments` ignore incoming cursors and emit an
  offset-zero cursor, which can duplicate pages or prevent progress.

## Migration Audit

- CURRENT_DISCUSSION_MIGRATION: `0023_discussion_core`
- OBSERVED_MAIN_LATEST_MIGRATION: `0022_problem_delete_provenance`
- TEAM candidate also uses `0023_team_core_v1`.
- TAGS candidate also uses `0023_problem_tag_catalog`.
- EXPECTED_FINAL_NUMBER: PENDING LATEST MAIN. If Team then Tags then Discussion
  remains the approved order, expected Discussion number is `0025`; this is only
  a forecast.
- FINAL_NUMBER_LOCKED: NO.
- REAL_DB_MUTATION: NO.

Migration SQL has the required post/comment/like tables, type/status checks,
foreign keys, unique like key, post list indexes, author/type indexes, and a
comment `(post_id,created_at,id)` index. PostgreSQL qualification and query-plan
verification were not run. The current comment index is not status-partial and
should be reviewed during final PostgreSQL qualification.

## Validation Evidence

- FOCUSED_TESTS: PASS, `63/63` in
  `tests/discussion-core.test.tsx` and
  `tests/product-web-chinese-rich-experience-v3.test.tsx`.
- API_TYPECHECK: PASS, package TypeScript check.
- WEB_TYPECHECK: PASS, package TypeScript check.
- ROOT_TYPECHECK: PASS.
- API_BUILD: PASS.
- WEB_BUILD: PASS.
- LINT: PARTIAL. Discussion-only target passes. Full target fails on existing
  `apps/api/src/app.ts:1099` (`@typescript-eslint/no-explicit-any`) outside the
  Discussion change lines.
- ARCHITECTURE: PASS.
- DIFF_CHECK: PASS.
- POSTGRES_RUNTIME: NOT VERIFIED. No `DATABASE_URL` qualification or migration apply was attempted.
- MANUAL_UI: NOT VERIFIED. Browser control was not used.

## Current Main Overlap

Observed committed main changes are launcher maintenance only; no committed
Discussion path overlap was found. Canonical root has unrelated dirty files,
including `Docs/PROJECT_STATUS.md`; those were not copied into the candidate.

Risk by Discussion path against current main:

- `apps/api/src/app.ts`: LOW against observed committed main; HIGH against future feature integrations.
- `apps/web/src/app/App.tsx`: LOW against observed committed main; HIGH against Team/Tags.
- `apps/web/src/services/api.ts`: LOW against observed committed main; HIGH against Team/Tags.
- `apps/web/src/components/ProblemEditor.tsx`: LOW against observed committed main; HIGH against Tags.
- `apps/web/src/app/app.css`: LOW.
- `Docs/PROJECT_STATUS.md`: MEDIUM because root is dirty and every integration updates it.
- `packages/database/migrations/0023_discussion_core.*`: HIGH; number collision with Team and Tags.
- Discussion-only module/feature/test/docs files: LOW.

## Team Discussion Overlap

Team candidate `codex/team-core-v1` (`98141786d3887c21572d30d56b8792f0843f8d2f`)
shares `apps/api/src/app.ts`, `apps/web/src/app/App.tsx`,
`apps/web/src/services/api.ts`, `Docs/PROJECT_STATUS.md`, and migration number
`0023`. It also changes the authz capability types. Registration order,
navigation composition, API client additions, capability naming, and migration
renumbering require semantic resolution after Team enters main.

## Tags Discussion Overlap

Tags candidate `codex/problem-tag-catalog-v1`
(`82e46f3dcc26be6e7f18253652f0270d42f49218`) shares `apps/api/src/app.ts`,
`apps/web/src/app/App.tsx`, `apps/web/src/services/api.ts`,
`apps/web/src/components/ProblemEditor.tsx`, `Docs/PROJECT_STATUS.md`, and
migration number `0023`. It adds `TagSelector` and modifies Problem Authoring.

SHARED_TOOLBAR_CONFLICT: MEDIUM. Both candidates touch ProblemEditor toolbar
context. Final merge must retain Problem Authoring behavior and TagSelector,
while keeping one exported Markdown toolbar reused by Discussion; do not copy a
second toolbar implementation.

## High-Risk Files

`apps/api/src/app.ts`, `apps/web/src/app/App.tsx`,
`apps/web/src/services/api.ts`, `apps/web/src/components/ProblemEditor.tsx`,
`Docs/PROJECT_STATUS.md`, and all `packages/database/migrations/0023_*` files.

## Final Integration Checklist

1. Read latest main HEAD after Team and Tags merge.
2. Read latest migration number and migration registry state.
3. Create a fresh Discussion integration candidate from that main.
4. Decide final Discussion migration number; do not assume `0025`.
5. Resolve router/navigation, toolbar/ProblemEditor, API composition,
   PROJECT_STATUS, capability registration, and migration conflicts semantically.
6. Correct public author projection and PostgreSQL cursor handling before merge.
7. Reconcile Web comment count with server total and add paging regression tests.
8. Apply migration only to an isolated, approved PostgreSQL qualification database.
9. Run Postgres repository/API integration and query-plan checks.
10. Run focused Discussion regression, Problem Authoring regression, Tags regression,
    and Team navigation regression.
11. Run typecheck, build, lint, architecture, diff audit, and full regression.
12. Merge main only by the Integration Lead.
13. Start latest main with the runtime manager and run HTTP smoke checks.

## Final Output

DISCUSSION INTEGRATION PREP V1 = PARTIAL

SOURCE

- OBSERVED MAIN HEAD = `8d0353f6b51618a46a6a7d4e44458fed90af0898`
- DISCUSSION BRANCH = `codex/discussion-core-v1`
- DISCUSSION HEAD = `f9da2e1ab2c48842f07d457d55f614efa8fb70b6`
- DISCUSSION DELIVERY = VALID scope / PARTIAL provenance

DOMAIN

- POST = PASS
- COMMENT = PASS
- LIKE = PASS
- ARTICLE = PASS
- ANNOUNCEMENT = PASS
- DRAFT/TOMBSTONE = PASS

AUTHOR

- AUTHOR PROJECTION = FAIL (top-level internal `authorId`)
- PROFILE LINK = PASS
- PRIVATE DATA LEAK = YES
- FALLBACK = PASS

MARKDOWN

- RENDERER = PASS
- TOOLBAR = PASS
- SHARED TOOLBAR = YES
- SANITIZATION = PASS

COMMENTS

- LOAD = PASS
- CREATE = PASS
- EDIT = PASS
- DELETE = PASS
- REFRESH = PASS
- COUNT = FAIL
- PAGINATION = FAIL

SECURITY

- XSS = PROTECTED
- DRAFT LEAK = NO
- ANNOUNCEMENT ESCALATION = PROTECTED
- IDOR = PROTECTED
- CSRF = PASS

VALIDATION

- FOCUSED TESTS = `63/63 PASS`
- API TYPECHECK = PASS
- WEB TYPECHECK = PASS
- API BUILD = PASS
- WEB BUILD = PASS
- LINT = PARTIAL
- ARCHITECTURE = PASS
- DIFF CHECK = PASS

MIGRATION

- CURRENT DISCUSSION MIGRATION = `0023_discussion_core`
- OBSERVED MAIN LATEST = `0022_problem_delete_provenance`
- EXPECTED FINAL NUMBER = PENDING LATEST MAIN (forecast `0025` only if order holds)
- FINAL NUMBER LOCKED = NO
- REAL DB MUTATION = NO

CONFLICT FORECAST

- MAIN OVERLAP = LOW committed-path overlap; HIGH future integration files
- TEAM OVERLAP = HIGH
- TAGS OVERLAP = HIGH
- SHARED TOOLBAR RISK = MEDIUM
- HIGH-RISK FILES = app composition, Web router, API client, ProblemEditor, status doc, migrations

DELIVERY

- PREP WORKTREE = `D:\OJPlatform-worktrees\discussion-integration-prep-v1`
- PREP CANDIDATE HEAD = `90f331d1481e6ee3be38f38d3d8c3ecae5cde7e6`
- MAIN MERGED = NO
- CANONICAL ROOT WRITTEN = NO
- READY FOR FINAL INTEGRATION = NO
- FINAL REPORT = `Docs/reports/OJPLATFORM_DISCUSSION_INTEGRATION_PREP_V1_REPORT.md`
