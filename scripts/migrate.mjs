import { readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform',
  connectionTimeoutMillis: 3000,
});
await client.connect();
try {
  const migrations = [
    '0000_platform_metadata',
    '0001_auth_foundation',
    '0002_problem_foundation',
    '0003_authz_foundation',
    '0004_problem_authoring_revision',
  ];
  const ordered = direction === 'down' ? [...migrations].reverse() : migrations;
  for (const name of ordered) {
    const file = `packages/database/migrations/${name}${direction === 'down' ? '.down' : ''}.sql`;
    await client.query(await readFile(file, 'utf8'));
  }
  console.log(`migration ${direction} PASS`);
} finally {
  await client.end();
}
