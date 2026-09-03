# OJPlatform Public Identifiers, Tags, Source V1 Report

Status: PARTIAL (database runtime migration blocked by unavailable local PostgreSQL).

Base: `498b8176bb554f4165f6ec6a7705ea92a7fefb01`

Migration: `0018_problem_public_metadata` and rollback companion. Problem and evaluation public numbers use PostgreSQL sequences with deterministic backfill. Problems project as `P0001`-style identifiers; evaluations project as `#0`-style numbers. UUIDs remain internal.

Tags use normalized `tags` catalog and `problem_tags` many-to-many relation with case-insensitive uniqueness and indexes. Problem authoring accepts editable tags and problem projections expose tags. Source V1 projects creator identity and stores extensible `source_type` (`CREATOR` default, with future external/import values allowed).

Focused tests: PASS (`tests/public-metadata.test.ts`, problem, submission detail, problem editor; 39 tests). Typecheck: PASS. Diff check: PASS. Lint: existing baseline errors remain outside this goal; no new goal-specific lint errors after surgical changes.

Database migration/runtime verification: BLOCKED; `pnpm db:migrate` could not connect to `127.0.0.1:55432` (`ECONNREFUSED`).

Commit: `800ecfc`. Tracked-clean status: PASS after commit.
