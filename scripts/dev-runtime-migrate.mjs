import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.RUNTIME_MIGRATION_DATABASE_URL;
const directory = process.env.RUNTIME_MIGRATION_DIRECTORY;
const label = process.env.RUNTIME_MIGRATION_LABEL;
if (!url || !directory || !label)
  throw new Error('RUNTIME_MIGRATION_DATABASE_URL, DIRECTORY and LABEL are required');

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _ojplatform_runtime_migrations (
      label text NOT NULL,
      version text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (label, version)
    )
  `);
  const files = (await readdir(directory))
    .filter((file) => /^\d+_.+\.sql$/.test(file) && !file.endsWith('.down.sql'))
    .sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = await readFile(`${directory}/${file}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'SELECT checksum FROM _ojplatform_runtime_migrations WHERE label=$1 AND version=$2',
      [label, version],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${label}:${version}`);
      console.log(`migration ${label}/${version} REUSE`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO _ojplatform_runtime_migrations(label,version,checksum) VALUES ($1,$2,$3)',
        [label, version, checksum],
      );
      await client.query('COMMIT');
      console.log(`migration ${label}/${version} APPLY`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(`migration ${label} PASS (${files.length} versions checked)`);
} finally {
  await client.end();
}
