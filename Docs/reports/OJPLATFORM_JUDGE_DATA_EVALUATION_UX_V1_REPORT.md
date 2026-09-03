# OJPlatform Judge Data / Evaluation UX V1

Status: PASS

BASE: 2e60b331e8d2f6e7b6bb6db75c0d693029c975f0

## Implemented

- Problem Editor Judge Data identifies the displayed collection as the current draft and renders testcase metadata in ordinal order. Existing pair and ZIP upload responses refresh the displayed draft immediately; replacement and deletion continue to use the server collection.
- Evaluation API client now sends composed verdict/status, problem, and submitter filters. Evaluation UI provides result selection, problem search input, submitter search input, clear action, and resets pagination when filters change.
- Existing API newest-first ordering and deterministic cursor pagination are reused unchanged (`created_at DESC, id DESC`). Verdict taxonomy remains unchanged.
- Judge Data authorization paths are unchanged; metadata-only public references remain in use.

## Evidence

- IMPLEMENTED: Web/API changes in `apps/web/src/app/App.tsx`, `apps/web/src/app/app.css`, `apps/web/src/components/ProblemEditor.tsx`, and `apps/web/src/services/api.ts`.
- TESTED: `pnpm exec vitest run tests/problem-editor.test.tsx tests/product-access-evaluation-v1.test.ts tests/web-ui-polish.test.tsx` (3 files, 24 tests passed).
- TYPECHECK: `pnpm exec tsc -p tsconfig.json --noEmit` passed.
- DIFF CHECK: `git diff --check` passed.
- BROWSER SMOKE: NOT VERIFIED (not run).

## Scope

No Judge verdict semantics, Sandbox, Worker, Runtime, storage model, or database migration changes.
