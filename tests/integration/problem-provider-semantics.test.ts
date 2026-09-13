import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PostgresProblemRepository,
  ProblemService,
} from '../../apps/api/src/modules/problem/index.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { createDatabase } from '../../packages/database/src/index.js';

const pool = createDatabase({ url: loadConfig().databaseUrl }).pool;
const repository = new PostgresProblemRepository(pool);
const service = new ProblemService(repository, { can: () => true });
const codeforcesId = randomUUID();
const luoguId = randomUUID();

afterAll(async () => {
  await pool.query('DELETE FROM problems WHERE id = ANY($1::text[])', [
    [codeforcesId, luoguId],
  ]);
  await pool.end();
});

const input = {
  background: '',
  statement: 'Provider integration fixture.',
  inputDescription: 'Input.',
  outputDescription: 'Output.',
  constraints: 'n <= 10',
  notes: '',
  samples: [],
  timeLimitMs: 1000,
  memoryLimitBytes: 1_048_576,
  visibility: 'public' as const,
  difficulty: '简单' as const,
  status: 'published' as const,
  testdataVersion: null,
};

describe('problem provider PostgreSQL semantics', () => {
  it('persists provider metadata and filters it independently from sourceType', async () => {
    await service.create(
      {
        ...input,
        id: codeforcesId,
        slug: `provider-cf-${codeforcesId.slice(0, 8)}`,
        title: 'Codeforces provider fixture',
        sourceType: 'TEST_FIXTURE',
        provider: 'CODEFORCES',
        providerProblemId: 'CF_TEST_100A',
      },
      { userId: 'provider-integration-author' },
    );
    await service.create(
      {
        ...input,
        id: luoguId,
        slug: `provider-luogu-${luoguId.slice(0, 8)}`,
        title: 'Luogu provider fixture',
        sourceType: 'TEST_FIXTURE',
        provider: 'LUOGU',
        providerProblemId: 'P_TEST_1000',
      },
      { userId: 'provider-integration-author' },
    );

    const result = await service.list({
      limit: 20,
      provider: 'CODEFORCES',
      search: 'CF_TEST_100A',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: codeforcesId,
        sourceType: 'TEST_FIXTURE',
        provider: 'CODEFORCES',
        providerProblemId: 'CF_TEST_100A',
      }),
    ]);
    expect(result.facets.provider).toEqual({ CODEFORCES: 1 });

    const revision = await pool.query(
      'SELECT provider,provider_problem_id FROM problem_revisions WHERE problem_id=$1',
      [codeforcesId],
    );
    expect(revision.rows[0]).toMatchObject({
      provider: 'CODEFORCES',
      provider_problem_id: 'CF_TEST_100A',
    });
  });
});
