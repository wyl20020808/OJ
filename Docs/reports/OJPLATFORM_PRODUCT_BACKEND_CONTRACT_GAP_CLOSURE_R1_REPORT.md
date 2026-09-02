# OJPlatform Product Backend Contract Gap Closure R1 Report

## Final Status

`PASS`

The three Backend-owned Web/Backend contract gaps from the post-parallel
requalification are closed with focused automated and live runtime evidence.
No Web or Judge source was modified, `Docs/PROJECT_STATUS.md` was not updated,
and Lead Integration was not performed. This report does not claim production
readiness.

## Required Flags

`MALFORMED CONTEST ID = FIXED`

`MANAGER CANMANAGE CONTRACT = FIXED`

`CORS POLICY = FIXED`

`KNOWN WEB-BACKEND CONTRACT BLOCKERS = 0`

`READY FOR PRODUCT LEAD INTEGRATION = YES`

## Git and Scope

- Backend worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
- Baseline branch: `codex/product-backend-runtime-gap-closure-v1`
- Start HEAD: `3faec4de0449f453115f6258a017a615caf886de`
- Repair branch: `codex/product-backend-contract-gap-closure-r1`
- Final delivery HEAD: the commit containing this report; the concrete SHA is
  captured by the final Git audit and delivery response.
- Changed scope: API runtime configuration, CORS registration, Contest route
  validation/projection, focused tests, `.env.example`, and this report only.
- Compatibility impact: malformed Contest UUIDs now return the documented
  client validation error instead of an internal error; valid UUID and
  authorization behavior is preserved. Credentialed cross-origin access now
  requires an explicit trusted-origin allowlist.

## Implemented

### Malformed Contest ID

All Contest `:id` route paths now pass through one UUID boundary validator
before Contest SQL receives the identifier. A malformed value returns HTTP
`400` with `VALIDATION_ERROR` and no PostgreSQL detail. A syntactically valid
but absent UUID continues to return HTTP `404` with `CONTEST_NOT_FOUND`.

### Manager `canManage`

Contest detail authorization results now flow into the projection. Public
Contest list and home-summary queries project the same `OWNER`/`MANAGER` role
semantics used by mutation authorization. Authorized management mutations
also return `canManage=true`. Owner remains `true`; unrelated users and
anonymous callers remain `false`; unrelated mutation remains denied.

### CORS Policy

`OJPLATFORM_CORS_ORIGINS` is an explicit comma-separated allowlist of exact
origins. When configured, Fastify returns the matching origin and
`Access-Control-Allow-Credentials: true`. Wildcards, URL paths, and malformed
entries are rejected during configuration loading. An untrusted origin receives
no `Access-Control-Allow-Origin`; wildcard credentialed CORS is not used.

An empty allowlist intentionally keeps the API same-origin-only. The existing
Vite `/api` and `/ready` proxy remains supported because same-origin requests do
not require CORS. `.env.example` documents the canonical local Vite origin.

## Focused Runtime Evidence

Runtime topology: API `127.0.0.1:3010`, temporary Vite `127.0.0.1:5177`, real
PostgreSQL, Redis, and S3-compatible Storage.

| Check | Evidence | Result |
|---|---|---|
| API health | `GET /health` -> `200 {"status":"ok"}` | PASS |
| API readiness | `GET /ready` -> `200`; PostgreSQL, Redis, Storage all `ok` | PASS |
| Malformed Contest ID | `GET /api/contests/not-a-real-id` -> `400 VALIDATION_ERROR`; body contained no `22P02` | PASS |
| Valid absent Contest ID | `GET /api/contests/00000000-0000-4000-8000-000000000001` -> `404 CONTEST_NOT_FOUND` | PASS |
| Owner projection | Isolated three-account fixture returned `canManage=true` | PASS |
| Manager projection | Detail before and after mutation returned `canManage=true` | PASS |
| Manager mutation | Manager `PATCH /api/contests/:id` -> `200` | PASS |
| Unrelated projection | Authenticated unrelated user returned `canManage=false` | PASS |
| Anonymous projection | Anonymous published Contest detail returned `canManage=false` | PASS |
| Unrelated mutation | Unrelated user `PATCH /api/contests/:id` -> `403` | PASS |
| Trusted-origin CORS | Preflight from `http://127.0.0.1:5177` -> exact allow-origin and allow-credentials `true` | PASS |
| Untrusted-origin CORS | Preflight from `https://untrusted.example.test` -> no allow-origin | PASS |
| Same-origin proxy | Vite `GET /ready` -> `200` with all dependencies `ok` | PASS |

