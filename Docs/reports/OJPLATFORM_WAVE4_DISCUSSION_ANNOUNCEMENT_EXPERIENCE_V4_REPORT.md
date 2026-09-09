# Product Experience Wave 4D: Discussion & Announcement Experience V4

Status: PARTIAL

## Implemented

- Discussion feed now has inset editorial rows, explicit title/summary/meta hierarchy, restrained type badges, and narrow-screen wrapping.
- Article detail uses a constrained reading column, stronger title/body rhythm, separated action and comment surfaces, and improved comment spacing.
- Comment replies expose `回复 @displayName` (fallback username); nested replies remain visually capped at two levels while preserving real parent IDs.
- Reply composer renders directly under its target comment; one active reply editor remains enforced.
- Top-level, reply, and edit comment surfaces provide 编辑/预览 tabs using shared `DiscussionRenderer` and `MarkdownToolbar`, including empty preview state.
- Comment likes update optimistically, expose active/ARIA state, and roll back on API failure.
- Home announcement panel renders only API `PUBLISHED` announcements, links to `/discussion/:publicId`, and shows `暂无公告` when empty. Static fake rows no longer render.
- Migration `0030_discussion_announcement_capability` grants announcement capability to `platform-root` and `superadmin` roles.

## Tested

- Root TypeScript typecheck: PASS.
- Focused Discussion tests: 16/16 PASS.
- API build: PASS; Web build: PASS.
- Changed-file ESLint: PASS; architecture gate: PASS.
- `git diff --check`: PASS.

## Not Verified

- PostgreSQL migration qualification, runtime startup, responsive browser audit, and manual visual acceptance remain pending.
- Full regression/build/lint suite not run in this worker turn.

## Architecture / Security

No new Discussion model, reply relation, renderer, or like mechanism added. Authorization remains server capability based; no username hack. No Judge or sandbox code changed.
