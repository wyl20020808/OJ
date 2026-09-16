import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

export const MIGRATION_LEDGER = '_ojplatform_runtime_migrations';
const LOCK_KEY_CLASS = 1799941167;
const LOCK_KEY_INSTANCE = 1;

export class MigrationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'MigrationError';
    this.code = code;
  }
}

export function migrationChecksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function unwrapManagedTransaction(sql, migration) {
  if (migration.transaction !== 'unwrap-explicit') return sql;
  const match = sql.match(/^\s*BEGIN\s*;([\s\S]*)COMMIT\s*;\s*$/i);
  if (!match) {
    throw new MigrationError(
      'MIGRATION_TRANSACTION_WRAPPER_INVALID',
      migration.id,
    );
  }
  return match[1];
}

function validateManifest(manifest, label) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new MigrationError('MIGRATION_MANIFEST_EMPTY', label);
  }
  const ids = new Set();
  for (const [index, migration] of manifest.entries()) {
    if (migration.ordinal !== index) {
      throw new MigrationError(
        'MIGRATION_MANIFEST_ORDINAL_INVALID',
        migration.id,
      );
    }
    if (!/^\d+_.+$/.test(migration.id) || ids.has(migration.id)) {
      throw new MigrationError('MIGRATION_MANIFEST_ID_INVALID', migration.id);
    }
    if (!/^[a-f0-9]{64}$/.test(migration.checksum)) {
      throw new MigrationError(
        'MIGRATION_MANIFEST_CHECKSUM_INVALID',
        migration.id,
      );
    }
    if (!['transactional', 'unwrap-explicit'].includes(migration.transaction)) {
      throw new MigrationError(
        'MIGRATION_TRANSACTION_MODE_INVALID',
        migration.id,
      );
    }
    if (!Array.isArray(migration.evidence) || migration.evidence.length === 0) {
      throw new MigrationError(
        'MIGRATION_ADOPTION_EVIDENCE_MISSING',
        migration.id,
      );
    }
    ids.add(migration.id);
  }
}

export async function loadMigrationFiles({ directory, label, manifest }) {
  validateManifest(manifest, label);
  const actualIds = (await readdir(directory))
    .filter((file) => /^\d+_.+\.sql$/.test(file) && !file.endsWith('.down.sql'))
    .map((file) => file.slice(0, -4));
  const expectedIds = new Set(manifest.map(({ id }) => id));
  const missing = manifest
    .filter(({ id }) => !actualIds.includes(id))
    .map(({ id }) => id);
  const unexpected = actualIds.filter((id) => !expectedIds.has(id));
  if (missing.length || unexpected.length) {
    throw new MigrationError(
      'MIGRATION_INVENTORY_MISMATCH',
      `${label}:missing=${missing.join(',') || 'none'}:unexpected=${unexpected.join(',') || 'none'}`,
    );
  }
  return Promise.all(
    manifest.map(async (migration) => {
      const sql = await readFile(
        join(directory, `${migration.id}.sql`),
        'utf8',
      );
      const actualChecksum = migrationChecksum(sql);
      if (actualChecksum !== migration.checksum) {
        throw new MigrationError(
          'MIGRATION_FILE_CHECKSUM_MISMATCH',
          `${label}:${migration.id}`,
        );
      }
      return { ...migration, sql };
    }),
  );
}

async function acquireLock(client) {
  await client.query('SELECT pg_advisory_lock($1, $2)', [
    LOCK_KEY_CLASS,
    LOCK_KEY_INSTANCE,
  ]);
}

async function releaseLock(client) {
  await client.query('SELECT pg_advisory_unlock($1, $2)', [
    LOCK_KEY_CLASS,
    LOCK_KEY_INSTANCE,
  ]);
}

async function ledgerExists(client) {
  const result = await client.query(
    `SELECT to_regclass('public.${MIGRATION_LEDGER}') IS NOT NULL AS exists`,
  );
  return result.rows[0].exists;
}

