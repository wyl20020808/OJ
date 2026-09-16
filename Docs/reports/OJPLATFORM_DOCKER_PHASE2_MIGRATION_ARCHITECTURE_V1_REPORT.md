# Docker Phase 2 Migration Architecture V1 Report

## Live Baseline

- Canonical root: `D:\OJPlatform`.
- Starting branch / HEAD: `main` / `ed389ea6a1c435ff85783d99d3c607d3d4dbb5e1`.
- `refs/heads/main`: `ed389ea6a1c435ff85783d99d3c607d3d4dbb5e1`.
- Canonical root was clean. Three existing stashes and all existing worktrees were preserved.
- Feature worktree: `D:\OJPlatform-worktrees\docker-phase2-migration-architecture-v1`.
- Feature branch: `codex/docker-phase2-migration-architecture-v1`.
- No merge into `main` was performed.

## Previous Migration Architecture

### Product migration current contract before Phase 2

- `scripts/migrate.mjs` contained a manually ordered 39-entry array.
- `up` replayed every selected SQL file; `down` replayed down files in reverse.
- No durable ledger, applied-state check, checksum, advisory lock, or per-file transaction existed.
- A failure could leave earlier files committed and the next invocation replayed them.
- The default connection string embedded the local development credential.

### Judge migration current contract before Phase 2

- `scripts/judge-service-migrate.mjs` lexically sorted the Judge SQL directory.
- Every `up` invocation replayed all four migrations.
- No ledger, checksum, advisory lock, or runner transaction existed.
- The runner correctly required `JUDGE_DATABASE_URL`, but the bootstrap granted the long-lived runtime role schema creation.

### Runtime Manager migration contract before Phase 2

- `scripts/dev-runtime-migrate.mjs` used `public._ojplatform_runtime_migrations` with `(label, version)` primary key.
- It calculated SHA-256 over SQL text and used one transaction per file.
- It had no advisory lock, no fixed manifest, no adoption state, and accepted an arbitrary label/directory.
- Historical migration `0032_submission_integration_fixture_cleanup` contains its own `BEGIN`/`COMMIT`; that inner `COMMIT` could commit before the Runtime Manager inserted its ledger row.

### Bootstrap contract before Phase 2

- `scripts/judge-service-bootstrap.mjs` created/repaired the Judge database and runtime role, connected to the target database, and installed grants/default privileges.
- Schema migration was already a separate script, but the runtime role retained `CREATE` on `public` and was used as the Runtime Manager migration credential.

## Product Migration Inventory

The authoritative inventory is `scripts/migrations/product-manifest.mjs`: 39 immutable entries, each with ordinal, full filename ID, SHA-256, transaction compatibility, side-effect description, and adoption evidence.

Canonical order:

```text
0000_platform_metadata
0001_auth_foundation
0002_problem_foundation
0003_authz_foundation
0004_problem_authoring_revision
0005_submission_intake
0006_submission_evaluation_history
0007_submission_status_lifecycle
0006_auth_identity_verification_social
0007_contest_foundation
0008_social_messaging_foundation
0009_notifications_foundation
0010_guest_auth
0011_profile_favorites
0012_product_judge_admin_audit
0013_problem_judge_data
0014_problem_judge_data_integrity
0015_submission_judge_data_binding
0016_submission_evaluation_detail
0017_problem_authoring_v2
0018_problem_public_metadata
0019_editor_code_drafts
0020_judge_artifacts
0021_submission_dispatch
0022_problem_delete_provenance
0023_team_core_v1
0024_problem_tag_catalog
0025_discussion_core
0026_submission_source_permission
0027_profile_experience
0028_discussion_comment_likes
0029_team_assignment_v1
0030_discussion_announcement_capability
0031_profile_media_save_v2
0032_submission_integration_fixture_cleanup
0033_blog_full_experience
0034_problem_provider_semantics
0035_problem_revision_source_type
0036_contest_development_provenance
```

All are transaction-compatible. `0032` is explicitly classified `unwrap-explicit`; the runner verifies/removes its historical top-level wrapper and executes the unchanged body inside the runner transaction. No historical SQL file changed.

## Judge Migration Inventory

The authoritative inventory is `scripts/migrations/judge-manifest.mjs`:

1. `0000_judge_service_boundary`
2. `0001_dynamic_judge_node_registry`
3. `0002_judge_admin_state`
4. `0003_judge_pool_control`

All four are checksum-pinned and transaction-compatible. Product IDs do not appear in this manifest.

## Ledger Design

The shared runner preserves the existing Runtime Manager table:

```text
public._ojplatform_runtime_migrations
PRIMARY KEY (label, version)
label, version, checksum, applied_at
```

Each database contains only its own label. Any other label causes `MIGRATION_DATABASE_LABEL_CONFLICT`. Existing ledger shape and primary key are validated before use. Unknown versions and non-prefix history fail closed.

## Checksum Design

- Algorithm: SHA-256 over exact migration file bytes decoded as UTF-8; repository LF normalization is fixed by `.gitattributes`.
- Static manifest checksum validation occurs before DB connection.
- Ledger checksum validation occurs before planning or execution.
- File mutation, ledger mutation, unexpected file, missing file, unknown version, and history gap all fail closed.
- The runner never updates an existing checksum.

