# OJPlatform Discussion Viewer Capability Repair V1

Status: PARTIAL

## Provenance and scope

- Base HEAD: `594b3b8` (`codex/discussion-blocker-repair-v1`).
- Viewer repair branch: `codex/discussion-blocker-repair-v1`.
- Scope limited to request-time Discussion viewer capability projection and Web controls.
- `D:\OJPlatform`, `main`, migration numbering, and shared Product PostgreSQL were not modified.

## Implemented

- Added safe `capabilities` projection for post detail/mutation responses:
  `canEdit`, `canDelete`, `canModerate`.
- Added safe `capabilities` projection for comment list/mutation responses.
- Capability decisions use current viewer, internal ownership, moderation capability, announcement capability, and content status.
- Anonymous viewers receive all-false capabilities.
- Web post and comment controls now consume server flags; no username, display name, or internal ID comparison is used.
- Mutation routes retain backend authorization and remain the security boundary.
- Public author projection remains ID-free; profile links still use `author.username`.

## Validation

| Area | Result |
| --- | --- |
| Focused Discussion tests | TESTED: `8/8` passed via `pnpm vitest run tests/discussion-core.test.tsx` |
| Capability/API authorization tests | TESTED: owner, other, anonymous, moderator, draft, forged mutation |
| Web control rendering test | TESTED: owner post/comment controls rendered from server flags |
| API typecheck | TESTED: `pnpm typecheck` passed |
| API build | TESTED: `pnpm --filter @ojplatform/api build` passed |
| Web build | TESTED: `pnpm --filter @ojplatform/web build` passed |
| Targeted lint | TESTED: Discussion API/Web/tests passed |
| Architecture gate | TESTED: `pnpm test:architecture` passed |
| Diff check | TESTED: `git diff --check` passed |
| Pagination regression | TESTED: previous focused suite remains green |
| Comment count regression | TESTED: previous focused suite remains green |
| Author projection regression | TESTED: previous focused suite remains green |
| PostgreSQL runtime | NOT VERIFIED: prohibited by task constraints |
| Browser/manual UI | NOT VERIFIED: prohibited by task constraints |

## Contract result

- Owner post edit/delete: YES.
- Other-user post controls: DENIED, no identity leak.
- Anonymous post controls: DENIED, no identity leak.
- Moderator post capability: PASS.
- Owner comment edit/delete: YES.
- Other-user comment controls: DENIED.
- Moderator comment capability: PASS.
- Public post/comment `authorId`: HIDDEN.
- Safe author object: PASS.
- Private metadata leak: NO.
- Backend authorization preserved: YES.
- Forged mutation: DENIED.
- Migration change: NO. Current temporary migration remains `0023_discussion_core`; final number pending latest main.

## Delivery

Final commit and clean-worktree state are recorded by the closing integration step. Runtime, database, and browser qualification remain required during final Discussion integration.