async function schemaHasObjects(client) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
         AND c.relname <> $1
     ) AS exists`,
    [MIGRATION_LEDGER],
  );
  return result.rows[0].exists;
}

async function createLedger(client) {
  await client.query(`
    CREATE TABLE public.${MIGRATION_LEDGER} (
      label text NOT NULL,
      version text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (label, version)
    )
  `);
}

async function assertLedgerContract(client) {
  const columns = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [MIGRATION_LEDGER],
  );
  const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
  const required = [
    ['label', 'text', 'NO'],
    ['version', 'text', 'NO'],
    ['checksum', 'text', 'NO'],
    ['applied_at', 'timestamp with time zone', 'NO'],
  ];
  if (
    required.some(
      ([name, type, nullable]) =>
        !byName.has(name) ||
        byName.get(name).data_type !== type ||
        byName.get(name).is_nullable !== nullable,
    )
  ) {
    throw new MigrationError('MIGRATION_LEDGER_CONTRACT_INVALID');
  }
  const primaryKey = await client.query(
    `SELECT array_agg(a.attname::text ORDER BY u.ordinality) AS columns
     FROM pg_constraint c
     CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality)
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
     WHERE c.conrelid = $1::regclass AND c.contype = 'p'`,
    [`public.${MIGRATION_LEDGER}`],
  );
  if (
    JSON.stringify(primaryKey.rows[0]?.columns) !==
    JSON.stringify(['label', 'version'])
  ) {
    throw new MigrationError('MIGRATION_LEDGER_PRIMARY_KEY_INVALID');
  }
}

async function readLedger(client, label) {
  const otherLabels = await client.query(
    `SELECT DISTINCT label FROM public.${MIGRATION_LEDGER} WHERE label <> $1 ORDER BY label`,
    [label],
  );
  if (otherLabels.rowCount) {
    throw new MigrationError(
      'MIGRATION_DATABASE_LABEL_CONFLICT',
      `${label}:found=${otherLabels.rows.map(({ label: found }) => found).join(',')}`,
    );
  }
  return (
    await client.query(
      `SELECT version, checksum, applied_at
       FROM public.${MIGRATION_LEDGER}
       WHERE label = $1`,
      [label],
    )
  ).rows;
}

function validateAppliedRows(rows, migrations, label) {
  const manifestById = new Map(
    migrations.map((migration) => [migration.id, migration]),
  );
  const appliedById = new Map();
  for (const row of rows) {
    const migration = manifestById.get(row.version);
    if (!migration) {
      throw new MigrationError(
        'MIGRATION_LEDGER_UNKNOWN_VERSION',
        `${label}:${row.version}`,
      );
    }
    if (migration.checksum !== row.checksum) {
      throw new MigrationError(
        'MIGRATION_CHECKSUM_MISMATCH',
        `${label}:${row.version}`,
      );
    }
    appliedById.set(row.version, row);
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (!appliedById.has(migrations[index].id)) {
      throw new MigrationError(
        'MIGRATION_LEDGER_NOT_PREFIX',
        `${label}:${migrations[index].id}`,
      );
    }
  }
  return appliedById;
}

async function inspectState(client, migrations, label) {
  const exists = await ledgerExists(client);
  if (!exists) {
    const adoptionRequired = await schemaHasObjects(client);
    return {
      ledgerExists: false,
      rows: [],
      appliedById: new Map(),
      adoptionRequired,
    };
  }
  await assertLedgerContract(client);
  const rows = await readLedger(client, label);
  const appliedById = validateAppliedRows(rows, migrations, label);
  const adoptionRequired =
    rows.length === 0 && (await schemaHasObjects(client));
  return { ledgerExists: true, rows, appliedById, adoptionRequired };
}

function publicStatus(label, migrations, state) {
  const pending = migrations.filter(({ id }) => !state.appliedById.has(id));
  return {
    label,
    latestKnownMigration: migrations.at(-1).id,
    appliedCount: state.rows.length,
    pendingCount: pending.length,
    pending: pending.map(({ id }) => id),
    checksumMismatch: false,
    adoptionRequired: state.adoptionRequired,
    state: state.adoptionRequired
      ? 'ADOPTION_REQUIRED'
      : pending.length
        ? 'PENDING'
        : 'UP_TO_DATE',
  };
}

function formatStatus(status, includePlan) {
  const lines = [
    `Migration set: ${status.label}`,
    `Latest known: ${status.latestKnownMigration}`,
    `Applied: ${status.appliedCount}`,
    `Pending: ${status.pendingCount}`,
    'Checksum mismatch: NO',
    `State: ${status.state}`,
  ];
  if (includePlan && status.pending.length)
    lines.push(`Plan: ${status.pending.join(', ')}`);
  return lines.join('\n');
}

async function evidenceMatches(client, evidence) {
  if (evidence.kind === 'table') {
    const result = await client.query(
      'SELECT to_regclass($1) IS NOT NULL AS ok',
      [`public.${evidence.name}`],
    );
    return result.rows[0].ok;
  }
  if (evidence.kind === 'sequence' || evidence.kind === 'index') {
    const result = await client.query(
      'SELECT to_regclass($1) IS NOT NULL AS ok',
      [`public.${evidence.name}`],
    );
    return result.rows[0].ok;
  }
  if (evidence.kind === 'column') {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS ok`,
      [evidence.table, evidence.name],
    );
    return result.rows[0].ok;
  }
  if (evidence.kind === 'constraint') {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint c
         JOIN pg_class r ON r.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = r.relnamespace
         WHERE n.nspname = 'public' AND r.relname = $1 AND c.conname = $2
       ) AS ok`,
      [evidence.table, evidence.name],
    );
    return result.rows[0].ok;
  }
  if (evidence.kind === 'extension') {
    const result = await client.query(
      'SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) AS ok',
      [evidence.name],
    );
    return result.rows[0].ok;
  }
  if (evidence.kind === 'query') {
    try {
      const result = await client.query(evidence.sql);
      return result.rows[0]?.ok === true;
    } catch {
      return false;
    }
  }
  throw new MigrationError(
    'MIGRATION_ADOPTION_EVIDENCE_KIND_INVALID',
    evidence.kind,
  );
}

async function verifyAdoptionEvidence(client, migrations, label) {
  if (!(await schemaHasObjects(client))) {
    throw new MigrationError('MIGRATION_ADOPTION_EMPTY_DATABASE', label);
  }
  const failures = [];
  for (const migration of migrations) {
    for (const evidence of migration.evidence) {
      if (!(await evidenceMatches(client, evidence))) {
        failures.push(
          `${migration.id}:${evidence.description ?? evidence.name ?? evidence.kind}`,
        );
      }
    }
  }
  if (failures.length) {
    throw new MigrationError(
      'MIGRATION_ADOPTION_EVIDENCE_FAILED',
      `${label}:${failures.join(',')}`,
    );
  }
}

async function adopt(client, migrations, label, state, log) {
  if (state.rows.length !== 0) {
    throw new MigrationError('MIGRATION_ADOPTION_LEDGER_NOT_EMPTY', label);
  }
  await verifyAdoptionEvidence(client, migrations, label);
  await client.query('BEGIN');
  try {
    if (!state.ledgerExists) await createLedger(client);
    for (const migration of migrations) {
      await client.query(
        `INSERT INTO public.${MIGRATION_LEDGER}(label, version, checksum) VALUES ($1, $2, $3)`,
        [label, migration.id, migration.checksum],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  log(
    `Adopted ${migrations.length} ${label} migrations after schema evidence verification`,
  );
}

async function applyPending(client, migrations, label, state, log, toId) {
  if (state.adoptionRequired) {
    throw new MigrationError('MIGRATION_ADOPTION_REQUIRED', label);
  }
  let targetIndex = migrations.length - 1;
  if (toId !== undefined) {
    targetIndex = migrations.findIndex(({ id }) => id === toId);
    if (targetIndex < 0)
      throw new MigrationError('MIGRATION_TARGET_UNKNOWN', `${label}:${toId}`);
    if (state.rows.length > targetIndex + 1) {
      throw new MigrationError(
        'MIGRATION_TARGET_BEHIND_LEDGER',
        `${label}:${toId}`,
      );
    }
  }
  const pending = migrations
    .slice(0, targetIndex + 1)
    .filter(({ id }) => !state.appliedById.has(id));
  if (pending.length === 0) {
    log(`Migration ${label} up to date`);
    return;
  }
  let hasLedger = state.ledgerExists;
  for (const migration of pending) {
    log(`Applying ${migration.id}...`);
    await client.query('BEGIN');
    try {
      if (!hasLedger) await createLedger(client);
      await client.query(unwrapManagedTransaction(migration.sql, migration));
      await client.query(
        `INSERT INTO public.${MIGRATION_LEDGER}(label, version, checksum) VALUES ($1, $2, $3)`,
        [label, migration.id, migration.checksum],
      );
      await client.query('COMMIT');
      hasLedger = true;
      log(`Applied ${migration.id}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new MigrationError(
        'MIGRATION_APPLY_FAILED',
        `${label}:${migration.id}:${error.message}`,
      );
    }
  }
}

