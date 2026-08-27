# PHASE 1C Shared Contract: Submission Intake Foundation

This contract freezes the public boundary for the Phase 1C Submission Intake wave. It does not define execution, judging, sandboxing, verdicts, contests, or arbitrary code execution.

## Submission public model

A Submission has a stable `id`, `ownerUserId`, `problemId`, exact immutable `problemRevisionId`/version, immutable `testdataVersionRef`, `languageId`, immutable source snapshot metadata/content subject to size policy, `createdAt`, `updatedAt`, and intake-only `status` (`PENDING` or `QUEUED`). No verdict or execution result is represented.

The source is untrusted data. It is stored as an immutable snapshot and is never executed by API, Web, Core, or Plugin Host processes. Testdata is referenced by immutable version metadata only.

## Public API

The Submission module exposes `create`, `list`, and `detail` through the composed API. Create requires an authenticated owner and validates problem revision, testdata reference, language catalog entry, and source size. List is owner-scoped by default; detail is allowed only by `canViewSubmission`. No endpoint starts execution or fabricates a result.

## Authorization policy

The public policy boundary exposes `canSubmit(user, problemRevision)`, `canViewSubmission(user, submission)`, and `listOwnSubmissions(user)`. Submission code depends on this policy contract, never Auth/Authz internals. Audit events may identify actor and submission IDs but never source, credentials, hashes, or raw sessions.

## Language and source safety

The language catalog is static/configured metadata (`id`, display name, accepted source extensions/limits as applicable). It is not a plugin loader and performs no compilation or execution. Source size and content validation are explicit, bounded, and observable without logging source or credentials.

## Errors and pagination

Use the existing structured error envelope and request ID behavior. Validation errors are field-addressable; unauthenticated and forbidden requests preserve the established safe semantics. Lists use the existing opaque cursor/page-size contract and return stable ordering plus `nextCursor`; callers cannot request unbounded pages.

## Compatibility and ownership

Changes to this shared contract require a Lead Integration Request and decision. Lead owns API composition, central route registration, migration runner/registry, and cross-module adapters.

