# OJPLATFORM Product Access & Evaluation V1 Report

Status: PASS

## Implemented

- Problem responses expose the server-derived `capabilities.canEdit` value.
- Owner and Guest-owner edits remain allowed. Password-authenticated holders
  of `problem.edit` can edit any problem through the existing capability
  resolver; ordinary non-owners remain denied.
- Added authenticated `GET /api/evaluations` with descending
  `created_at, id` keyset pagination, bounded filters, safe problem/submitter
  projections, language, status/verdict, timestamps, and available aggregate
  time/memory.
- The global list never emits source. Source detail stays owner-only unless
  the caller holds `submission:view:any` through canonical authorization.
- Web `评测列表` calls the global API and links each row to submission detail.
- Added the three required permanent Product contracts.

## Tested

- Focused Product/authz/Web suite: 15 passing tests, including privileged
  edit, Guest owner edit capability, non-owner denial, global ordering/cursor,
  filters, source-free list DTO, and source visibility.
- `pnpm test`: 48 passing files, 754 passing tests, 1 pre-existing skipped
  file and 5 skipped tests.
- `pnpm test:web`: 11 passing tests.
- `pnpm integration`: 4 passing files and 9 passing tests against a dedicated
  Product DB, Redis instance, and MinIO bucket.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm test:architecture`, `pnpm build`, and `git diff --check`.

## Runtime Evidence

No browser E2E was started. The integration suite used a dedicated Product DB,
Redis instance, and MinIO bucket; the temporary DB and Redis container were
removed after the run. Browser runtime evidence is NOT VERIFIED.

## Scope

No Judge Service, Host Agent, Worker, Supervisor, Sandbox, or autoscaler files
were modified.
