# OJPlatform Web UI Polish and Evaluation List V1

## Result

`OJPLATFORM-WEB-UI-POLISH-EVALUATION-LIST-V1 = PARTIAL`

The bounded Web/UI changes are implemented and automated checks pass. The
requested global evaluation list is not implementable within the existing
Product contract: `GET /api/submissions` is owner-scoped and returns no safe
submitter projection or server-side descending-time ordering. No Backend,
contract, or authorization change was made.

## Scope

- Put problem actions directly under the detail title, including an owner-only
  canonical editor link.
- Retire the duplicate Web-only "我的题目" dashboard/profile view and move the
  existing creation flow to the problem-library filter surface.
- Rename the Web product term "提交记录" to "评测列表" and present the existing
  owner-scoped records in a compact evaluation table.
- Simplify statement editing by removing its refresh and problem-publication
  controls while preserving save feedback, unsaved-change protection, and all
  Judge Data validation/publication controls.

## Implemented

- Problem Detail now presents `提交代码`, conditional `编辑题目`, and `收藏`
  below the problem name. Owner identity from the existing Problem and session
  projections includes Guest owners; the Product Backend remains the mutation
  authority.
- `/author` and the profile "我的题目" UI were retired. The canonical
  `/author/problems/new` and `/author/problems/:id/edit` flows remain.
- Authenticated users, including Guests, get the existing create flow from the
  problem-library filter panel.
- Navigation, breadcrumb, page, empty, loading, and back-link terminology now
  use "评测列表". Rows use only the existing owner-scoped submission fields and
  link to the existing submission-detail route; no source is displayed in the
  list.
- Statement save still calls the existing typed Product client, keeps unload
  protection, and shows success/error feedback. Judge Data `校验草稿` and
  `发布新数据版本` remain available.

## Product Backend Gap

`GLOBAL EVALUATION LIST BACKEND SUPPORT = NOT AVAILABLE`

- `/api/submissions` requires authentication, applies the current user as
  `ownerUserId`, and is ascending by `created_at, id` in the existing Product
  repository.
- It provides no global-list capability, safe submitter projection, or
  server-side descending-time ordering. The Web does not synthesize these
  fields, infer access from roles, or expand source visibility.
- The Problem detail DTO also has no explicit non-owner `canEdit` capability
  projection. The Web shows the editor entry for the existing owner identity
  projection, including Guest owners; privileged non-owner discoverability
  requires a future additive Product capability projection.

## Validation

- `IMPLEMENTED`: focused UI tests cover owner/Guest editor visibility,
  non-owner hiding, action placement, library creation entry, evaluation row
  detail navigation without source display, statement save, and retained Judge
  Data publication.
- `TESTED`: `pnpm test:web` passed (11 tests).
- `TESTED`: focused Web suite passed (252 tests).
- `TESTED`: `pnpm test` passed (752 tests, 5 skipped).
- `TESTED`: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and
  `git diff --check` passed.
- `RUNTIME VERIFIED`: the isolated Product API/browser E2E passed at
  1440x900, 1024x768, and 390x844. A Guest created a public problem; the
  responsive title actions and owner editor entry, simplified statement editor,
  retained Judge Data controls, library create entry, and evaluation list were
  exercised without horizontal overflow or unexpected page/console errors.
  Expected unauthenticated transport noise (`401`/`404`, including the existing
  favicon miss) was excluded by the runtime assertion.
- `PRODUCTION QUALIFIED`: not claimed.

## Architecture and Security

- No Product Backend, Judge, Worker, Sandbox, database migration, API
  contract, or authentication implementation changed.
- Detail and source visibility remain enforced by existing Backend routes.
- No role names or elevated client-side authorization logic were added.

## Final Git Status

The scoped Web/UI changes are committed after the final quality checks.
Existing unrelated untracked files remain protected and outside this Goal's
commit.
