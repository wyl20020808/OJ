# Database Migration Architecture

OJPlatform uses one shared migration runner implementation with two fixed,
independent migration sets. Product and Judge never select migration files from
an environment-provided directory in their public CLIs.

## Product DB

Product migrations are declared, ordered, and checksum-pinned in
`scripts/migrations/product-manifest.mjs`. The manifest preserves the historical
registry order, including the duplicate numeric prefixes `0006` and `0007`.
Filename lexical order is not the Product execution contract.

The Product CLI reads only `DATABASE_URL`:

```powershell
pnpm migrate:product
pnpm migrate:product:status
pnpm migrate:product:plan
pnpm migrate:product:adopt
```

`db:migrate` remains a compatibility alias for `migrate:product`. Both require
an explicitly injected `DATABASE_URL`.

## Judge DB

Judge migrations are declared, ordered, and checksum-pinned in
`scripts/migrations/judge-manifest.mjs`. The Judge CLI reads only
`JUDGE_DATABASE_URL`; it never falls back to `DATABASE_URL`:

```powershell
pnpm migrate:judge
pnpm migrate:judge:status
pnpm migrate:judge:plan
pnpm migrate:judge:adopt
```

When `JUDGE_DATABASE_ROLE` is supplied, the migration owner grants that runtime
role DML and sequence access after a successful migration and explicitly denies
schema creation. `scripts/judge-service-bootstrap.mjs` owns database/role
bootstrap. It does not run schema migrations. The long-lived Judge Service gets
only its runtime URL, never `JUDGE_DATABASE_ADMIN_URL`. When a runtime role is
named, the CLI refuses to migrate as that same role.

## Ledger

Each database stores its own `public._ojplatform_runtime_migrations` ledger:

```text
label       text        primary key part 1
version     text        primary key part 2
checksum    text        SHA-256 of exact SQL bytes
applied_at  timestamptz database application time
```

Product rows use label `product`; Judge rows use label `judge`. A runner refuses
a database containing another migration label. This prevents a Product runner
from accepting Judge history, or vice versa, even when an operator supplies the
wrong URL.

The table name and shape are compatible with the Runtime Manager ledger that
predated this architecture. No third ledger is introduced.

## Checksum

Every historical `.sql` file has a committed SHA-256 in its manifest. Startup
validates the directory inventory and every file checksum before connecting to
the database. Applied ledger checksums are then compared with the manifest.

Any file mutation, unknown ledger version, history gap, unexpected SQL file, or
ledger checksum mismatch fails closed. The runner never refreshes a checksum.
Historical migration SQL is immutable; corrections require a new migration.

## Transaction Model

Each pending migration runs as one transaction:

```text
BEGIN
apply migration SQL
insert ledger row
COMMIT
```

Failure rolls back both schema/data changes and the ledger row. Migration
`0032_submission_integration_fixture_cleanup` historically contains its own
top-level `BEGIN`/`COMMIT`. Its manifest explicitly declares
`unwrap-explicit`; the runner verifies and removes only that wrapper so the
historical SQL body and ledger insert remain inside the runner transaction. No
migration silently disables transactions.

## Concurrency Lock

Before inspecting or changing history, the runner obtains a session-level
PostgreSQL advisory lock. A second runner waits. After the first commits and
releases the lock, the second re-reads the ledger and exits up to date. Closing
the connection also releases the lock after abnormal termination.

## Fresh Database

An empty database has no ledger and no public schema objects. `up` creates the
ledger in the same transaction as the first migration, applies the complete
ordered manifest, and records one row per migration. A second `up` executes no
migration SQL.

An empty database must use `up`, not `adopt`.

## Existing Database Adoption

A database with public objects but no Product/Judge ledger is never migrated
automatically. `status`, `plan`, and `up` return `MIGRATION_ADOPTION_REQUIRED`.

V1 adoption is an explicit latest-schema baseline operation:

1. Back up or clone the database.
2. Run `status`; confirm it reports adoption required.
3. Test `adopt` on the disposable clone.
4. Review every manifest evidence check and the resulting ledger.
5. Run explicit `adopt` on the intended database only after operator approval.

`adopt` checks enduring tables, columns, constraints, indexes, sequences, data
invariants, and migration-specific landmarks for every known migration. It
inserts the complete ledger in one transaction only after all checks pass. A
partial or ambiguous schema is refused without creating a ledger. V1 does not
guess an arbitrary historical baseline and does not interpret “relation already
exists” as proof of successful migration.

Databases already carrying the compatible Runtime Manager ledger do not use
adoption; the runner validates and reuses their rows.

## Status

`status` is read-only. It does not create the ledger. It reports:

```text
Latest known
Applied
Pending
Checksum mismatch
State
```

Add `--json` to either underlying Node CLI when a machine-readable status body
is needed. Success/up-to-date exits `0`. Database unavailability, checksum
mismatch, migration failure, adoption requirement, invalid history, and lock
query failure exit non-zero.

## Apply

`migrate:product` and `migrate:judge` are the stable container-ready entry
points. Output names each migration being applied but never prints SQL or a
connection string. `down` is ledger-aware and rolls back only the latest applied
migration; it refuses a non-latest requested ID or a missing down file.

## Failure Recovery

On a migration error:

1. Keep the historical SQL and ledger unchanged.
2. Inspect the named migration and PostgreSQL error.
3. Correct infrastructure or add a new forward migration as appropriate.
4. Retry `up`; the failed migration has no ledger row and its transaction left
   no partial schema state.

Never repair a checksum mismatch by editing the ledger.

## Docker One-Shot Migration Contract

Phase 2 supplies the stable commands but intentionally does not add an API/Web
or Judge image. Phase 3 should build a versioned application image containing
the migration scripts, manifests, SQL, lockfile, and runtime dependencies. The
Compose dependency contract is:

```text
PostgreSQL healthy
one-shot Product/Judge migration job exits 0
API/Judge runtime starts
```

The one-shot job receives a migration credential through secret injection. The
API and Judge runtime receive only normal runtime credentials. Application
startup never runs migrations, and production startup never bind-mounts the
repository or installs packages dynamically.

## Never Do This

- Do not delete a ledger row and replay an old migration.
- Do not edit historical migration SQL or refresh its checksum.
- Do not run a full replay against an existing or production database.
- Do not auto-adopt because a relation happens to exist.
- Do not store Product and Judge history in one database.
- Do not give long-lived API/Judge processes bootstrap/admin credentials.
- Do not test failure, replay, rollback, adoption, or concurrency on user data.
