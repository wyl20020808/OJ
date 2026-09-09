# Product Experience Wave 4D: Discussion & Announcement Experience V4 Main Integration

Date: 2026-09-09  
Status: MAIN INTEGRATION = PASS  
Manual UI acceptance: PENDING USER

## Source and Integration

- Main before: `ebfa96689d57c35fd5927583712eb5433145acec` (`refs/heads/main`).
- Feature source branch: `codex/wave4-discussion-announcement-v4`.
- Feature source/code head: `2f017a87155a8a19afaf1f370f2da144ba9fd609`.
- Integrated feature commit: `2f017a87155a8a19afaf1f370f2da144ba9fd609`.
- Candidate: `D:\OJPlatform-worktrees\wave4-discussion-integration-v1` / `codex/wave4-discussion-integration-v1`.
- Candidate head: `51e5441`.
- Normal main merge: `9389d4e` (`merge: integrate wave4d discussion announcement experience`).
- Main after merge: `9389d4e`; final main after report recording: `fa811df`; `HEAD == refs/heads/main`: YES.
- Cherry-pick had one `Docs/PROJECT_STATUS.md` content conflict. Resolution retained current main Wave4A/Wave4C/Wave4E history and added Wave4D integration evidence; no whole-file ours/theirs resolution used.
- No Wave4F, OnlineCodeEditor, Judge, Sandbox, Runtime, or Plugin changes included.

## Migration Qualification

- Current main tail before integration: `0025_discussion_core`, `0026_submission_source_permission`, `0027_profile_experience`, `0028_discussion_comment_likes`, `0029_team_assignment_v1`.
- Feature migration original/final: `0030_discussion_announcement_capability` / `0030_discussion_announcement_capability`.
- Renumbered: NO. Migration number unique: YES.
- `scripts/migrate.mjs` registration updated with `0030_discussion_announcement_capability`.
- Migration content only grants `discussion:announcement:create` to `platform-root` and `superadmin`, idempotently; no ordinary-user/member/admin-wide grant.
- Current-state Product runner apply: PASS (`0030` APPLY after `0029`).
- Second run: PASS (`0030` REUSE; checksum unchanged).
- Full historical replay: PRE-EXISTING_BLOCKER recorded in project history at non-idempotent `0020_judge_artifacts`; historical migration content was not modified.

## PostgreSQL and Capability Qualification

- Product PostgreSQL container: PASS / healthy, `0.0.0.0:55432 -> 5432`.
- `pg_isready`: PASS.
- Container `SELECT 1`: PASS.
- Windows TCP probe: PASS.
- Windows Node PostgreSQL client `SELECT 1`: PASS.
- Real transaction-scoped fixture: PASS. `platform-root` and `superadmin` created and published `ANNOUNCEMENT`; ordinary user was denied creation/publication. Announcement feed returned only published announcements; detail route resolved through `/discussion/:publicId`.
- Fixture cleanup: PASS via rollback. Fixture users remaining: `0`. Real user data mutated: NO.
- Authorization model: capability-backed role projection. Username/identity hack: NO.

## Discussion and Home Contract

- Feed padding, hierarchy, summary, metadata, type badge, and responsive styles preserved: PASS by static/component audit.
- Article reading width, title/meta/body rhythm, Markdown/GFM/KaTeX/code/table/link sanitization path, and comment separation preserved: PASS by static/component audit.
- Reply target projects real parent author `displayName` with username fallback; reply-to-reply parent IDs remain server-validated: PASS.
- Inline reply editor is rendered under its target and one active editor is enforced: PASS.
- Top-level/reply/edit surfaces use shared `DiscussionRenderer` and `MarkdownToolbar` preview: PASS.
- Like optimistic state, active styling, `aria-pressed`, rollback, reload persistence, and unlike: PASS in focused Discussion suite.
- Deleted comment body remains hidden; cross-post parent validation remains server-denied: PASS in focused Discussion suite.
- Home uses API-backed `ANNOUNCEMENT` + `PUBLISHED` data only, links to `/discussion/:publicId`, and renders `暂无公告` for empty data. `staticAnnouncements` export removed: PASS.

## Regression and Quality Evidence

- Focused Wave4D/Wave4A/Wave4C/Wave4E tests: `91/91 PASS` across Discussion, Web announcement/auth, Problem Statement, Assignment, and Team suites.
- Root typecheck: PASS.
- API typecheck: PASS.
- API build: PASS.
- Web build: PASS.
- Changed-file ESLint: PASS.
- Architecture gate: PASS.
- `git diff --check`: PASS.
- Candidate tracked worktree clean after commits.

## Safety and Remaining Manual Step

- `git clean`: NOT USED.
- `git reset --hard` / `git restore .`: NOT USED.
- Existing stash entries and root untracked user artifacts preserved.
- Manual Discussion feed, article, comments, and Home visual acceptance remains PENDING USER; this is not an automated integration blocker.
