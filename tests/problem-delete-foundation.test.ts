import { describe, expect, it } from 'vitest';
import { InMemoryProblemRepository } from '../apps/api/src/modules/problem/repository.js';
import { ProblemService } from '../apps/api/src/modules/problem/service.js';

const input = {
  slug: 'delete-me',
  title: 'Delete me',
  background: '',
  statement: 'x',
  inputDescription: 'x',
  outputDescription: 'x',
  constraints: 'x',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'private' as const,
  status: 'draft' as const,
  difficulty: null,
  testdataVersion: null,
  samples: [],
  examples: [],
  tags: [],
};
const context = { userId: 'author', sessionId: 's', strength: 'password' };

describe('problem deletion foundation', () => {
  it('tombstones, filters, preserves history, and is idempotent', async () => {
    const repository = new InMemoryProblemRepository();
    const policy = {
      can: async (action: string) => action === 'delete' || action === 'read',
    };
    const service = new ProblemService(repository, policy);
    const created = await repository.create({ ...input, authorId: 'author' });
    const deleted = await service.delete(
      created.id,
      { reason: 'fixture cleanup', expectedUpdatedAt: created.updatedAt },
      context,
    );
    expect(deleted.deleteReason).toBe('fixture cleanup');
    expect(deleted.deletedBy).toBe('author');
    expect((await repository.list({ limit: 20 })).items).toHaveLength(0);
    await expect(service.detail(created.id, context)).rejects.toThrow(
      'Problem not found',
    );
    expect(
      await service.delete(
        created.id,
        { reason: 'repeat', expectedUpdatedAt: 'stale' },
        context,
      ),
    ).toEqual(deleted);
    expect(await repository.revisions(created.id)).toHaveLength(1);
  });

  it('rejects stale optimistic delete', async () => {
    const repository = new InMemoryProblemRepository();
    const service = new ProblemService(repository, { can: async () => true });
    const created = await repository.create({ ...input, authorId: 'author' });
    await expect(
      service.delete(
        created.id,
        { reason: 'x', expectedUpdatedAt: 'stale' },
        context,
      ),
    ).rejects.toThrow('stale');
  });
});
