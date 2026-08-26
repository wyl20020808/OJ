import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type DatabaseConfig = { url: string; connectionTimeoutMs?: number };

export function createDatabase(config: DatabaseConfig) {
  const pool = new pg.Pool({
    connectionString: config.url,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 1500,
    max: 5,
  });
  return { pool, db: drizzle(pool) };
}

export async function checkDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('select 1');
}
