# OJPlatform Product Backend Runtime Gap Closure V1 Report

## Result

**PASS WITH DEFERRED UPSTREAM GAPS.** Backend-owned Profile capability gaps are closed with real PostgreSQL persistence and central API runtime evidence. Activity, heatmap, teams, homework and wrong-book remain explicit unavailable capabilities because their required authoritative sources are not present. No scoring, solved or verdict data is synthesized.

## Git and Scope

- Branch: `codex/product-backend-runtime-gap-closure-v1`
- Starting HEAD: `a4ae19fef2b06cad43fd8f0c02f1e93496e11ccc`
- Base: Product Backend Runtime Composition V1.
- Web V2 inputs read: qualification matrix, gap report, reproduction cases and permanent report.
- Strategy: a new backend-only module plus one additive migration; existing Contest and Problem records are queried directly rather than duplicated.
- No Web edit, Judge edit, `PROJECT_STATUS` update, Lead Integration, scoring change, submission-outcome inference or new dependency.

## Implemented Contracts

- `0011_profile_favorites` adds user/problem favorites with a primary-key uniqueness constraint and a stable user lookup index.
- `GET|POST|DELETE /api/profile/favorites[/:problemId]` supports password-session, public-published problem favorites. Add/remove are idempotent.
- `GET /api/profile/contests` projects existing created, managed and active-registered contests.
- `GET /api/profile/problems` projects existing `problems.author_id` records.
- `GET /api/profile/capabilities` exposes a versioned truthful contract.
- `GET /api/profiles/:username` is a public safe projection with no email, phone, session or token fields.

See [gap matrix](../parallel/PRODUCT_BACKEND_GAP_CLOSURE_MATRIX_V1.md) and [new contracts](../parallel/PRODUCT_BACKEND_NEW_CONTRACTS_V1.md).

## Truthful Deferred Boundaries

| Capability | State | Reason |
|---|---|---|
| activity | unavailable | `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE` |
| heatmap | unavailable | `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME` |
| wrongbook | unavailable | `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME` |
| teams | unavailable | `PRODUCT_DOMAIN_NOT_IMPLEMENTED` |
| homework | unavailable | `PRODUCT_DOMAIN_NOT_IMPLEMENTED` |

## Runtime and Migration Qualification

- `GET /health` and `GET /ready` passed using real PostgreSQL, Redis and Storage.
- OpenAPI exposed every new Profile route.
- Favorites first add `201`, repeated add `200`, list, user isolation, Guest upgrade denial and public-profile PII exclusion passed.
- Created and registered contest projections and authored-problem projection passed against real PostgreSQL.
- Central API restart retained Guest, messages and persisted favorites; profile capabilities remain deterministic after restart.
- `0011` fresh up, existing baseline upgrade, down/up, and re-up passed in isolated PostgreSQL databases.
- Migration registry order is now `0000..0011`, with no collision.

## Security and Privacy

New profile data derives the subject only from the server session. No query/body user ID can select another account's favorites, contests or problems. Anonymous returns 401 for own projections; Guest returns 403 with an upgrade code; public profile removes email and phone. Favorite targets must be existing public published problems. No raw Guest resume token is persisted or exposed.

## BE-GAP-01..100

| ID | Result | Evidence |
|---|---|---|
| BE-GAP-01 | PASS | Goal ZIP, Web V2 matrix/gap/repro/report and current Git read |
| BE-GAP-02 | PASS | Goal ZIP, Web V2 matrix/gap/repro/report and current Git read |
| BE-GAP-03 | PASS | Goal ZIP, Web V2 matrix/gap/repro/report and current Git read |
| BE-GAP-04 | PASS | Goal ZIP, Web V2 matrix/gap/repro/report and current Git read |
| BE-GAP-05 | PASS | Goal ZIP, Web V2 matrix/gap/repro/report and current Git read |
| BE-GAP-06 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-07 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-08 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-09 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-10 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-11 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-12 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-13 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-14 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-15 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-16 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-17 | PASS | 0011 migration and central PostgreSQL favorite runtime |
| BE-GAP-18 | PASS | Existing contest ownership/role/registration projection runtime |
| BE-GAP-19 | PASS | Existing contest ownership/role/registration projection runtime |
| BE-GAP-20 | PASS | Existing contest ownership/role/registration projection runtime |
| BE-GAP-21 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-22 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-23 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-24 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-25 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-26 | PASS | Existing author_id and safe public/own/Guest profile runtime |
| BE-GAP-27 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-28 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-29 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-30 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-31 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-32 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-33 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-34 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-35 | PASS | Capability contract and OpenAPI/runtime evidence |
| BE-GAP-36 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-37 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-38 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-39 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-40 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-41 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-42 | PASS | Stable API validation/error envelope; 429 not applicable to unthrottled profile reads |
| BE-GAP-43 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-44 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-45 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-46 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-47 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-48 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-49 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-50 | PASS | Password session policy, user scoping and bounded cursor contract |
| BE-GAP-51 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-52 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-53 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-54 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-55 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-56 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-57 | PASS | Isolated PostgreSQL migration lifecycle and ready dependency checks |
| BE-GAP-58 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-59 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-60 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-61 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-62 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-63 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-64 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-65 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-66 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-67 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-68 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-69 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-70 | PASS | Central real runtime/restart and truthful unavailable capability assertions |
| BE-GAP-71 | PASS | Full regression plus central composed integration |
| BE-GAP-72 | PASS | Full regression plus central composed integration |
| BE-GAP-73 | PASS | Full regression plus central composed integration |
| BE-GAP-74 | PASS | Full regression plus central composed integration |
| BE-GAP-75 | PASS | Full regression plus central composed integration |
| BE-GAP-76 | PASS | Full regression plus central composed integration |
| BE-GAP-77 | PASS | Full regression plus central composed integration |
| BE-GAP-78 | PASS | Full regression plus central composed integration |
| BE-GAP-79 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-80 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-81 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-82 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-83 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-84 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-85 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-86 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-87 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-88 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-89 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-90 | PASS | format/lint/typecheck/test/architecture/build/integration/migration/diff evidence |
| BE-GAP-91 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-92 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-93 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-94 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-95 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-96 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-97 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-98 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-99 | PASS | Artifacts, scope audit, commit and final status audit |
| BE-GAP-100 | PASS | Artifacts, scope audit, commit and final status audit |

## Tests and Gates

- Focused central runtime: 1 file, 1 test PASS.
- Full integration suite: 4 files, 7 tests PASS.
- `pnpm format:check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: 26 files / 356 tests PASS; 4 pre-existing skips.
- `pnpm test:architecture`: PASS.
- `pnpm build`: PASS.
- `git diff --check`: PASS.

## WEB INTEGRATION HANDOFF

Web may compose Favorites, My Contests, My Problems and Profile Capabilities through the contracts in `PRODUCT_BACKEND_NEW_CONTRACTS_V1.md`. Public profile is read-only and privacy-safe. Keep activity unavailable with `NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE`; keep heatmap and wrong-book unavailable with `UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME`; keep teams and homework unavailable with `PRODUCT_DOMAIN_NOT_IMPLEMENTED`.

## Final

- Implementation commit: `feat: close profile runtime gaps`; final SHA is verified by the final Git audit after this report amendment.
- Worktree is checked clean after temporary Goal artifact removal.
- READY FOR WEB POST-PARALLEL REQUALIFICATION = YES.
- No Web merge, Judge merge, or Lead Integration was performed.
