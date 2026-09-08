# Discussion Hub Experience Wave 2 Main Integration V1 Report

Date: 2026-09-08

## Result

`PASS` for candidate semantic integration and automated qualification.
Manual UI acceptance remains `PENDING USER`.

## Preflight

- Main before: `795e7138e3c09d3a355b8e611b6fc17f77d0bce8` (`main`, equal to `refs/heads/main`).
- Feature source: `e29e480f0a71d06a98ffca5dd30f5fa1f1d92215`, committed and clean.
- Feature code commit: `0f804f5`.
- Feature C precheck: PASS.
- Runtime Recovery, Worker B authoring, and Worker A correctness: present.
- Existing main dirty `Docs/PROJECT_STATUS.md`, untracked artifacts, and `stash@{0}` were not modified or removed.

## Integration

- Worktree: `D:\OJPlatform-worktrees\discussion-hub-integration-v1`
- Branch: `codex/discussion-hub-integration-v1`
- Candidate code head: `d228783de2df09cf1e55cf2c258562a3f808c729`
- Feature commit was cherry-picked onto latest main. Conflicts were limited to status/report documentation and resolved by retaining both histories.
- No whole-file ours/theirs resolution was used.
- `DiscussionExperience.tsx` retained current-main `DiscussionEditor`, shared `MarkdownToolbar`, preview, draft/publish behavior, and authoring Toast usage while taking Worker C Hub, feed, detail, comments, and state presentation.
- `app.css` merged automatically by Git at rule-block level. Existing authoring styles and Worker C browsing styles remain present; no full CSS rewrite occurred.
- Copy Link success now uses existing global `useToast()`; failure remains visible inline. No second provider or notification system was added.

## Contract Audit

- Domain remains `ARTICLE` and `ANNOUNCEMENT`; no schema, migration, or third content type added.
- Feed uses one item template with type badge, author, time, optional stored summary, likes, and comments. It does not synthesize summaries from Markdown.
- Detail uses shared sanitized Markdown renderer with GFM, KaTeX, code, tables, links, images, and blockquotes.
- Content and comment controls use server capabilities.
- Typed repository lookup remains `id=$1` for internal UUID and `public_id=$1` for public IDs; no `id=$1 OR public_id=$1` query exists.
- `0026_submission_source_permission` and submission-source endpoint remain present.
- Static home announcements, contest notices, and private messaging remain domain-specific.
- Responsive CSS retains horizontal tabs, wrapping metadata, fluid detail width, and code/table overflow handling for 1440, 1280, 1024, 768, and narrower layouts. Manual visual confirmation remains pending.

## Validation

- Worker C / B authoring / A unit focus: PASS, 20/20.
- PostgreSQL typed-key, Article publish, and Announcement authorization integration: PASS, 1/1, with transaction rollback.
- Navigation regression selection: 35/36 PASS. Existing Profile fixture failure (`capabilities.activity` absent) reproduced unchanged on pre-integration main; Discussion/Problem/Team/navigation coverage passed.
- Web typecheck: PASS.
- API typecheck: PASS.
- Root typecheck: PASS.
- Web build: PASS; existing large-chunk warning only.
- API build: PASS.
- Changed-file lint: PASS.
- Architecture gate: PASS.
- `git diff --check`: PASS.
- New regressions: NONE.

## Runtime

Runtime Manager Status showed API, Web, Judge Service, Host Agent, Supervisor,
and Worker DOWN; infrastructure remained reachable and `MIXED SOURCE = False`.
Start, HTTP smoke, and Stop were not run because automated UI integration
qualification was sufficient and this Goal does not requalify Judge Runtime.

## Profile Integration Notes

- Last migration: `0026_submission_source_permission`.
- Global Toast and Discussion Hub are integrated in candidate.
- Worker D worktree was not modified, rebased, reset, deleted, or merged.
- Worker D temporary `0026_profile_experience` must be renumbered during its future integration.

## Safety and Remaining Work

- `git clean`, `git reset --hard`, history rewrite, directory copy, and force operations: NOT USED.
- Manual UI acceptance: PENDING USER.
- Main merge and main-side revalidation are required after this report commit.

