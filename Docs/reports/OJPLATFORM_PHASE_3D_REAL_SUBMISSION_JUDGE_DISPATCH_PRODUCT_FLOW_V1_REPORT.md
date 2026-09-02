# OJPlatform Phase 3D Real Submission & Judge Dispatch Product Flow V1 Report

## Decision

**PASS for the qualified local scope.** The Product implementation and
immutable binding contract are implemented and tested. Browser -> Product ->
Judge Service -> Worker -> Supervisor -> Sandbox -> Product projection has
qualified each supported terminal verdict, and the Product API rejudge path has
qualified a new immutable evaluation generation. All required final TypeScript
and Go gates pass.

## Baseline

- Exact Phase 3C baseline resolved from the Git graph:
  `65af6a0dbc3d3d262094192950b83caf3fc41078`
  (`feat: integrate problem judge data guest authoring`).
- Work branch: `codex/phase3d-real-submission-judge-dispatch-product-flow-v1`.
- The Phase 3A/3B/3C reports, 2C.4/2C.5/2C.6/2C.7A/2C.7B/2C.7B-R1Q reports,
  Product/Judge contracts, security requirements, threat model, trust
  boundaries, and review checklist were read before implementation.

## Implemented

- Added the formal `0015_submission_judge_data_binding` migration and runner
  registration. Submissions persist exact JudgeDataVersion ID/number/manifest
  hash, never a post-submit `latest` reference.
- Added the narrow Product-only `ProductJudgeDataSubmissionBridge`. It resolves
  an exact version ID, validates its identity, retrieves private objects through
  the existing Product storage adapter, verifies metadata/size/SHA-256 and the
  existing canonical 2C.4 manifest hash, then creates the existing 2C.4
  testcase manifest for Judge dispatch.
- Product dispatch uses the existing `JudgeServiceClient`, Product evaluation
  repository, Judge Service job protocol, and Worker/Supervisor manifest. No
  second Submission, evaluation, or testcase manifest truth model was added.
- The only Product submission language is the already-qualified
  `cpp20-gcc-13-v1` profile. Guest principal ownership remains server-bound and
  Guest submission creation receives a server-side per-principal limit.
- Product Web renders current evaluation generation/history, queues Product-only
  polling while nonterminal, displays AC/WA/CE/RE/TLE/MLE only when projected as
  authoritative verdicts, and keeps CANCELLED/INFRA_FAILED/NO_VERDICT distinct.

## Security Boundary

The Worker receives no Product PostgreSQL access, MinIO/S3 credential, signed
retrieval capability, or broad storage credential. Browser DTOs expose neither
hidden testcase bytes nor object keys, Judge tokens, leases, or storage
credentials. Missing objects, hash/size/manifest mismatches, invalid binding,
unsupported language, and unavailable retrieval fail closed before dispatch.
The authoritative 2C.6 publication path still rejects stale generations and
conflicting/duplicate publication; cancellation and infrastructure failures do
not become verdicts.

## Tested

- Focused `tests/submission.test.ts` and
  `tests/submission-judge-data-bridge.test.ts`: PASS (9 tests). This includes
  Guest ownership, exact binding, v1 survival after v2 becomes selectable,
  private object tamper failure, unsupported profile rejection, and manifest
  construction before dispatch.
