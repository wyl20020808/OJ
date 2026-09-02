# Phase 3A Problem Judge Data Configuration Backend V1 Report

## IMPLEMENTATION

Implemented Product-side config/draft/version metadata, private object-storage adapter, pair and bounded central-directory ZIP import, limits/checker validation, and Product API wiring. The immutable manifest hash is calculated by the shared 2C.4/2C.5 Judge runtime helper with testcase identity, input hash, expected-output hash and builtin checker configuration; Product defines no parallel truth model. Publish uses a PostgreSQL transaction, draft-row lock/CAS, immutable testcase copies and cleanup of now-frozen draft testcase rows. Migration `0014_problem_judge_data_integrity` makes version-object ownership `(version_id, object_id)`, allowing v2 to retain the same physical objects without weakening v1. Judge Service/Worker/Supervisor/Web, Submission flow, Lead Integration and PROJECT_STATUS were not modified.

## CONTRACT

Permanent model, web, storage/manifest, error and authorization contracts are in `Docs/parallel/PROBLEM_JUDGE_DATA_*_V1.md`. The handoff retains object references, hashes, sizes, testcase identity/order, checker and effective limits and is designed for the existing 2C.4 immutable boundary.

## REAL DB-STORAGE RUNTIME

RUNTIME VERIFIED against the local PostgreSQL and MinIO-compatible service. `pnpm db:migrate` passed, including migrations `0013` and `0014`. A disposable qualified problem was written through `PostgresJudgeDataRepository` and `S3ByteStorage`: pair upload, validate, publish v1, new draft, reuse the exact same input/output object references, validate, publish v2, assert zero retained draft testcase rows and four version-object associations, then remove all test rows and objects. A separate S3 put/head/hash/delete probe also passed. This is local development-runtime evidence only, not a production qualification.

## TEST EVIDENCE

Focused `tests/problem-judge-data.test.ts` (6 tests) and `tests/phase2c4-testcase-set.test.ts` (8 tests) pass together: draft/config, per-case effective limits and changed-default inheritance, publish immutability, v1-to-v2 retained object history, canonical shared manifest hash, handoff binding, stale publish conflict, authorization denial, exact CSRF cookie/header checks, storage-unavailable failure, ZIP valid import, traversal/absolute/missing-pair/duplicate/malformed rejection. `pnpm test` passes with 705 tests and 5 skips; `pnpm integration` passes with 9 tests. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:architecture`, `pnpm build`, `pnpm db:migrate`, and `git diff --check` pass.

## PRODUCT→JUDGE HANDOFF CONTRACT

HANDOFF CONTRACT QUALIFIED at the Product abstraction level. The immutable DTO contains problem/revision/testdata/testcase-set identity, manifest hash, testcase order and identity, private object references, content hashes, checker, effective limits and language/runtime compatibility. Published data does not require Judge access to Product PostgreSQL.

## REAL DATA TRANSFER

REAL TRANSFER NOT VERIFIED. Network/object retrieval wiring belongs to the later Lead Integration scope and is intentionally not implemented here.
