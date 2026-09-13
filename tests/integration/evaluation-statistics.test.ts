import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PostgresSubmissionRepository } from '../../apps/api/src/modules/submission/repository.js';
import { createDatabase } from '../../packages/database/src/index.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('Evaluation statistics PostgreSQL query', () => {
  const database = createDatabase({ url: databaseUrl! });
  const connect = () => database.pool.connect();
  let client: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    client = await connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE submissions (
        id text PRIMARY KEY,
        owner_user_id text NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE TEMP TABLE submission_evaluations (
        submission_id text NOT NULL,
        current boolean NOT NULL,
        status text NOT NULL,
        verdict text
      );
      SET LOCAL search_path TO pg_temp;
      WITH clock AS (
        SELECT date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' AS today
      )
      INSERT INTO submissions
      SELECT * FROM (VALUES
        ('today-ac','u1',(SELECT today FROM clock) + interval '1 hour'),
        ('today-wa','u2',(SELECT today FROM clock) + interval '2 hours'),
        ('today-running','u2',(SELECT today FROM clock) + interval '3 hours'),
        ('yesterday-re','u1',(SELECT today FROM clock) - interval '1 day' + interval '1 hour')
      ) AS rows(id,owner_user_id,created_at);
      INSERT INTO submission_evaluations VALUES
        ('today-ac',true,'COMPLETED_WITH_VERDICT','AC'),
        ('today-wa',true,'COMPLETED_WITH_VERDICT','WA'),
        ('today-running',true,'RUNNING',NULL),
        ('yesterday-re',true,'COMPLETED_WITH_VERDICT','RE');
    `);
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  afterAll(() => database.pool.end());

  it('aggregates totals, verdicts, active users, deltas, and seven-day trend', async () => {
    const repository = new PostgresSubmissionRepository({
      query: (text, values) => client.query(text, values),
    });
    const result = await repository.statistics();

    expect(result).toMatchObject({
      total: 4,
      accepted: 1,
      failed: 2,
      judging: 1,
      passRate: 25,
      today: {
        submissions: 3,
        accepted: 1,
        activeUsers: 2,
        submissionDeltaPercent: 200,
        activeUserDeltaPercent: 100,
      },
      verdicts: { AC: 1, WA: 1, RE: 1, CE: 0, TLE: 0, MLE: 0 },
    });
    expect(result.trend).toHaveLength(7);
    expect(result.trend.at(-1)).toMatchObject({
      total: 3,
      accepted: 1,
      failed: 1,
    });
  });
});
