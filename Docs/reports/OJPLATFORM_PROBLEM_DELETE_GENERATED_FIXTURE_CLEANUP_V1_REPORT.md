# OJPlatform Problem Delete & Generated Fixture Cleanup V1

Date: 2026-09-06  
Base main head: `a53df7790b8268ab7dd47aaa1f1c754b383c53f0`  
Branch: `codex/problem-delete-foundation-v1`

## Result

**PARTIAL**. Delete foundation, read/write guards, provenance fields, maintenance dry-run contract, and Web danger-zone action are implemented. PostgreSQL cleanup was not executed because this worktree has no `DATABASE_URL`; no data mutation was attempted.

## Implemented

- Migration `0022_problem_delete_provenance`: `deleted_at`, `deleted_by`, `delete_reason`, structured `provenance`, active index, and test-fixture/API-automation source categories.
- Problem service/repositories use tombstones, conditional `updated_at` concurrency, idempotent repeated delete, and preserve revisions/references.
- Delete authorization is backend enforced through `problem:delete` for creator and `problem:delete:any` for other problems; anonymous/weak sessions are denied.
- Active list/search/profile/favorite/contest projections exclude tombstones. Normal detail and edit/transition paths return not found.
- New submission and JudgeData mutations reject deleted Problems; historical records remain stored/readable through their own paths.
- `DELETE /api/problems/:idOrSlug` requires CSRF, reason, and `expectedUpdatedAt` (also accepts `updatedAt`).
- Web Edit Problem includes a separate Danger Zone, ID/title confirmation, reason prompt, and navigation to `/problems` after success.
- `scripts/cleanup-generated-problems.mjs` uses exact allowlist `P0011`-`P0014`, prints preflight references, defaults to dry-run, and uses one transaction for apply.

## Evidence

- Focused tests: **54/54 passed** (`problem-delete-foundation`, Problem, API, authz, Submission, Submission detail, JudgeData, metadata, profile).
- Typecheck: **PASS**.
- Web build: **PASS**.
- API build: **PASS**.
- Targeted lint: **PASS for changed paths except one pre-existing `apps/api/src/app.ts` `no-explicit-any` finding at the existing code-run adapter**.
- Migration apply/rollback and database integration: **NOT VERIFIED** (`DATABASE_URL` unavailable).
- Cleanup dry-run: **BLOCKED/NOT EXECUTED** (`DB_UNAVAILABLE: DATABASE_URL is not configured`).
- Browser manual acceptance: **PENDING USER**.
- `git diff --check`: **PASS**.

## Cleanup gate

`P0011`-`P0014`: **NOT EXECUTED**.  
Unknown count before/after: **NOT VERIFIED**.  
Unknown rows touched: **0 by code path; DB verification pending**.  
Hard delete count: **0**.

No merge to `main`. User dirty files and untracked artifacts in canonical checkout were preserved.
