# OJPlatform Home + Problem Library UI Main Integration V1

## Status

Candidate integration status: PASS for automated integration scope.

Manual visual acceptance: PENDING USER. No browser automation, runtime startup, Judge, Sandbox, or Plugin work was performed.

## Git Forensics

- Canonical branch and `refs/heads/main` before integration: `main` / `fab6aaddb8d6d0e7a3f14207ab158577dc27c5a0`.
- Home and Problem Library redesign were split across canonical-main working-tree changes and untracked UI files.
- Source capture commit: `af0d695` on `codex/home-problem-library-ui-source-v1`.
- Candidate branch: `codex/home-problem-library-ui-integration-v1`; functional preservation commits: `daf6625`, `ae65e0b`.
- Preserved canonical user work: `scripts/infra.mjs` whitespace change, all pre-existing untracked files, and all three existing stashes.
- The static untracked `ProblemLibrary.tsx` sample table and its CSS were intentionally removed from the candidate. Production rendering remains `ProblemList` in `App.tsx`, backed by `api.problems`.

## Function Contract

- Home announcements use `api.discussionPosts`; contests use `api.contestHomeSummary`; daily problem uses `api.home`.
- Home keeps real links to discussion, contests, problems, profile, homework, and problem detail. Unsupported personal data remains `—` or explicit unavailable copy.
- Problem list uses `GET /api/problems` with real offset/limit pagination and real `search` query. Table rows, tags, statistics, source, and routes all derive from API responses.
- Difficulty, tag, and source controls preserve current product behavior: they filter the current real API page. The current backend contract exposes server-side search only; no unsupported server filter parameter was invented.
- Static production problem rows: NONE. Loading, error, empty, query URL state, sticky pagination, and `/problems/:slug-or-id` routing remain present.

## Evidence

- `pnpm typecheck`: PASS.
- `pnpm --filter @ojplatform/web build`: PASS.
- Focused Home/Problem regression: `tests/product-web-experience.test.tsx`, `tests/product-web-chinese-rich-experience-v3.test.tsx`, and `tests/product-web-r2.test.tsx`: PASS.
- Wave4 portal regression comparison: candidate retains only pre-existing failures `WEB-V4-012`, `016`, `019`, `021`, `025`, `082`, `128`, `137`; canonical main has those plus seven more failures. No new regression found.
- Changed frontend ESLint: PASS. CSS is not covered by the repository ESLint config.
- `no-irregular-whitespace`: PASS for changed TypeScript.
- `git diff --check`: PASS.

## Scope and Safety

- No `git clean`, `git reset --hard`, `git restore .`, `stash drop`, force operation, Judge change, Sandbox change, Plugin change, or runtime startup was used.
- Candidate diff is limited to Home/Problem Library UI source, banner asset, removal of static sample component, and required integration documentation.
