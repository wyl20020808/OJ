# OJPlatform Problem Data & Tags Read-Only Audit V1 Report

Date: 2026-09-06  
Scope: Product Problem schema/repository/API, current Tag persistence, generated Problem provenance, references, and future delete/tag design.  
Safety: read-only audit. No product code modified. No migration executed. No seed executed. No Problem deleted. No database data modified. Main was not merged.

## Result

**PROBLEM DATA & TAGS READ-ONLY AUDIT V1 = PARTIAL**

Partial because current implementation and design basis are reliable, but existing data cannot prove manual origin for 40 authored-looking rows and the normalized catalog migration/delete feature remain future work.

## Current Tag system

| Question | Finding |
|---|---|
| TAG STORAGE CURRENT | PostgreSQL relation tables `tags` + `problem_tags` introduced by migration `0018_problem_public_metadata.sql`; `tags` currently has `id`, `normalized_key`, `display_name`, `created_at`. In-memory repository stores `string[]` directly. |
| TAG API CURRENT | Problem model and Web contract expose `tags: string[]` (display names), not tag objects or IDs. |
| TAG CREATE/EDIT CURRENT | `POST /api/problems` and `PATCH /api/problems/:idOrSlug` accept up to 50 non-empty strings, trim/collapse whitespace, reject case-insensitive duplicates. PostgreSQL repository deletes existing links, upserts `tags` by lower-case `normalized_key`, then inserts `problem_tags`. |
| TAG LIST CURRENT | `GET /api/problems` aggregates `t.display_name` ordered by display name; no tag filter query exists. Web derives a local distinct tag filter from loaded rows. |
| TAG DETAIL CURRENT | `GET /api/problems/:idOrSlug` returns same `tags: string[]` projection. |
| CURRENT TAG CATALOG | No catalog endpoint, category, slug, display order, or active flag. Current DB had 0 tag rows and 0 links at audit time. |

Relevant code: `apps/api/src/modules/problem/model.ts`, `validation.ts`, `repository.ts`, `routes.ts`; migration `packages/database/migrations/0018_problem_public_metadata.sql`; Web types/editor in `apps/web/src/services/api.ts` and `apps/web/src/components/ProblemEditor.tsx`.

## Normalized Tag recommendation

**NORMALIZED TAG RECOMMENDED = YES**  
**MIGRATION REQUIRED = YES**

The current relation shape is a useful base, but catalog semantics must be added: stable `slug`, `name`, `category`, `display_order`, `is_active`. Backfill must preserve every current normalized key/display value, produce a reviewed mapping for category/slug, keep unmapped values in an exception report, and retain a temporary legacy string projection. API versioning and formal migration review are required.

It supports searchable multi-select, deterministic List/Detail rendering, and future Team Problem Collection/Homework filtering through indexed tag IDs. Future filters should use explicit tag slugs/IDs and authorization-aware Problem queries, not client-side aggregation.

**TAG CATALOG READY = YES** for proposal/seed review only; **NO** for production seed execution. Proposal is in `Docs/parallel/PROBLEM_TAG_CATALOG_V1.md`.

## Generated Problem audit

Schema has `author_id`, revision `created_by`, and `source_type` (`CREATOR|EXTERNAL|IMPORT`). `source_type` defaults to `CREATOR`; API create sets author from authenticated context. No reliable generated/manual marker, import batch, metadata provenance, or seed registry exists. Test scripts contain direct SQL fixtures and API-created E2E problems.

Read-only local DB inventory: 44 Problems; source type counts `CREATOR=44`, `EXTERNAL=0`, `IMPORT=0`; `author_id IS NULL=4`. For these four rows, the API `source` projection is null while `source_type` is the default `CREATOR`; the direct SQL fixture definitions provide the actual generated evidence. Remaining 40 cannot be classified from trusted evidence and are UNKNOWN. Full inventory and evidence are in `Docs/parallel/GENERATED_PROBLEM_CLASSIFICATION_V1.md`.

| Metric | Result |
|---|---:|
| GENERATED PROBLEMS IDENTIFIABLE | PARTIAL |
| DEFINITELY GENERATED COUNT | 4 |
| DEFINITELY MANUAL COUNT | 0 |
| UNKNOWN COUNT | 40 |

No title/time/public-number heuristic was used. No unknown row belongs in a deletion list.

## Reference audit and deletion design

Current FK inspection found CASCADE links for revisions/tags/favorites/judge drafts/config/editor drafts and RESTRICT links for contest membership, published JudgeData versions, and artifact objects. Submission problem references are application-level without DB FKs. Of four definite generated rows, two are referenced by contest membership; current SELECT checks found no submission, evaluation, JudgeData, favorite, editor draft, config, object, or revision references. Because hard deletion destroys identity/history and application-level references are not FK-protected, recommended safe hard delete is zero.

**SAFE HARD DELETE COUNT = 0**  
**SOFT DELETE REQUIRED COUNT = 4**  
**DELETE PROBLEM DESIGN READY = YES** (proposal, not implemented)

Contract recommends `deleted_at`, `deleted_by`, reason, capability-based creator/admin authorization, second confirmation, audit event, hidden List, deleted Detail policy, submission blocking, and retention of historical Submission/Evaluation/JudgeData references. Full contract: `Docs/parallel/DELETE_PROBLEM_CONTRACT_V1.md`.

## Evidence and limitations

- Runtime Manager status was read only; local PostgreSQL was reachable. No start/restart was requested.
- SQL inventory used SELECT-only queries against `problems`, `problem_revisions`, reference tables, and information-schema foreign keys.
- Direct fixture definitions were inspected in `tests/contest-social-foundation.integration.test.ts` and `tests/integration/product-backend-runtime-composition.test.ts`.
- Automated API/E2E creation proves test generation but does not prove a row's provenance after the fact; therefore those rows remain UNKNOWN.
- No product code, migration, seed, or DB row changed in this audit.

## Final output

```text
PROBLEM DATA & TAGS READ-ONLY AUDIT V1 = PARTIAL
CURRENT TAG STORAGE = PostgreSQL tags + problem_tags relation; API projection string[]
NORMALIZED TAG RECOMMENDED = YES
MIGRATION REQUIRED = YES
TAG CATALOG READY = YES (proposal only)
GENERATED PROBLEMS IDENTIFIABLE = PARTIAL
DEFINITELY GENERATED COUNT = 4
DEFINITELY MANUAL COUNT = 0
UNKNOWN COUNT = 40
SAFE HARD DELETE COUNT = 0
SOFT DELETE REQUIRED COUNT = 4
DELETE PROBLEM DESIGN READY = YES (proposal only)
PRODUCT CODE MODIFIED = NO
DB DATA MODIFIED = NO
REPORT COMMIT = NOT COMMITTED (audit requested stop; user may commit document-only changes)
```
