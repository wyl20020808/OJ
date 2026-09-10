# Problem Library Full Backend Support & UI Functionality Completion

## 1. Live Base

- Canonical branch/HEAD at live check: `main` / `7e62fb6c8d601f3f9d7527482bfd95f19de3a386`.
- Live `refs/heads/main` was the same commit.
- Feature worktree: `D:/OJPlatform-worktrees/problem-library-full-backend-support-v1`.
- Feature branch: `codex/problem-library-full-backend-support-v1`.

## 2. Original Repo Safety

The canonical checkout had three tracked changes, untracked artifacts, three stashes, and many worktrees. None were changed or stashed. This work started from a fresh independent worktree based on live main.

Unmerged direct-child dependency `codex/problem-library-server-filter-v1` at `fa40c8e` supplied the bounded server-side filtering foundation. It was merged only into this feature branch as `923be20`; canonical main was not changed.

## 3. Full UI → Backend Audit

| UI element | Visible | Interactive | API/data | Before | Final |
| --- | --- | --- | --- | --- | --- |
| Search | Yes | Yes | `/api/problems?search=` | Supported | Working |
| Difficulty/source/tag filters | Yes | Yes | Typed query → repository predicate | Current-page/facet gap | Working |
| Tag catalog/categories/hot tags | Yes | Yes | `/api/tags`, `tagIds`, facets | Catalog only | Working |
| Applied chips/reset/retry | Yes | Yes | URL-backed list state | Supported | Working |
| Result total/pagination | Yes | Yes | Filtered `page.total` | Supported | Working |
| Sort select | Yes | Yes | `sort`, `order` whitelist | Enabled but inert | Working |
| Difficulty/source/tag counts | Yes | Yes/display | List `facets` | `—`/current page | Working |
| Profile solved/submission/favorite summary | Yes | Display | Existing profile overview | Supported | Working |
| Acceptance/submission row columns | Yes | No | No list aggregate projection | Zero-like absent data | Disabled by design |
| Row favorite state | Yes | No | No batch state projection | Decorative star | Disabled by design |
| Time/memory/acceptance/unpassed filters | Yes | No | No canonical contract | Inert enabled controls | Disabled by design |
| Row navigation | Yes | Yes | Problem detail route/API | Supported | Working |
| View glyphs/category “other”/quote | Yes | No | N/A | Decorative | Decorative |

Facet semantics are explicit: every active server predicate (search, difficulty, tag, source, visibility, and status) applies to every facet. Counts are never computed from the page in the browser.

## 4. Missing Backend Logic Found

1. Difficulty, tag, and source had previously been filtered only in the browser/current page.
2. Sidebar/tag counts were not authoritative facets.
3. The sort control had no URL, request, validation, or database behavior.
4. Time, memory, and acceptance selects were enabled without a backend contract.
5. Missing list statistics displayed as zero-like values; the favorite cell could imply persistence.

## 5. Implemented Backend APIs

`GET /api/problems` remains response-compatible and adds:

```json
{
  "facets": {
    "difficulty": { "中等": 12 },
    "sourceType": { "EXTERNAL": 8 },
    "tags": [{ "id": 24, "count": 5 }]
  }
}
```

It accepts existing `search`, `difficulty`, `tagIds`, and `sourceType`, plus whitelisted `sort` (`publicNumber`, `title`, `difficulty`, `updatedAt`, `createdAt`) and `order` (`asc`, `desc`). Invalid sort/order return the standard `400 VALIDATION_ERROR`.

## 6. Frontend Integration

The typed client uses explicit search submission: typing does not request data;
Enter or the filter submit action writes the query to the URL and fetches. It
also resets page on state changes, restores browser history, and receives facets
in the same list response. There is no all-problem browser fetch or per-row HTTP
request.

## 7. Filters

Search, difficulty, tag, and source use AND semantics in the repository. Filtered total and pagination share the same predicate. Unsupported time/memory/acceptance/unpassed filters are disabled.

## 8. Sorting

Sorting is server-side and deterministic, with an `id` tiebreaker. The database column/expression and direction are selected only from a fixed whitelist.

## 9. Facets / Statistics

PostgreSQL aggregates difficulty, source type, and tag facets using the active list predicate. Acceptance rate and submission count show `—` because no stable list aggregate is exposed; no analytics subsystem was invented.

## 10. Personal Problem State

Existing profile overview/favorite APIs remain the source for sidebar summaries. The Library does not claim batch favorite state, recent views, a practice queue, or unpassed state because their explicit contracts are absent. The row favorite cell is non-interactive and labelled unavailable.