- `pnpm test`: PASS, 733 passed / 5 opt-in skipped.
- `pnpm test:web`: PASS, 11 passed.
- `pnpm db:migrate`: PASS after adding `0015` to the explicit migration runner.
- `pnpm integration`: PASS, 9 passed against local PostgreSQL/Redis/MinIO.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, and `git diff --check`: PASS.
- WSL bounded readiness check: PASS (`Ubuntu-24.04`, Go and runc available).
- Final rerun after the current Phase 3D commits: `pnpm test` (733 passed / 5
  opt-in skipped), `pnpm test:web` (11 passed), `pnpm integration` (9 passed),
  `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, `git diff --check`, and `go test ./...`
  for both Judge Worker and Sandbox Supervisor: PASS.

## Runtime Evidence Added 2026-09-02

- **RUNTIME VERIFIED (all terminal verdicts):** Guest `F303E02B` submitted a
  fresh public deterministic A+B problem from the browser. Every case traversed
  Browser -> Product -> standalone Judge Service -> real Worker -> Supervisor
  -> Sandbox -> Product projection and appeared in the Product submission list
  with generation 1 and attempt 1:
  `94e7839a-57b9-450f-92c0-f92c4964dd2b` (`AC`),
  `0428e332-111b-43e7-a7c2-a9c535e97b15` (`WA`),
  `59efd7d9-ac37-400b-aaa7-330ca84ae51a` (`CE`),
  `49d931aa-606d-41ff-aa7e-20a8311a8117` (`RE`),
  `f97b4bd2-939f-4d46-9d36-5eb80b51838b` (`TLE`), and
  `5251f12c-f16c-4cdb-81ff-e4ffc1aaab7e` (`MLE`).
- **RUNTIME VERIFIED (execution facts):** the `RE` record shows exit code `7`
  for all three testcases. The `TLE` record shows 2000/2001 ms wall-limit facts
  without memory events. The `MLE` record shows 64 MiB peak memory and a
  memory-limit event for all three testcases. Each record was cleanly
  published by the Supervisor.
- **RUNTIME VERIFIED (Product rejudge):** fresh Guest submission
  `d2cf2bae-c513-459d-aa1c-f74b35dfa6e8` completed as `AC` in generation 1,
  then the authenticated Product rejudge API produced `AC` in generation 2.
  Its Product history retained generation 1 as noncurrent and generation 2 as
  current. This uses the same real Judge Service, Worker, Supervisor, and
  Sandbox path.
- **RUNTIME VERIFIED (responsive presentation):** the projected submission
  list was checked at 1440x900, 1024x768, and 390x844. The mobile navigation
  collapsed to its menu control, verdict rows and IDs wrapped within the
  viewport, and no browser console warnings or errors were observed.
- **IMPLEMENTED/TESTED:** publishing synchronizes the current immutable
  Problem revision's status and visibility; the submission page sends the
  resolved Product problem ID rather than its URL slug for Judge Data lookup.
- **TESTED (2C.6 lifecycle):** the real PostgreSQL integration suite covers
  cancellation with no verdict, stale old-generation rejection, and concurrent
  duplicate-rejudge serialization. Product has neither a submission-cancel
  route nor a browser cancellation/rejudge control, so no unsupported browser
  mutation is claimed.

## Not Verified

- A separate browser mutation matrix for cancellation, rejudge, stale result,
  duplicate dispatch, missing objects, hash mismatch, and Judge Service outage.
  The first three lifecycle semantics have automated real PostgreSQL evidence;
  the Product surface lacks the browser controls needed to extend that evidence
  as a browser journey.
- No production, HA, Host Agent, Elastic Pool, SPJ, interactive, subtasks,
  partial score, contest scoring, or multi-language readiness is claimed.

## Permanent Contracts

The Phase 3D contracts are recorded in:

- `Docs/parallel/SUBMISSION_JUDGE_DATA_BINDING_V1.md`
- `Docs/parallel/PRODUCT_JUDGE_DATA_RETRIEVAL_TRUST_BOUNDARY_V1.md`
- `Docs/parallel/PRODUCT_JUDGE_DISPATCH_CONTRACT_V1.md`
- `Docs/parallel/SUBMISSION_PRODUCT_JUDGE_STATE_MATRIX_V1.md`
- `Docs/parallel/SUBMISSION_REAL_VERDICT_E2E_MATRIX_V1.md`
- `Docs/parallel/SUBMISSION_SECURITY_ERROR_MATRIX_V1.md`

## Result

`CODE EXISTS`: YES.

`FEATURE IMPLEMENTED`: YES, for the Product binding and dispatch integration.

`FEATURE TESTED`: YES, for the listed automated and local infrastructure
evidence.

`FEATURE RUNTIME QUALIFIED`: YES, for the specified local Product-to-Sandbox
verdict, rejudge, and responsive-browser scope only.

`PRODUCTION READY`: NO.

`GOAL STATUS`: **PASS** for the qualified local scope.
