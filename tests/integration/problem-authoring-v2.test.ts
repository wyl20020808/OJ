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
const problemId = randomUUID();

afterAll(async () => {
  await pool.query('DELETE FROM problems WHERE id=$1', [problemId]);
  await pool.end();
});

describe('problem authoring V2 PostgreSQL persistence', () => {
  it('stores and reloads V2 content with server-ordered public samples', async () => {
    const created = await service.create(
      {
        id: problemId,
        slug: `authoring-v2-${problemId.slice(0, 8)}`,
        title: 'V2 fixture',
        background: 'Background',
        statement: 'Statement',
        inputDescription: 'Input',
        outputDescription: 'Output',
        constraints: 'n <= 10',
        notes: 'Hint',
        samples: [
          { ordinal: 8, input: '1', output: '2' },
          { ordinal: 2, input: '3', output: '4' },
        ],
        timeLimitMs: 1000,
        memoryLimitBytes: 1_048_576,
        visibility: 'private',
        difficulty: '简单',
        status: 'draft',
        testdataVersion: null,
      },
      { userId: 'author-v2' },
    );
    expect(created.samples.map((sample) => sample.ordinal)).toEqual([1, 2]);

    await service.update(
      created.id,
      { samples: [{ ordinal: 99, input: '5', output: '6' }] },
      { userId: 'author-v2' },
    );
    await expect(repository.get(created.id)).resolves.toMatchObject({
      background: 'Background',
      difficulty: '简单',
      samples: [{ ordinal: 1, input: '5', output: '6' }],
    });
  });
});
