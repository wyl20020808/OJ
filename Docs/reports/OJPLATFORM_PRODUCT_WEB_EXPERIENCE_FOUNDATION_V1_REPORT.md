# OJPlatform Product Web Experience Foundation V1

Status: PARTIAL (Web-owned scope implemented and tested; dependency-backed runtime qualification is blocked by the local infrastructure port mapping).

## Provenance

- Goal: `OJPLATFORM-PRODUCT-WEB-EXPERIENCE-FOUNDATION-V1`
- Starting head: `63cd1f9d8b8ff16191b6d7e1623839dc8de79850`
- Branch: `codex/product-web-experience-v1`
- Worktree: `D:\OJPlatform-worktrees\phase1b-web-authoring`
- Approved baseline: `63cd1f9d8b8ff16191b6d7e1623839dc8de79850`
- Final head: recorded by the commit listed in `Commits` and verified after commit

## Scope Delivered

### Pages and navigation

- Global shell with active route, logged-out actions, signed-in profile shortcut, settings link, authoring entry, and mobile navigation toggle.
- Home/dashboard with honest loading, empty, unavailable, and authenticated contexts; no invented counts, rankings, or verdicts.
- Problem list and detail with search, pagination, metadata, revision/testdata traceability, examples, constraints, submit action, and unavailable/forbidden handling.
- Submission editor, validation, source preservation, request error handling, history, detail, and authoritative lifecycle presentation.
- Profile and account/security settings. Account and sessions use real API adapters; unsupported profile editing and password changes are explicitly unavailable.
- Authoring dashboard/editor with metadata and statement editing, validation, save state, preview, draft/published/archived state, revision metadata where available, unsaved-change protection, and archive confirmation.

### Components created/reworked

- Created `apps/web/src/components/AccountSettings.tsx`.
- Reworked `apps/web/src/app/App.tsx` for routes, shell/navigation, settings, authoring safeguards, and state handling.
- Reworked `apps/web/src/app/app.css` for shared surfaces, controls, responsive layout, settings, sessions, and mobile navigation.
- Extended `apps/web/src/services/api.ts` with account/session contracts and session revocation adapters.
- Added `tests/product-web-experience.test.tsx` covering `WEB-PROD-01` through `WEB-PROD-30`.

## Design System

Existing Web design tokens and shared patterns are used consistently for typography, spacing, surfaces, buttons, inputs, selects, textareas, badges, tables, code/editor containers, alerts, loading, empty, error, forbidden, and degraded states. No new dependency was added.

## Navigation

Desktop navigation exposes Home, Problems, authentication actions, and signed-in settings/profile context. Authoring is shown only in the authenticated/authorized context. Contest and unsupported operations are not presented as completed features. Mobile navigation is a keyboard-accessible button with `aria-expanded` and a collapsible menu.

## Responsive