The isolated runtime fixture was removed: one Contest and all three temporary
users were deleted, with deletion counts `1` and `3` respectively.

## Tests and Gates

| Command | Result |
|---|---|
| `pnpm exec vitest run tests/api.test.ts tests/config.test.ts` | PASS: 2 files, 7 tests |
| `pnpm exec vitest run tests/contest-social-foundation.integration.test.ts` | PASS: 1 file, 3 tests against real PostgreSQL/Redis |
| `pnpm test` | PASS: 26 files passed, 1 skipped; 358 tests passed, 4 skipped |
| `pnpm integration` | PASS: 4 files, 7 tests |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm test:architecture` | PASS |
| `pnpm build` | PASS |
| `git diff --check` | PASS |

## Security Review

- Input validation: malformed Contest UUIDs fail before Contest repository/SQL
  access and cannot expose PostgreSQL error details.
- Authorization: owner and manager positive paths, unrelated negative path, and
  anonymous projection were tested. UI projection does not grant permission;
  server-side mutation authorization remains authoritative.
- CORS: credentialed access is restricted to exact configured origins. No
  wildcard origin is accepted, and untrusted origins receive no allow-origin.
- Sessions/cookies: authentication and cookie semantics were not changed.
- Secrets: no new secret or credential was added to tracked files.
- Architecture: no module boundary, migration, Web, Judge, or deployment change
  was introduced.

## BG-R1-01..20

| ID | Result | Evidence |
|---|---|---|
| BG-R1-01 | PASS | Baseline `3faec4de...` verified before edits |
| BG-R1-02 | PASS | Recommended repair branch used |
| BG-R1-03 | PASS | Shared UUID guard runs before Contest SQL |
| BG-R1-04 | PASS | Stable `400 VALIDATION_ERROR` runtime response |
| BG-R1-05 | PASS | Runtime response contains no `22P02`/DB detail |
| BG-R1-06 | PASS | Valid absent UUID remains `404 CONTEST_NOT_FOUND` |
| BG-R1-07 | PASS | Owner `canManage=true` |
| BG-R1-08 | PASS | Manager `canManage=true` |
| BG-R1-09 | PASS | Unrelated and anonymous `canManage=false` |
| BG-R1-10 | PASS | Manager mutation returned `200` |
| BG-R1-11 | PASS | Unrelated mutation returned `403` |
| BG-R1-12 | PASS | Explicit configured-origin CORS policy documented |
| BG-R1-13 | PASS | Trusted-origin credentialed preflight verified |
| BG-R1-14 | PASS | Untrusted origin received no allow-origin |
| BG-R1-15 | PASS | Vite same-origin `/ready` proxy returned `200` |
| BG-R1-16 | PASS | `/health` and `/ready` passed with dependencies `ok` |
| BG-R1-17 | PASS | Focused unit/integration tests passed |
| BG-R1-18 | PASS | All required full gates passed |
| BG-R1-19 | PASS | This permanent report exists |
| BG-R1-20 | PASS | Scoped commit and clean-worktree evidence recorded in final audit |

## Remaining Blockers

No known blocker remains for these three contracts. Product capability gaps
outside this Goal remain outside its conclusion. Product Lead Integration may
begin as a separate explicitly authorized task; it was not started here.
