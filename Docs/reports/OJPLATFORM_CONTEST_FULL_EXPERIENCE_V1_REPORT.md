# Contest Full Experience V1 Report

## Live Baseline

- Goal branch: `codex/contest-full-experience-v1`
- Isolated worktree: `D:\OJPlatform-worktrees\contest-full-experience-v1`
- Starting main commit: `21d624834bf54eb6110491c985db459659a833e3`
- The canonical `D:\OJPlatform` checkout, its dirty files, stashes, and other worktrees were preserved.
- No merge to `main` was performed.

## Existing Contest Architecture

The Contest API is owned by `apps/api/src/modules/contest/index.ts` and currently performs its PostgreSQL projections directly through the shared database client. There is no separate Contest repository/service layer in the current architecture. The Web route is owned by the Contest feature and consumes public contracts through `apps/web/src/services/api.ts`.

Contest lifecycle remains authoritative in PostgreSQL. Public display status is derived from `lifecycle = PUBLISHED`, `starts_at`, and `ends_at`; the client does not invent running, upcoming, or finished state. Judge execution boundaries, submission processing, and standings scoring were not changed.

## API Contract

The public Contest projections now expose the fields required by the experience:

- organizer identity
- active participant count
- related problem count
- viewer registration state and `canRegister`
- authoritative lifecycle-derived status and times

`GET /api/contests/home-summary` independently queries and returns:

- 3 running contests
- 6 upcoming contests
- 15 recently finished contests

Contest list, detail, create, update, publish, and cancel responses reuse the enriched projection. Guest registration checks return the explicit `NOT_AUTHENTICATED` state instead of generating expected 401 request noise on the public page.

## Database Model

Existing relations remain the business source of truth:

- `contests`
- `contest_problems`
- `contest_registrations`
- existing users and public development-fixture problems

Migration `0036_contest_development_provenance` adds only a nullable `jsonb` provenance field and a partial index for development-fixture cleanup. Formal contest, problem, registration, and user relations are retained; no production path auto-seeds data.

## Development Fixture Design

`scripts/seed-contest-development-fixtures.mjs` is explicit, deterministic, and fail-closed:

- requires `OJPLATFORM_DEVELOPMENT_FIXTURES=true`
- accepts only a localhost PostgreSQL connection
- uses fixed UUIDs, emails, labels, contest ordinals, relations, and scores
- updates only rows already carrying the exact fixture provenance
- fails on identity collisions with non-fixture rows
- is idempotent
- cleanup targets only the exact provenance and fixture identities
- cleanup refuses to remove fixture users that acquired unrelated foreign-key data

Commands:

- `pnpm seed:contest-development`
- `pnpm cleanup:contest-development`

## Contest Dataset

The development dataset contains 24 contests, 8 organizer users, and 320 participant accounts. Each contest references 4 to 8 existing public development-fixture problems. Displayed participant counts range from 82 to 312 and are calculated from active `contest_registrations`, not stored decorative values.

## Running Contests

Three published contests have `starts_at <= now < ends_at`. The summary returns exactly three running cards with distinct title, description, organizer, timing, participant count, and problem count.

## Upcoming Contests

Six published contests have future start times. The summary returns exactly six upcoming cards ordered by start time. Registration availability and viewer registration state are server-derived.

## Finished Contests

Fifteen published contests have elapsed end times. The summary returns exactly fifteen recent finished cards ordered by end time.

## Contest Problems

Each seeded contest owns deterministic `contest_problems` rows with stable ordering, score allocation, and labels. Real detail verification returned 7 problems for the sampled running contest, 6 for the sampled upcoming contest, and 8 for the sampled finished contest.

## Registrations / Participant Counts

Participant counts are `COUNT(*)` projections over active registration rows. Register and unregister flows continue to use the existing Contest endpoints, and detail state refreshes the displayed count and registration state. A public guest sees `NOT_AUTHENTICATED`; authenticated authorization behavior was not weakened.

## Standings

`STANDINGS = NOT AVAILABLE`.

The existing endpoint honestly returns HTTP 503 with `SCORING_ENGINE_NOT_INTEGRATED`. No fake ranking, fabricated scoring, or silent fallback was introduced.

## Frontend Synchronization

The Contest landing page now consumes `GET /api/contests/home-summary` rather than mixing a generic list response with static showcase records. Running, upcoming, and finished sections render only API fields. Cards and detail views use real organizer, participant, problem, format, description, registration, status, and timing data.

Loading, retryable error, and empty states remain explicit. Search and display filters operate over the server-returned collection; they do not manufacture business records or counts.

## UI Minor Fixes

