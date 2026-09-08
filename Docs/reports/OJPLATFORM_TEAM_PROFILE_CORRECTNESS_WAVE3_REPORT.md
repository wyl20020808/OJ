# OJPlatform Team + Profile Correctness Wave 3

Status: PASS for implemented and automated scope. Manual UI acceptance: PENDING USER.

## Source and delivery

- Observed main head: `38c6ab944d45324bacfb4ed72ea8d093498962a5`
- Worktree: `D:\OJPlatform-worktrees\team-profile-correctness-wave3`
- Branch: `codex/team-profile-correctness-wave3`
- Main modified: NO; main merged: NO
- Migration chain observed through `0027_profile_experience`; no schema change.

## Team detail

Team identifier contract is slug-based: list DTOs expose `slug`, Team cards use `/teams/:slug`, App route decodes the same segment, API uses `/api/teams/:slug`, service calls `repository.getTeam(slug)`, and both repositories support slug lookup. Hyphenated slugs remain valid and internal UUIDs are not exposed in URLs. Canonical route: `/teams/:slug`.

Root cause: `TeamPage` used `Promise.all([api.team(slug), api.teamMembers(slug)])`. `teamMembers` is an authenticated/member-only endpoint. Anonymous users and authenticated non-members therefore received 401/403, causing the combined promise to render the generic “团队不存在或当前不可见” state even when the public detail request succeeded. Fix: detail loads first; protected member loading is best-effort and cannot hide public detail.

List and detail visibility now share the service policy: `PUBLIC` detail is visible to anonymous, ordinary users, members, and owners; `PRIVATE` detail is canonical-denied to anonymous/non-members and visible to members/managers/owners. Join policy remains separate: `INVITE_ONLY` affects joining, not public detail visibility. No deleted/archive predicate exists in current Team Core model.

Team list links and Profile Team links both use `/teams/${encodeURIComponent(slug)}`. Existing create, join, request, invite, leave, role, and duplicate protections were not changed.

## Profile edit

Entry audit: `/profile` and `/account` mount `ProfileExperience`; the self-only `编辑资料` button navigates to canonical `/settings` (legacy `/account/settings` remains compatible); `/settings` mounts `AccountSettings`. The new editor is the existing `ProfileEditor` inside `AccountSettings`, with display name, headline, bio, location, organization, website, GitHub, hydration from `GET /api/profile/me`, save through `PATCH /api/profile/me`, cancel restoring persisted values, and global `ToastProvider`/`useToast` reuse.

Root cause classification: no missing route or duplicate editor. The previous complaint was caused by the old account panel text remaining adjacent to the newly mounted editor, making the page appear unchanged. The canonical self-profile path is now covered by a route/wiring test and the obsolete “editing unavailable” wording was removed. Username and email remain outside the public profile editor.

Profile privacy remains unchanged: other profiles do not render the edit button; private teams are filtered from other viewers; anonymous users cannot call the protected own-profile endpoints.

## Validation

- Team/API/profile/component regression tests: PASS, 49 tests
- API typecheck/build: PASS
- Web typecheck: PASS
- Architecture checks: run at delivery
- Changed-file lint: run at delivery
- `git diff --check`: run at delivery
- PostgreSQL fixture qualification: NOT VERIFIED (no real data mutated)
- Manual UI acceptance: PENDING USER

Homework Worker overlap: LOW. Changes are limited to existing Team detail loading, Profile editor copy/validation, focused tests, and this report. No assignment/homework routes or schema were touched.

Final migration: NOT NEEDED. Ready for integration: YES.