## Transaction Model

Every migration uses `BEGIN`, migration SQL, ledger insert, `COMMIT`. Any SQL or ledger failure triggers `ROLLBACK`. The first migration creates the ledger in that same transaction, so a failed first migration leaves neither schema nor ledger state.

No migration disables transactions. `0032` uses the explicit wrapper-normalization contract described above.

## Advisory Lock

The runner acquires one session-level two-key PostgreSQL advisory lock before reading ledger state. Concurrent runners use WAIT behavior. After the first runner commits, the second re-reads history and exits up to date. The lock is explicitly released and is also released by connection close.

## 0020 Root Cause

`0020_judge_artifacts.sql` executes plain `CREATE TABLE judge_artifacts`; it intentionally has no `IF NOT EXISTS`. In an isolated database, applying through latest and directly replaying `0020` reproduced PostgreSQL `42P07` for relation `judge_artifacts`.

The old Product CLI had no ledger and replayed every file. Therefore a database where `0020` had already succeeded reached the plain `CREATE TABLE` again and failed. The conflict is the table relation itself, not an index or constraint.

Historical reports show the local schema had already received `0020`, but the stopped real development database was not started or queried in this phase; its exact live row/object provenance was not independently reverified.

## 0020 Resolution

The SQL file remains immutable. Fresh databases execute it once and atomically record its checksum. Subsequent runs see its ledger row and never execute it. Ledgerless latest schemas require explicit verified adoption. Relation existence alone never marks it applied.

## Existing DB Adoption Strategy

Normal `status`, `plan`, and `up` detect public schema objects without a ledger and return `MIGRATION_ADOPTION_REQUIRED` without writing.

Explicit `adopt` is a latest-schema baseline operation. It verifies every manifest entry's enduring tables, columns, constraints, indexes, sequences, and data invariants. Only then does one transaction create/fill the ledger. Partial evidence was tested and refused without a ledger write.

An isolated full legacy replay schema successfully adopted all 39 Product rows and then produced a no-op `up`. A separately constructed legacy Runtime Manager ledger was accepted without adoption and produced a no-op `up`.

V1 intentionally does not guess arbitrary historical baselines. An ambiguous older ledgerless database must be cloned and handled by an operator-reviewed baseline plan.

## Product Fresh DB Qualification

Isolated Compose project `ojp-phase2-migration-q` used PostgreSQL `16.4-alpine`, an isolated network, ephemeral credential, and dedicated volume. The formal `scripts/migrate.mjs up` entry point applied 39/39 migrations. Expected `judge_artifacts` existed, ledger rows/checksums were exact and unique, and Judge DB tables were absent.

Second formal Product run: zero pending, no SQL replay.

## Product Historical Upgrade Qualification

The test harness applied the canonical manifest only through `0019_editor_code_drafts`, confirmed `judge_artifacts` was absent, then ran the full runner. `0020` executed once, all later migrations completed, the final ledger had 39 exact rows, and the second run was a no-op.

## Current DB Clone Qualification

`CURRENT DB CLONE VERIFIED = NO`.

The legacy `ojplatform-local-postgres-1` container was stopped. Starting the full Runtime Manager would execute migrations and violate the read-only-current-DB boundary. No safe already-running source was available for `pg_dump`; the real volume was not mounted, copied, started, or modified. This conditional qualification is explicitly blocked by environment state, not replaced with schema guessing.

## Judge Fresh DB Qualification

The bootstrap created a dedicated disposable Judge database and NOSUPERUSER/NOCREATEDB/NOCREATEROLE runtime role. The formal Judge CLI, using the separate migration/admin connection, applied 4/4 migrations. Second run was a no-op. Judge had no Product `users` table; Product had no `judge_service_jobs` table.

The runtime role could connect and use granted runtime privileges but PostgreSQL rejected `CREATE TABLE` with `42501`.

## Retry / Rollback Qualification

A synthetic disposable migration created a table then called a nonexistent function. The runner returned migration failure; both table and first ledger creation rolled back. Replacing the synthetic fixture with valid SQL allowed a clean retry and one ledger row. No fake migration entered formal history.

## Checksum Mutation Qualification

After applying the synthetic migration, its temporary SQL and manifest checksum were changed while the ledger retained the applied checksum. The runner returned `MIGRATION_CHECKSUM_MISMATCH`, exited non-zero, and did not execute the added column. The unit test separately changes SQL without changing its manifest and receives `MIGRATION_FILE_CHECKSUM_MISMATCH` before DB access.

## Concurrency Qualification

Two runner instances targeted one disposable database and a one-second synthetic migration concurrently. Exactly one logged `Applying`; the second waited on the advisory lock and logged up to date. Final schema existed once and ledger contained one unique row.

## Runtime Manager Compatibility

`scripts/dev-runtime-migrate.mjs` is now a compatibility wrapper over the shared runner. It accepts only fixed `product`/`judge` contracts and rejects mismatched directories. Disposable Product and Judge wrapper runs and second-run no-ops passed.

