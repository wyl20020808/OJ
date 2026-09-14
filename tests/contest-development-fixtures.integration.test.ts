import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../packages/database/src/index.js';

const execFileAsync = promisify(execFile);
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform';
const pool = createDatabase({ url: databaseUrl }).pool;
const scenario = 'CONTEST_FULL_EXPERIENCE_V1';
const problemPrefix = `contest-development-source-${randomUUID()}`;
const problemIds = Array.from(
  { length: 8 },
  (_, index) => `${problemPrefix}-${index + 1}`,
);

async function fixture(...args: string[]) {
  return execFileAsync(
    process.execPath,
    ['scripts/seed-contest-development-fixtures.mjs', ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        OJPLATFORM_DEVELOPMENT_FIXTURES: 'true',
      },
      timeout: 60_000,
    },
  );
}

beforeAll(async () => {
  await pool.query(
    await readFile(
      'packages/database/migrations/0036_contest_development_provenance.sql',
      'utf8',
    ),
  );
  for (const [index, id] of problemIds.entries()) {
    await pool.query(
      `INSERT INTO problems(id,slug,title,statement,input_description,output_description,constraints,time_limit_ms,memory_limit_bytes,visibility,status,provenance)
       VALUES($1,$2,$3,'Development fixture statement.','stdin','stdout','n <= 1000',1000,268435456,'public','published',$4::jsonb)`,
      [
        id,
        id,
        `Contest source problem ${index + 1}`,
        JSON.stringify({
          kind: 'DEVELOPMENT_FIXTURE',
          scenario: 'CONTEST_FIXTURE_TEST_SOURCE',
        }),
      ],
    );
  }
});

afterAll(async () => {
  try {
    await fixture('--cleanup');
  } finally {
    await pool.query('DELETE FROM problems WHERE id=ANY($1::text[])', [
      problemIds,
    ]);
    await pool.end();
  }
});

describe.sequential('Contest development fixture against PostgreSQL', () => {
  it('requires an explicit development switch', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        ['scripts/seed-contest-development-fixtures.mjs'],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: databaseUrl },
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Set OJPLATFORM_DEVELOPMENT_FIXTURES=true',
      ),
    });
  });

  it('seeds deterministic relations, preserves non-fixture data, and cleans only its provenance', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS count FROM contests
       WHERE provenance IS NULL OR provenance->>'scenario'<>$1`,
      [scenario],
    );
    await fixture('--cleanup');
    const first = await fixture();
    expect(first.stdout).toContain('24 contests');

    const distribution = await pool.query(
      `SELECT
         count(*) FILTER (WHERE starts_at<=now() AND ends_at>now())::int AS running,
         count(*) FILTER (WHERE starts_at>now())::int AS upcoming,
         count(*) FILTER (WHERE ends_at<=now())::int AS ended
       FROM contests
       WHERE provenance->>'kind'='DEVELOPMENT_FIXTURE'
         AND provenance->>'scenario'=$1`,
      [scenario],
    );
    expect(distribution.rows[0]).toEqual({
      running: 3,
      upcoming: 6,
      ended: 15,
    });

    const relations = await pool.query(
      `SELECT c.id,
         count(DISTINCT cp.problem_id)::int AS problem_count,
         count(DISTINCT cr.user_id)::int AS participant_count
       FROM contests c
       JOIN contest_problems cp ON cp.contest_id=c.id
       JOIN contest_registrations cr ON cr.contest_id=c.id AND cr.status='ACTIVE'
       WHERE c.provenance->>'scenario'=$1
       GROUP BY c.id`,
      [scenario],
    );
    expect(relations.rowCount).toBe(24);
    expect(relations.rows.every((row) => row.problem_count >= 4)).toBe(true);
    expect(relations.rows.every((row) => row.participant_count >= 82)).toBe(
      true,
    );

    await fixture();
    expect(
      await pool.query(
        `SELECT count(*)::int AS count FROM contests
         WHERE provenance->>'scenario'=$1`,
        [scenario],
      ),
    ).toMatchObject({ rows: [{ count: 24 }] });

    await fixture('--cleanup');
    expect(
      await pool.query(
        `SELECT count(*)::int AS count FROM contests
         WHERE provenance->>'scenario'=$1`,
        [scenario],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] });
    expect(
      await pool.query(
        `SELECT count(*)::int AS count FROM contests
         WHERE provenance IS NULL OR provenance->>'scenario'<>$1`,
        [scenario],
      ),
    ).toMatchObject({ rows: before.rows });
  });
});
