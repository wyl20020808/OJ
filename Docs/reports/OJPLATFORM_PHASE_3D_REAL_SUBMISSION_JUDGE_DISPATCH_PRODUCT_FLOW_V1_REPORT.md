# OJPlatform Phase 3D Real Submission & Judge Dispatch Product Flow V1 Report

## Decision

**PARTIAL.** The Product implementation, immutable binding contract, migration,
focused tests, complete TypeScript tests, database integration, Web unit tests,
format, lint, typecheck, architecture, build, and diff gates pass. A real
Browser -> Product -> Judge Service -> Worker -> Supervisor -> Sandbox ->
Product projection verdict run was not executed in this Goal, so no AC/WA/CE/
RE/TLE/MLE Product E2E or viewport runtime claim is made.

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
- `pnpm test`: PASS, 730 passed / 5 opt-in skipped.
- `pnpm test:web`: PASS, 11 passed.
- `pnpm db:migrate`: PASS after adding `0015` to the explicit migration runner.
- `pnpm integration`: PASS, 9 passed against local PostgreSQL/Redis/MinIO.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test:architecture`, `pnpm build`, and `git diff --check`: PASS.
- WSL bounded readiness check: PASS (`Ubuntu-24.04`, Go and runc available).

## Not Verified

- Real Product Browser -> Judge Service -> Worker -> Supervisor -> Sandbox
  qualification for AC, WA, CE, RE, TLE, and MLE.
- Product browser Guest submission, desktop/tablet/mobile viewport checks, and
  direct-network/console inspection in this Goal environment.
- Real Product cancellation, rejudge, stale-generation, duplicate-dispatch,
  missing-object, hash-mismatch, and Judge Service outage runtime matrices.
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

`FEATURE RUNTIME QUALIFIED`: NO.

`PRODUCTION READY`: NO.

`GOAL STATUS`: **PARTIAL** pending real Product-to-Sandbox and Browser runtime
qualification.