`scripts/dev-runtime.ps1` now uses the bootstrap/admin target URL only for the short-lived Judge migration job. The Judge Service still receives only the runtime-role URL. Full Runtime Manager lifecycle was intentionally not started because it would touch the real database.

## Compose Migration Contract

Option A was selected: container-ready commands exist, but Compose migration-service wiring remains Phase 3 because no application image exists in Phase 2. No source bind mount, boot-time install, API image, Web image, Judge image, or runtime migration-on-startup was added.

Phase 3 must make PostgreSQL health precede one-shot migration success, and one-shot migration success precede application startup.

## Security / Credential Boundary

- Product formal CLI reads only `DATABASE_URL`; Judge formal CLI reads only `JUDGE_DATABASE_URL`.
- Negative unit tests prove neither CLI accepts the other variable.
- Judge bootstrap no longer grants runtime schema creation.
- Judge CLI refuses a named runtime role equal to the migration connection user.
- Long-lived Judge Service receives no admin URL.
- Product production migration/runtime role separation remains deployment work; Phase 2 adds no permanent superuser credential to application containers.
- Logs print migration IDs and failures, never SQL or connection strings.
- No real secret was added.

## Phase 1 Regression

All passed:

- `docker compose -f compose.yaml config -q`
- `docker compose -f compose.yaml -f compose.dev.yaml config -q`
- `docker compose -f compose.yaml -f compose.prod.yaml config -q` with placeholder required variables

The exact qualification project container, network, and volume were removed. Existing `ojplatform-*` volumes and stopped containers were not changed.

## Tests

Passed:

- `pnpm qualify:migrations`: complete disposable PostgreSQL matrix, including fresh Product/Judge, second runs, `0019` upgrade, adoption/refusal, legacy ledger, rollback/retry, mutation, concurrency, isolation, role boundary, and Runtime Manager wrappers.
- `pnpm test:migrations`: 4/4.
- `pnpm typecheck`.
- `pnpm test:architecture`.
- `pnpm build`.
- Targeted ESLint and Prettier.
- Node syntax checks and PowerShell parse check.
- `git diff --check`.
- Base/dev/prod Compose config.

Broader repository gates:

- `pnpm format:check`: blocked by the same 30 unrelated files on live `main`; no Phase 2 file failed targeted Prettier.
- `pnpm lint`: blocked by the same 8 unrelated errors on live `main`; the Phase 2 TypeScript test passed targeted ESLint.
- `pnpm test`: 918 passed, 48 failed, 10 skipped; failures are in unrelated existing Web/API contract tests plus suites requiring the stopped real PostgreSQL at `127.0.0.1:55432`. Migration-focused tests passed.

## Files Changed

- Shared runner and Product/Judge immutable manifests.
- Product, Judge, and Runtime Manager CLI wrappers.
- Judge bootstrap/runtime privilege boundary and Runtime Manager migration credential routing.
- Migration unit and disposable PostgreSQL qualification harness.
- Package commands and deployment documentation.
- This report and `Docs/PROJECT_STATUS.md`.

No historical migration SQL changed.

## Commits

- `39d48aa feat: establish migration ledger architecture`
- Report/status commit follows this report.

## Remaining Phase 3 Work

- Build the versioned application/migration image.
- Add one-shot Compose Product/Judge migration services and health/success dependency wiring.
- Inject dedicated production migration credentials and separate Product runtime role.
- Qualify a read-only clone of the currently stopped development database when a safe source becomes available.
- Repair unrelated baseline format/lint/test failures in their owning goals.

## Final Status

```text
DOCKER PHASE 2 MIGRATION ARCHITECTURE = PASS
PRODUCT MIGRATION LEDGER = PASS
JUDGE MIGRATION LEDGER = PASS
MIGRATION CHECKSUM = PASS
TRANSACTION SAFETY = PASS
CONCURRENCY LOCK = PASS
0020 ROOT CAUSE = IDENTIFIED
0020 REPLAY BLOCKER = RESOLVED
FRESH PRODUCT DB → LATEST = PASS
PRODUCT SECOND RUN NO-OP = PASS
0019 → LATEST = PASS
EXISTING DB ADOPTION = PASS
CURRENT DB CLONE VERIFIED = NO
FRESH JUDGE DB → LATEST = PASS
JUDGE SECOND RUN NO-OP = PASS
PRODUCT/JUDGE ISOLATION = PASS
FAILURE ROLLBACK = PASS
RETRY SAFETY = PASS
CHECKSUM MUTATION FAIL-CLOSED = PASS
CONCURRENT MIGRATORS = PASS
RUNTIME MANAGER COMPATIBLE = YES
PHASE1 COMPOSE REGRESSION = PASS
REAL CURRENT DB MODIFIED = NO
REAL USER DATA DELETED = NO
REAL SECRETS COMMITTED = NO
API/WEB/JUDGE RUNTIME CONTAINERIZED = NO
SAFE TO START PHASE 3 = YES
MAIN MERGE = NOT PERFORMED
```
