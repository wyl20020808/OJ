import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
const databaseUrl = process.env.JUDGE_DATABASE_URL;
if (!databaseUrl) throw new Error('JUDGE_DATABASE_URL is required');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const migrations = (await readdir('packages/judge-runtime/migrations'))
    .filter((file) =>
      direction === 'down'
        ? file.endsWith('.down.sql')
        : file.endsWith('.sql') && !file.endsWith('.down.sql'),
    )
    .sort();
  for (const migration of direction === 'down'
    ? migrations.reverse()
    : migrations)
    await client.query(
      await readFile(`packages/judge-runtime/migrations/${migration}`, 'utf8'),
    );
  console.log(`judge service migration ${direction} PASS`);
} finally {
  await client.end();
}
