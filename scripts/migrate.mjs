import { readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform', connectionTimeoutMillis: 3000 });
await client.connect();
try {
  const file = direction === 'down' ? 'packages/database/migrations/0000_platform_metadata.down.sql' : 'packages/database/migrations/0000_platform_metadata.sql';
  await client.query(await readFile(file, 'utf8'));
  console.log(`migration ${direction} PASS`);
} finally { await client.end(); }
