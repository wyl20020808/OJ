import { describe, expect, it } from 'vitest';
import {
  InMemoryProblemRepository,
  ProblemService,
  type AuthorizationPolicy,
} from '../apps/api/src/modules/problem/index.js';
import { InMemorySubmissionRepository } from '../apps/api/src/modules/submission/index.js';
import { publicSubmissionEvaluation } from '../apps/api/src/modules/submission/outcome.js';
import { readFile } from 'node:fs/promises';

const allow: AuthorizationPolicy = { can: () => true };
const input = {
  slug: 'metadata-fixture',
  title: 'Metadata fixture',
  statement: 'Statement',
  inputDescription: 'Input',
  outputDescription: 'Output',
  examples: [],
  constraints: 'n',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'private' as const,
  status: 'draft' as const,
  testdataVersion: null,
};

describe('public metadata', () => {
  it('allocates immutable public problem ids and normalizes tags', async () => {
    const repository = new InMemoryProblemRepository();
    const service = new ProblemService(repository, allow);
    const first = await service.create(
      { ...input, tags: [' DP ', 'Graphs'] },
      { userId: 'u1' },
    );
    const second = await service.create(
      { ...input, slug: 'metadata-fixture-2' },
      { userId: 'u1' },
    );
    expect(first).toMatchObject({
      publicNumber: 1,
      publicId: 'P0001',
      tags: ['DP', 'Graphs'],
    });
    expect(second).toMatchObject({ publicNumber: 2, publicId: 'P0002' });
    await expect(repository.get('P0001')).resolves.toMatchObject({
      id: first.id,
    });
    await expect(
      service.update(first.id, { tags: ['dp', 'DP'] }, { userId: 'u1' }),
    ).rejects.toThrow('validation');
    await expect(
      service.update(
        first.id,
        { tags: ['Dynamic Programming'] },
        { userId: 'u1' },
      ),
    ).resolves.toMatchObject({ publicId: 'P0001' });
  });

  it('allocates evaluation public numbers from zero and exposes them', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create({
      ownerUserId: 'u1',
      problemId: 'p1',
      problemRevisionId: 'r1',
      testdataVersionRef: 't1',
      languageId: 'cpp20',
      source: 'int main(){}',
    });
    const evaluation = await repository.beginEvaluation!(
      submission.id,
      'job-1',
    );
    expect(evaluation.publicNumber).toBe(0);
    expect(publicSubmissionEvaluation(evaluation)).toMatchObject({
      publicNumber: 0,
    });
  });

  it('keeps metadata migration isolated and sequence-backed', async () => {
    const sql = await readFile(
      'packages/database/migrations/0018_problem_public_metadata.sql',
      'utf8',
    );
    expect(sql).toContain('problems_public_number_seq');
    expect(sql).toContain('submission_evaluations_public_number_seq');
    expect(sql).not.toMatch(/MAX\s*\(\s*public_number\s*\)\s*\+\s*1\s+AS/i);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS tags');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS problem_tags');
  });
});