- removed fixed 2024 calendar/recent-contest content
- removed hardcoded showcase descriptions, sources, participants, and problem counts
- aligned card metadata and badges across status groups
- contained long content and preserved feature-local styling
- kept desktop side content in the page flow and moved it below cards at narrower widths
- verified one-column mobile layout without horizontal overflow

## PostgreSQL Verification

Real local PostgreSQL verification passed:

- targeted migration `0036_contest_development_provenance`: PASS
- guard rejection without opt-in: PASS
- first seed: PASS
- distribution: running 3, upcoming 6, finished 15
- relation ranges: problems 4-8, participants 82-312
- repeated seed/idempotency: PASS
- scoped cleanup: PASS
- preservation of a non-fixture row: PASS
- final reseed for browser verification: PASS

The full historical migration replay remains blocked by the pre-existing non-idempotent `0020` path (`relation "judge_artifacts" already exists`). The new migration itself applied successfully through the targeted migration runner.

## Real API Verification

The current branch API was served on isolated port 3011 against the local PostgreSQL database. Results:

- home summary: HTTP 200; returned groups 3 / 6 / 15
- sampled running detail: HTTP 200; 216 participants, 7 problems, organizer present
- sampled upcoming detail: HTTP 200; 196 participants, 6 problems, organizer present
- sampled finished detail: HTTP 200; 268 participants, 8 problems, organizer present
- all three sampled problem collections: HTTP 200 and count matched the detail projection
- guest registration state: HTTP 200, `NOT_AUTHENTICATED`
- standings: HTTP 503, explicit unavailable reason

The database also contained one older Home development fixture in the broader generic list, so the unrestricted list reported seven upcoming contests. The dedicated summary correctly enforced the required six-item upcoming group without deleting or overwriting that unrelated fixture.

## Browser Verification

Real Chrome Playwright E2E passed against the isolated current-branch Web/API runtime:

- live summary API response observed by the browser
- running, upcoming, and finished sections rendered from API data
- actual participant/problem counts rendered
- running, upcoming, and finished cards navigated to their real detail routes
- sampled detail showed matching counts and loaded seven real related problems
- no horizontal overflow at any validated viewport

The preferred Codex in-app browser was attempted first, but its control bridge returned `nodeRepl.fetch request failed` after reset and retry. No desktop automation was used. Chrome E2E provided the completed browser qualification.

The managed shared runtime could not safely switch to this checkout because Runtime Manager reported `RUNNING_VERSION_MISMATCH_ACTIVE_JOBS_UNKNOWN`; its controlled stop also refused because Judge active-job state was unknown. Per the runtime safety boundary, no listed process was manually killed. The existing shared runtime was left untouched, and isolated ports 3011/5174 were used and stopped after qualification.

## Responsive Validation

Chrome screenshots and DOM geometry were inspected at:

- desktop: 1440 x 1000
- tablet: 768 x 1024
- mobile: 390 x 844

Desktop used the intended card grid and side rail, tablet reduced the card columns and moved auxiliary content into normal flow, and mobile used a single contained column. All three passed the explicit horizontal-overflow assertion.

## Tests

- Contest feature and Web runtime regressions: PASS, 15/15
- Contest PostgreSQL integration and development fixture integration: PASS, 5/5
- Real-runtime Contest Chrome E2E: PASS, 1/1
- changed-file ESLint: PASS
- targeted formatting: PASS
- diff whitespace check: PASS

## Build

- root TypeScript typecheck: PASS
- API build: PASS
- Web build: PASS
- Web build emitted only the existing bundle-size advisory

## Files Changed

- Contest API projection and summary query in `apps/api/src/modules/contest/index.ts`
- Contest landing/detail synchronization in `apps/web/src/app/App.tsx`, `PortalExperience.tsx`, Contest feature files, and Web contracts
- migration `0036_contest_development_provenance`
- guarded fixture seed/cleanup script and package commands
- focused API, PostgreSQL, Web, fixture, and real-browser tests
- Contest-specific Playwright configuration
- this report and `Docs/PROJECT_STATUS.md`

## Commits

- `a359d40 feat: synchronize contest experience with backend data`
- `3e2d524 test: qualify contest experience in real browser`
- final documentation commit records this report and project status

`CONTEST FULL EXPERIENCE = PASS`

`BACKEND DATA SYNC = PASS`

`DEVELOPMENT FIXTURE = PASS`

`REAL DB VERIFIED = YES`

`REAL API VERIFIED = YES`

`BROWSER VERIFIED = YES`

`TYPECHECK = PASS`

`API BUILD = PASS`

`WEB BUILD = PASS`

`STANDINGS = NOT AVAILABLE`

`NO PRODUCTION POLLUTION = PASS`

`MANUAL UI ACCEPTANCE = PENDING USER`

`MAIN MERGE = NOT PERFORMED`
