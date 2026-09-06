# OJPlatform Core Submission & Admin Source Repair V1

Date: 2026-09-06  
Branch: `codex/core-submission-admin-source-v1`  
Base main head: `6719304fb436e1699e8b4a64dc8e82b97828be45`

## Outcome

**PARTIAL**. All requested code paths are implemented and focused-tested. Full
repository tests and one database integration suite retain unrelated baseline
failures. Browser acceptance was explicitly out of scope and remains pending
user verification.

## Admin Source

Root cause: the canonical `submission:view:any` permission was projected only
for account responses, while the session-derived `AuthContext` used by
Submission authorization did not carry the capability. The Product composition
also did not pass that context field into the policy wrapper.

Real endpoints:

- `GET /api/submissions/:id` (source-bearing Submission detail)
- `GET /api/submissions/:id/evaluations/:generation` (Evaluation detail,
  authorized through the same Submission detail policy; response intentionally
  contains submission metadata, not source)

Implemented: Auth session context now projects `canViewAnySubmission` through
the configured permission resolver; both infrastructure and in-memory Product
composition pass it into `SubmissionAuthorizationPolicy`; backend policy allows
owner or explicit capability/permission and denies all others. Frontend already
gates the code tab on the source returned by the authorized detail response.

Validation: endpoint-level owner/admin/other/anonymous matrix passes. A real
`buildApp` test also registers and logs in users, verifies capability projection
from `/api/auth/me`, and reads another user's source through the Product
endpoint.

## JudgeData

Root cause: `createDraftFromLatestVersion()` copied the published version's
Problem revision/testdata identity. After Problem authoring created a new
revision, the newly published JudgeData version remained bound to the old
identity, so formal Submission binding could not find a version for the current
revision and returned `JUDGE_DATA_UNAVAILABLE`.

Implemented: cloning preserves immutable testcase object references and limits,
but resolves and binds the draft to the current Problem revision,
`testdataVersionId`, testcase set, and execution profile. Publish remains the
existing immutable-version path; Submission still binds only to a published
version and verifies its exact identity/manifest before dispatch. No draft or
large inline payload is used.

Validation covers draft cloning, current-revision rebinding, immutable history,
published-version selection, draft-only rejection, manifest integrity, and
100 MiB object-reference limits.

## Online Editor

Run path preserved as ad-hoc `HttpCodeRunAdapter`. Submit now uses the local
`ProductSubmissionAdapter`, which delegates directly to the formal Product
`api.createSubmission` service. It returns the formal Submission identity and
preserves `ApiError` business codes/messages instead of collapsing failures to
`服务暂时不可用`. Dedicated adapter tests pass.

## Validation Evidence

- IMPLEMENTED: source authorization, JudgeData lifecycle rebinding, Product
  Submit adapter, endpoint and lifecycle tests.
- TESTED: focused suite `32/32` after final edits; broader relevant suite
  `44/44`; architecture gate PASS; targeted ESLint PASS; Prettier check PASS;
  `git diff --check` PASS.
- TESTED: `pnpm typecheck` PASS; `pnpm build:web` PASS; `pnpm build:api` PASS.
- TESTED: database integration `submission-dispatch.test.ts` PASS.
- RUNTIME VERIFIED: no managed Product/Judge runtime or browser verification
  performed for this task.
- NOT VERIFIED: manual browser/UI acceptance (user-owned per task contract).
- BLOCKED/PARTIAL: full `pnpm test` has 7 pre-existing failures in foundation,
  profile, worker-ops UI, and phone-auth suites. Full `pnpm lint` has 9 existing
  errors in unrelated baseline files. Database
  `product-backend-runtime-composition.test.ts` retains an existing heatmap
  capability expectation failure.

## Scope

Problem Authoring layout, Team, Homework, Discussion, and main branch were not
changed. Main was not merged.

