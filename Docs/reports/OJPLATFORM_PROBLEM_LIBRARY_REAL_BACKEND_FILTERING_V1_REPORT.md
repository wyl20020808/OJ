# Problem Library Real Backend Data & Server-side Filtering V1

## Live Base

- Base `main`: `7e62fb6c8d601f3f9d7527482bfd95f19de3a386`
- Feature branch: `codex/problem-library-server-filter-v1`
- Worktree: `D:\OJPlatform-worktrees\problem-library-server-filter-v1`
- Original canonical dirty work: untouched.

## UI to API Audit

| Control/data | UI | URL | API/server | Result |
| --- | --- | --- | --- | --- |
| Keyword search | present | `q` | `search` | SUPPORTED |
| Difficulty | present | `difficulty` | validated SQL predicate | SUPPORTED |
| Tag | present | `tagIds` | canonical active tag ID, validated SQL `EXISTS` predicate | SUPPORTED |
| Source | present | `sourceType` | validated SQL predicate | SUPPORTED |
| Page/pagination | present | `page` | offset/limit and filtered `total` | SUPPORTED |
| Status/visibility | API-only on the public library page | not applicable | existing authorization-aware predicates | SUPPORTED |
| Sort | default-only control | not applicable | existing public-number order | NOT APPLICABLE |
| Time/memory/acceptance/personal-state controls | disabled presentation | no | no | NOT APPLICABLE |

`difficulty`, tag, and source no longer filter `data.items` in production UI.

## Final API Contract

`GET /api/problems?search=&difficulty=&tagIds=&sourceType=&offset=&limit=`

- `difficulty` is one canonical difficulty value.
- `tagIds` is one canonical positive tag ID in V1, matching the single-select UI.
- `sourceType` is a canonical source type: `CREATOR`, `EXTERNAL`, `IMPORT`, `TEST_FIXTURE`, or `API_AUTOMATION`.
- Search and every filter compose with `AND` semantics.
- The tag predicate uses `EXISTS`, so a problem with multiple tags is returned once. The count and row queries reuse the same predicate.

## Other UI Data Gaps

- Per-difficulty/source facet counts previously represented only the loaded page. They now render `—` until a server-provided facet-count contract exists.
- The former “热门标签 / 本页统计” was current-page derived data. It is now the authoritative tag catalog without fake counts.
- Personal favorites, recent views, pending practice, acceptance statistics, and the disabled extra filters remain unavailable or placeholder-only; this feature does not fabricate data.

## Auth, Schema, and Indexes

Existing public/owned visibility predicates remain the first restriction; filters only add `AND` conditions. No migration is required: existing `difficulty`, `source_type`, `problem_tags`, and both `problem_tags` directional indexes cover this change.

## Qualification

- Focused backend/frontend tests: PASS (3 tests)
- Existing problem/tag regression tests: PASS
- Typecheck: PASS
- Web build: PASS
- API build: PASS
- Changed-file lint: PASS
- Diff check: PASS
- Real PostgreSQL: NOT VERIFIED (no isolated database fixture run)
- Runtime/manual UI: NOT VERIFIED / PENDING USER

## Remaining Debt

Server-side facet totals, acceptance statistics, personal problem state, and the disabled extra filters require their own authoritative backend contracts.
