import { readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
const databaseUrl = process.env.JUDGE_DATABASE_URL;
if (!databaseUrl) throw new Error('JUDGE_DATABASE_URL is required');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const suffix = direction === 'down' ? '.down' : '';
  await client.query(
    await readFile(
      `packages/judge-runtime/migrations/0000_judge_service_boundary${suffix}.sql`,
      'utf8',
    ),
  );
  console.log(`judge service migration ${direction} PASS`);
} finally {
  await client.end();
}