## 11. Buttons / Interactions

Every active Library control updates URL-backed state, fetches, navigates, focuses search, clears, or retries. Unsupported controls are disabled. Static scope audit found no empty click handler, `href="#"`, fake request, or frontend-only business persistence.

## 12. Pagination / URL State

Pagination preserves all filters/sorting. Filter and sort changes reset page to one; existing out-of-range correction remains intact.

## 13. Auth / Security

List and facets share the existing public-only or owned-or-public predicate. No Judge boundary, credentials, user-code execution, mutation API, or personal data store changed.

## 14. DB / Migration

No migration was needed; existing Problems, Tags, and Problem Tags tables are used. `REAL DB MIGRATION = NOT REQUIRED`. PostgreSQL list/facet execution against a live runtime database was not run: `POSTGRESQL RUNTIME VERIFICATION = NOT VERIFIED`.

## 15. Tests

Passed in this worktree:

- `pnpm vitest run tests/problem.test.ts tests/problem-library-server-filter.test.ts tests/problem-library-server-filter-web.test.tsx tests/product-web-r2.test.tsx` — 19/19.
- `pnpm typecheck`.
- Changed-file ESLint.
- `pnpm build:api` and `pnpm build:web`.
- `git diff --check`.

Coverage includes filters/totals/pagination, valid and invalid sort/order, sort before pagination, facets, URL restoration, server-sort request, and disabled unsupported selectors.

## 16. Final Problem Library Control Matrix

| UI Element | Visible | Enabled | Backend API | Real Data | Persistent | Automated Test | Final Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Search/filter/tag/source | Yes | Yes | `/api/problems`, `/api/tags` | Yes | URL | Yes | WORKING |
| Sort | Yes | Yes | `/api/problems?sort=&order=` | Yes | URL | Yes | WORKING |
| Facets | Yes | Yes/display | List `facets` | Yes | N/A | Yes | WORKING |
| Pagination | Yes | Boundary-aware | `offset`/`limit` | Yes | URL | Yes | WORKING |
| Reset/chips/retry | Yes | Contextual | List API | Yes | URL | Yes | WORKING |
| Row/detail navigation | Yes | Yes | Detail route/API | Yes | N/A | Existing | WORKING |
| Profile summary | Yes | Display | Profile overview | Yes | Server | Existing | WORKING |
| Acceptance/submission columns | Yes | No | None | No fake data | N/A | Static audit | DISABLED BY DESIGN |
| Row favorite state | Yes | No | No batch projection | No fake data | N/A | Static audit | DISABLED BY DESIGN |
| Time/memory/acceptance/unpassed | Yes | No | None | No fake data | N/A | Yes | DISABLED BY DESIGN |
| Visual glyphs/quote | Yes | No | N/A | N/A | N/A | Static audit | DECORATIVE |

`BROKEN = 0`.

## 17. Deferred-but-not-fake Features

- Per-problem acceptance statistics need a stable aggregate/read model.
- List favorite state needs an explicit Profile-to-Problem batch projection.
- Recent views, practice queue, and unpassed filtering need bounded persistence contracts.

## 18. Remaining Debt

FOLLOW-UP: qualify PostgreSQL facet/sort queries against an isolated current-state Product PostgreSQL fixture. The pre-existing historical `0020 judge_artifacts` replay issue was not touched.

## 19. Git

Canonical main is unchanged. `MAIN MERGE = NOT PERFORMED`.

## 20. Final Verdict

```text
UI AUDIT = PASS
ACTIVE BUTTONS FUNCTIONAL = PASS
BACKEND SUPPORT FOR ACTIVE UI = PASS (automated contract scope)
FILTERING = PASS
SORTING = PASS
FACET DATA = PASS
PERSONAL STATE = PASS (existing projections) / DEFERRED (unmodelled states)
PAGINATION = PASS
URL STATE = PASS
AUTH/VISIBILITY = PASS (existing predicate preserved)
NO FAKE BUSINESS DATA = PASS
BROKEN INTERACTIVE CONTROLS = 0
AUTOMATED TESTS = PASS
REAL DB = NOT REQUIRED
POSTGRESQL RUNTIME VERIFICATION = NOT VERIFIED
REAL API = PASS (Fastify API-level contracts)
RUNTIME = NOT VERIFIED
MANUAL UI ACCEPTANCE = PENDING USER
MAIN MERGE = NOT PERFORMED
```
