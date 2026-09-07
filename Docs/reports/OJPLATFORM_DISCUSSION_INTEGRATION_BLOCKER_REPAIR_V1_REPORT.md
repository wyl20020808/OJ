# OJPlatform Discussion Integration Blocker Repair V1

Status: PARTIAL

## Scope and provenance

- Scope: Discussion Core V1 blocker repair only.
- Prep branch: `codex/discussion-integration-prep-v1`.
- Prep HEAD: `24fc13247c531ffd8883ee35343096e45b3fcf35`.
- Repair branch: `codex/discussion-blocker-repair-v1`.
- Main and `D:\OJPlatform` were not modified. Shared Product PostgreSQL was not accessed.
- Migration `0023_discussion_core` remains temporary; final numbering is pending latest main integration.

## Implemented

- Added typed cursor validation and stable keyset cursors carrying sort timestamp plus ID.
- Applied cursor consumption and deterministic ordering to in-memory and PostgreSQL post/comment repositories.
- Added safe public author projection: public post/comment payloads omit internal `authorId` and author object IDs, with deleted-user fallback.
- Preserved internal author IDs for ownership and moderator authorization.
- Corrected in-memory comment count increment/decrement behavior.
- Web discussion detail now displays server-backed `post.commentCount` and refreshes post metadata after comment create/delete.
- Added regression coverage for public DTO boundaries, deleted users, authorization, 25-post pagination, equal timestamps, invalid cursors, comment pagination, and count behavior.

## Evidence

| Area | Result |
| --- | --- |
| Focused Discussion tests | TESTED: `6/6` passed via `pnpm vitest run tests/discussion-core.test.tsx` |
| Pagination and author projection tests | TESTED: covered by focused suite; no duplicate IDs in equal-timestamp pages |
| API typecheck | TESTED: `pnpm typecheck` passed |
| API build | TESTED: `pnpm --filter @ojplatform/api build` passed |
| Web build | TESTED: `pnpm --filter @ojplatform/web build` passed |
| Targeted ESLint | TESTED: discussion modules, web feature/API types, and focused tests passed |
| Architecture gate | TESTED: `pnpm test:architecture` passed |
| Diff check | TESTED: `pnpm git diff --check` passed |
| Migration content/index review | IMPLEMENTED/NOT RUNTIME VERIFIED: existing post and comment cursor indexes are present |
| PostgreSQL runtime | NOT VERIFIED: prohibited by task constraints |
| Runtime manager/service startup | NOT VERIFIED: prohibited by task constraints |
| Browser/manual UI | NOT VERIFIED: prohibited by task constraints |
| Real migration apply | BLOCKED by explicit no-DB-mutation constraint |

## Contract summary

- POST `authorId` public exposure: HIDDEN.
- COMMENT `authorId` public exposure: HIDDEN.
- Safe author object: PASS.
- Deleted-user fallback: PASS.
- Authorization preservation: YES; repository/domain data retains internal IDs.
- Post cursor: consumed, deterministic, tie-broken by ID, final cursor omitted.
- Comment cursor: consumed, deterministic, tie-broken by ID, final cursor omitted.
- Comment total: server-backed `commentCount`; page size does not define total.
- Create/delete count updates: PASS in in-memory repository and UI metadata refresh path.
- Edit count stability: PASS by implementation; runtime/database not verified.

## Follow-up / residual risk

The public DTO no longer exposes identity needed for client-side ownership comparisons. Existing web edit/delete controls therefore remain hidden until an explicit safe capability/ownership contract is approved and added. This is a follow-up, not a reintroduction of `authorId`.

Final integration must select the migration number against latest main, apply it in an isolated authorized database environment, and perform PostgreSQL/runtime/browser qualification.

## Delivery

At report creation, product and test changes are tracked on this repair branch. Final commit and clean-worktree status are recorded by the closing integration step.