- Browser-reviewed at 1440px and 390px.
- 1440px: hero, workspace panel, navigation, and problem state maintain hierarchy without horizontal overflow.
- 390px: content stacks, buttons remain usable, navigation expands/collapses, and measured `scrollWidth` equals the viewport client width (375 CSS px in the browser's mobile layout).

## Accessibility

Semantic headings, labels, links, buttons, form error text, focusable controls, visible focus treatment, and keyboard navigation are covered by the product tests and browser smoke. The mobile menu uses a real button rather than a clickable container.

## Visual Review

Runtime browser review was performed against `http://127.0.0.1:5175/` with console inspection. Logged-out home, degraded readiness, navigation, desktop layout, and mobile menu were inspected. Browser console had no warning/error entries. The API health endpoint returned 200; readiness correctly rendered unavailable because dependency connections were refused. No fake healthy state was introduced.

## WEB-PROD Matrix

| ID | Result | Evidence |
| --- | --- | --- |
| WEB-PROD-01 | IMPLEMENTED / TESTED | Product test: desktop nav |
| WEB-PROD-02 | IMPLEMENTED / TESTED / RUNTIME VERIFIED | Product test and 390px browser menu toggle |
| WEB-PROD-03 | IMPLEMENTED / TESTED / RUNTIME VERIFIED | Logged-out shell test and browser review |
| WEB-PROD-04 | IMPLEMENTED / TESTED | Authenticated shell fixture |
| WEB-PROD-05 | IMPLEMENTED / TESTED / RUNTIME VERIFIED | Home state tests and degraded browser state |
| WEB-PROD-06 | IMPLEMENTED / TESTED | Problem list normal fixture |
| WEB-PROD-07 | IMPLEMENTED / TESTED | Empty/error problem list fixtures |
| WEB-PROD-08 | IMPLEMENTED / TESTED | Problem detail fixture |
| WEB-PROD-09 | IMPLEMENTED / TESTED | Draft/authorization honesty fixture |
| WEB-PROD-10 | IMPLEMENTED / TESTED | Editor validation fixture |
| WEB-PROD-11 | IMPLEMENTED / TESTED | Submit loading/error fixture |
| WEB-PROD-12 | IMPLEMENTED / TESTED | Submission history fixture |
| WEB-PROD-13 | IMPLEMENTED / TESTED | Lifecycle detail fixture |
| WEB-PROD-14 | IMPLEMENTED / TESTED | No fake verdict assertions |
| WEB-PROD-15 | IMPLEMENTED / TESTED | Profile fixture |
| WEB-PROD-16 | IMPLEMENTED / TESTED | Settings/session fixture |
| WEB-PROD-17 | IMPLEMENTED / TESTED | Missing account backend honesty fixture |
| WEB-PROD-18 | IMPLEMENTED / TESTED | Authoring editor fixture |
| WEB-PROD-19 | IMPLEMENTED / TESTED | Real `beforeunload` dirty-state test |
| WEB-PROD-20 | IMPLEMENTED / TESTED | Forbidden authoring fixture |
| WEB-PROD-21 | IMPLEMENTED / TESTED | Loading state assertions |
| WEB-PROD-22 | IMPLEMENTED / TESTED | Empty state assertions |
| WEB-PROD-23 | IMPLEMENTED / TESTED | Error state assertions |
| WEB-PROD-24 | IMPLEMENTED / TESTED | Keyboard smoke assertions |
| WEB-PROD-25 | IMPLEMENTED / RUNTIME VERIFIED | 1440px browser review, no overflow |
| WEB-PROD-26 | IMPLEMENTED / RUNTIME VERIFIED | 390px browser review, no overflow |
| WEB-PROD-27 | RUNTIME VERIFIED | Browser console clean |
| WEB-PROD-28 | TESTED | Full Vitest regression |
| WEB-PROD-29 | TESTED | Architecture gate and changed-file audit |
| WEB-PROD-30 | IMPLEMENTED / TESTED | Integration requests and report |

## Tests and Runtime Evidence

- `pnpm exec vitest run tests/product-web-experience.test.tsx`: **30 passed**.
- `pnpm test`: **352 passed, 4 skipped** across 22 passed files and 1 skipped file.
- `pnpm typecheck`: **PASS**.
- `pnpm lint`: **PASS**.
- `pnpm format:check`: **PASS**.
- `pnpm test:architecture`: **PASS**.
- `pnpm build`: **PASS**.
- `git diff --check`: **PASS** before commit.
- `pnpm test:e2e`: **1 passed, 4 failed, 13 skipped**. The failures are dependency-backed real-runtime journeys; API logs show `ECONNREFUSED` to local Postgres `127.0.0.1:55432` and Redis `127.0.0.1:56379`, so this is **BLOCKED / NOT VERIFIED**, not a Web regression claim.

## Integration Requests

1. Auth Worker should expose and document persistent profile-edit and password-change endpoints if those capabilities are approved; the current UI intentionally reports them unavailable.
2. Local runtime orchestration must make the API process reach the declared Postgres, Redis, and storage host ports so real E2E journeys can be rerun. No Web fallback or fake success was added.
3. Lead Integration should connect the account/session adapters to the finalized Auth contract and preserve credential/cookie semantics.

## Files / Domains Not Touched

No changes were made to `Docs/PROJECT_STATUS.md`, Judge Worker, Sandbox, runc, queue, testcase execution contracts, compiler, cgroup, seccomp, Auth backend, Problem backend, or database migrations. Existing unrelated files were preserved.

## Commits and Git Status

- Commit: `feat: establish product web experience foundation` (final hash recorded after commit verification).
- Final tracked worktree status: clean after commit verification.
- No merge performed. Lead Integration was not started.

## Completion Classification

- Code exists: YES
- Feature implemented: YES for the Worker-owned Web scope
- Feature tested: YES for product and full Vitest/quality gates
- Feature runtime qualified: PARTIAL; browser UI is verified, dependency-backed E2E is blocked by local infrastructure connectivity
- Production ready: NOT CLAIMED

READY FOR LEAD INTEGRATION: YES for the completed Web-owned scope, with the integration requests and runtime blocker above.