async function rollbackLatest(
  client,
  directory,
  migrations,
  label,
  state,
  requestedId,
  log,
) {
  if (!state.ledgerExists || state.rows.length === 0) {
    throw new MigrationError('MIGRATION_ROLLBACK_NOTHING_APPLIED', label);
  }
  const latest = migrations[state.rows.length - 1];
  if (requestedId && requestedId !== latest.id) {
    throw new MigrationError(
      'MIGRATION_ROLLBACK_NOT_LATEST',
      `${label}:${requestedId}`,
    );
  }
  let sql;
  try {
    sql = await readFile(join(directory, `${latest.id}.down.sql`), 'utf8');
  } catch {
    throw new MigrationError(
      'MIGRATION_ROLLBACK_FILE_MISSING',
      `${label}:${latest.id}`,
    );
  }
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `DELETE FROM public.${MIGRATION_LEDGER} WHERE label = $1 AND version = $2`,
      [label, latest.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new MigrationError(
      'MIGRATION_ROLLBACK_FAILED',
      `${label}:${latest.id}:${error.message}`,
    );
  }
  log(`Rolled back ${latest.id}`);
}

export async function runMigrationCommand({
  databaseUrl,
  directory,
  label,
  manifest,
  command = 'up',
  json = false,
  requestedId,
  toId,
  log = console.log,
}) {
  if (!databaseUrl)
    throw new MigrationError('MIGRATION_DATABASE_URL_REQUIRED', label);
  if (!['up', 'status', 'plan', 'adopt', 'down'].includes(command)) {
    throw new MigrationError('MIGRATION_COMMAND_INVALID', command);
  }
  const migrations = await loadMigrationFiles({ directory, label, manifest });
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  let locked = false;
  try {
    await acquireLock(client);
    locked = true;
    let state = await inspectState(client, migrations, label);
    if (command === 'adopt') {
      await adopt(client, migrations, label, state, log);
      state = await inspectState(client, migrations, label);
    } else if (command === 'up') {
      await applyPending(client, migrations, label, state, log, toId);
      state = await inspectState(client, migrations, label);
    } else if (command === 'down') {
      await rollbackLatest(
        client,
        directory,
        migrations,
        label,
        state,
        requestedId,
        log,
      );
      state = await inspectState(client, migrations, label);
    }
    const status = publicStatus(label, migrations, state);
    if (command === 'status' || command === 'plan' || json) {
      log(
        json
          ? JSON.stringify(status)
          : formatStatus(status, command === 'plan'),
      );
    }
    if (state.adoptionRequired && command !== 'adopt') {
      throw new MigrationError('MIGRATION_ADOPTION_REQUIRED', label);
    }
    return status;
  } finally {
    if (locked) {
      try {
        await releaseLock(client);
      } catch {
        // Connection close also releases the session advisory lock.
      }
    }
    await client.end();
  }
}
