# Home Full Experience Completion Report

STATUS: PARTIAL

## Frontend Audit

| Module | Required data | Current source | Status |
| --- | --- | --- | --- |
| Hero and navigation | Product copy and routes | Static product copy and internal routes | STATIC |
| Announcements | Published announcement title, date, link | `GET /api/discussion/posts?limit=3&type=ANNOUNCEMENT` | FULLY_SUPPORTED |
| Recent competitions | Published public contest title, time, lifecycle, link | `GET /api/contests/home-summary` | FULLY_SUPPORTED |
| Daily problem | Public problem title, public ID, difficulty, tags, link | `GET /api/home` | FULLY_SUPPORTED |
| Recommended practice cards | Public problem title, difficulty, tag, link | Previously static card copy; now `GET /api/home` recent problems | FULLY_SUPPORTED |
| Learning calendar | Current month and current date | Browser date | STATIC |
| Learning progress | Per-user solved count and streak | Explicit `—`; no request is issued | MISSING_API |
| Homework and wrong-book | Per-user assignments, deadlines, verdict-derived review state | Explicit unavailable states | MISSING_API |
| Fortune | Deterministic entertainment copy using local non-sensitive seed | `homeContent.ts` | STATIC |
| Leaderboard, user statistics, articles, activity feed | No current Home card consumes these values | No API request | NOT_RENDERED |
| Images and icons | Banner graphics and decorative glyphs | Existing `apps/web/public/problem-library-banner.png`, CSS, Unicode glyphs | FULLY_SUPPORTED |

No Home image is missing. Existing banner assets resolve from the Web public directory. No external asset, dependency, or icon library was added.

## Missing Backend Support

No new backend route, service, repository, schema field, or relation is required by the data actually rendered on Home. The visible dynamic surfaces already use public, module-owned contracts:

- Problems: `GET /api/home`
- Announcements: `GET /api/discussion/posts?limit=3&type=ANNOUNCEMENT`
- Contest summary: `GET /api/contests/home-summary`

The audited gap was frontend-only: recommendation cards contained static product labels unrelated to repository data. They now render real Home problem projections, including their authoritative difficulty and first tag.

Unsupported personal statistics, homework, and wrong-book data remain explicit placeholders. This task does not broaden into those modules.

## APIs Added

None. Existing public API contracts already satisfy every currently rendered dynamic Home surface. The Home page continues to consume them through the typed Web API client.

## Database Changes

No formal migration or production schema change was made.

`scripts/seed-home-development-fixtures.mjs` writes only to existing Problem, Discussion, Contest, User, role, and tag relations. It creates revision records for seeded problems so their linked public detail pages retain normal revision references.

## Development Data Added

Added explicit, idempotent development fixture command:

```text
OJPLATFORM_DEVELOPMENT_FIXTURES=true DATABASE_URL=<local database> pnpm seed:home-development
```

Fixture set:

- 6 public practice problems across introductory through difficult levels
- 5 published announcements
- 1 running and 3 upcoming public contests

Fixture records declare `DEVELOPMENT FIXTURE / DEMO DATA`, use Problem `source_type=TEST_FIXTURE`, include provenance, and use the dedicated `ojplatform-home-demo` identity.

## Fixture Purpose

Fixtures exist only to populate Home during local development and visual review. The script rejects execution unless the explicit development flag is set and `DATABASE_URL` targets `127.0.0.1`, `localhost`, or `::1`. It is not part of migration history and is not called during normal API startup.

## Assets Added

None. Existing local public assets cover the Home hero and fortune-card backgrounds. No remote image dependency exists.

## Frontend Fixes

- Replaced four static recommendation category cards with repository-backed problem cards.
- Preserved existing Home layout, links, loading/error behavior, and empty state.
- Added focused UI coverage proving title, difficulty, and tag render from `GET /api/home` data and static category labels do not render.

## Tests

- `pnpm vitest run tests/home-full-experience.test.tsx tests/problem.test.ts` — PASS, 11/11
- `pnpm typecheck` — PASS
- `pnpm build:api` — PASS
- `pnpm build:web` — PASS; existing Vite large-chunk warning only
- `git diff --check` — PASS

## Runtime API Verification

Canonical Runtime Manager start was blocked before infrastructure startup because the configured OnlineCodeEditor plugin repository has no `main` worktree (`CANONICAL_PLUGIN_MAIN_NOT_FOUND`). The historical `pnpm db:migrate` runner also reproduces existing non-idempotent `0020_judge_artifacts` replay failure.

With user authorization, a disposable local `home_fixture` database was created, migrations applied by the manager's checksum ledger runner, fixtures seeded, and a local API process exercised. All returned HTTP 200 with populated payloads:

- `GET /api/home`: 6 public problems with difficulty, tags, revision IDs, and fixture provenance
- `GET /api/discussion/posts?limit=5&type=ANNOUNCEMENT`: 5 published announcements
- `GET /api/contests/home-summary`: 1 running and 3 upcoming contests

This verifies fixture data through the public API boundary, but does not qualify full managed runtime startup or replace user manual visual acceptance.

## Remaining Real Data Debt

- Per-user learning streak, solved totals, homework, and wrong-book data are not added; Home continues to disclose their unavailable state.
- Leaderboard, platform-user statistics, activity feed, and article-cover data are not rendered by current Home UI and no speculative API/schema was added.
- Full managed runtime remains blocked by existing plugin-main and historical migration-replay issues outside Home scope.

## Completion Matrix

```text
HOME COMPLETENESS = PARTIAL
BACKEND SUPPORT = PASS
DEVELOPMENT DATA = PASS
NO PRODUCTION DATA POLLUTION = PASS
TYPECHECK = PASS
BUILD = PASS
MANUAL UI ACCEPTANCE = PENDING USER
MAIN MERGE = NOT PERFORMED
```
