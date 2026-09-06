# Generated Problem Classification V1

Classification is conservative. Title text, timestamps, and public number alone are not evidence.

## Evidence rules

`DEFINITELY_GENERATED` requires a direct, reproducible generator signal: a seed/import marker, a fixture SQL definition, an import batch, or an equivalent immutable provenance record. `DEFINITELY_MANUAL` requires a trusted manual-authoring provenance signal. Otherwise classify `UNKNOWN` and exclude from deletion.

Current code has `problems.author_id`, `problem_revisions.created_by`, and `source_type` (`CREATOR|EXTERNAL|IMPORT`). `source_type` is added with default `CREATOR`; Product create derives `author_id` from the authenticated context, and repository mapping defaults missing source type to `CREATOR`. None of these fields records whether an authenticated request came from a human or an automated test. There is no import batch, seed marker, metadata JSON, or generated-by field in the Problem schema.

## Current read-only inventory

Audit query time: 2026-09-06. Database endpoint: local Product PostgreSQL reported by Runtime Manager. Queries were SELECT-only.

| Public ID | Title | Creator (`author_id`) | Source | Created At | Evidence | Classification |
|---|---|---|---|---|---|---|
| P0011 | Fixture problem | null | API `source=null`; `source_type=CREATOR`; no revision | 2026-09-01T02:48:52.143Z | Direct INSERT in `tests/contest-social-foundation.integration.test.ts`; ID prefix `contest-fixture-`; referenced by contest fixture | DEFINITELY_GENERATED |
| P0012 | Fixture problem | null | API `source=null`; `source_type=CREATOR`; no revision | 2026-09-01T02:51:41.404Z | Same direct fixture INSERT family; no current references | DEFINITELY_GENERATED |
| P0013 | Composed fixture | null | API `source=null`; `source_type=CREATOR`; no revision | 2026-09-01T06:16:53.962Z | Direct INSERT in `tests/integration/product-backend-runtime-composition.test.ts`; `problemId` fixture; referenced by contest fixture | DEFINITELY_GENERATED |
| P0014 | Composed fixture | null | API `source=null`; `source_type=CREATOR`; no revision | 2026-09-01T06:17:45.813Z | Same direct fixture INSERT family; no current references | DEFINITELY_GENERATED |

The database contains 44 Problems total: 44 `CREATOR`, 0 `EXTERNAL`, 0 `IMPORT`, and 4 with null `author_id`. The remaining 40 have non-null authors but no trusted provenance distinguishing human authoring from automated API/E2E creation. They are `UNKNOWN`, not manual.

## Counts

| Classification | Count |
|---|---:|
| DEFINITELY_GENERATED | 4 |
| DEFINITELY_MANUAL | 0 |
| UNKNOWN | 40 |

No row is added to a deletion list solely because its title resembles a test, its timestamp is recent, or its public number is small.

## Follow-up provenance requirement

Add immutable provenance at creation: `source_type` with enforced semantics, `created_by`/actor, optional `import_batch_id`, and a structured `provenance` record containing tool/run ID. Automated tests must use an explicit test-only source marker. Preserve actor identity separately; `CREATOR` must mean source category, not proof of manual action.
