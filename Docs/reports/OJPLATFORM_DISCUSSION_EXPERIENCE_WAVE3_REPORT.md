# OJPlatform Discussion Experience Wave 3C Report

## Outcome

**DISCUSSION EXPERIENCE WAVE 3: PARTIAL**

Implementation and focused automated validation are complete in isolated worktree `D:\OJPlatform-worktrees\discussion-experience-wave3` on branch `codex/discussion-experience-wave3`. Manual UI acceptance remains pending. PostgreSQL qualification was not run in this worker turn.

## Source and Delivery

- Observed main head: `38c6ab944d45324bacfb4ed72ea8d093498962a5`
- Worktree: `D:\OJPlatform-worktrees\discussion-experience-wave3`
- Branch: `codex/discussion-experience-wave3`
- Canonical main modified: **NO**
- Main merged or ref updated: **NO**

## Implemented

### Feed V3 visual system

Feed rows now use an editorial hierarchy: title first, optional stored summary, author/date metadata, then compact interaction counts. Type badges sit in the heading row at the right edge with `min-width: 0` title behavior and two-line clamping. Announcement rows retain a restrained warm accent. Hover is limited to a light tint/border treatment.

### Article detail V3

Detail content remains constrained to an approximately 860px reading column. Type badge and owner controls share a quiet right-side control group; title is the dominant header element. Body typography, code, quote, table, image, link, GFM, KaTeX, and sanitized Markdown renderer contracts remain intact. Detail actions remain lightweight.

### Comment thread model and API

The existing `discussion_comments.parent_comment_id` relation is reused. No duplicate reply relation was added. Comment creation accepts `parentCommentId`; server validates that the parent exists and belongs to the same post, preventing cross-post parent IDOR. A reply to a reply remains stored with its real parent but is normalized to the top-level visual thread in the Web UI, with a second-level `@username` target marker.

Deleted parents remain visible as tombstones when they have visible children. Deleted comment body is not returned to the client.

### Comment likes

Added temporary migration `00XX_discussion_comment_likes.sql` and down migration. Data model uses `(comment_id,user_id)` composite primary key with cascading foreign keys. Repository supports idempotent like/unlike and projects `likeCount` plus `viewerLiked`. API endpoints:

- `POST /api/discussion/comments/:id/likes`
- `DELETE /api/discussion/comments/:id/likes`

Anonymous mutation is denied by auth and CSRF checks. Final migration number remains **PENDING INTEGRATION** because other Wave 3 workers are parallel.

### Comment authoring and display

Comments now reuse `MarkdownToolbar` and `DiscussionRenderer`, including preview-capable shared Markdown primitives, GFM, code blocks, tables, links, blockquotes, math, and sanitization. Reply, edit, cancel, save, delete, and like actions are wired through API calls; no localStorage or fake like count is used.

### Home announcement navigation

Home now requests published `ANNOUNCEMENT` discussion posts and links them to canonical `/discussion/:publicId` detail routes. Existing domain-specific static notes remain non-clickable, avoiding fake detail links.

## Security and boundaries

- Cross-post parent references rejected.
- Comment like routes require authenticated password-strength context and CSRF.
- Comment author/moderator capability checks remain server-provided.
- Markdown continues through sanitized shared renderer; raw HTML remains skipped.
- No Profile, Team/Homework, Problem Library, Judge Worker, Host Agent, or Sandbox changes.

## Validation

- `tests/discussion-core.test.tsx`: **15/15 passed** with existing discussion repository/API/renderer coverage.
- `tests/discussion-hub-experience-wave2.test.tsx`: **all passed**.
- API typecheck: **PASS**.
- Web typecheck: **PASS**.
- Root typecheck: **PASS**.
- Changed-file ESLint: **PASS**.
- Web build: **PASS**.
- API build: **PASS**.
- `git diff --check`: **PASS**.
- Architecture test: **NOT RUN**.
- Isolated PostgreSQL reply/like qualification: **NOT VERIFIED**.
- Runtime HTTP smoke: **NOT RUN**.
- Manual UI acceptance: **PENDING USER**.

## Integration overlaps and risks

Migration filename is intentionally temporary. Integration must assign the next canonical migration number and update the migration ledger only after the parallel worker migration order is known. High-risk overlap is limited to shared Discussion repository/routes and `app.css`; inspect integration conflicts before merge.

## Delivery status

Required feature changes are committed in this worktree. Required dirty/untracked counts for this worktree are recorded after commit in the final handoff. Canonical main remains untouched.
