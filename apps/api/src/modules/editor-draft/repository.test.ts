import { describe, expect, it } from 'vitest';
import { EditorDraftConflictError } from './model.js';
import { InMemoryEditorDraftRepository } from './repository.js';

describe('editor draft repository', () => {
  it('supports isolation, no-op identical writes, and stale conflicts', async () => {
    const repository = new InMemoryEditorDraftRepository();
    const first = await repository.save({
      userId: 'u1',
      problemId: 'p1',
      language: 'cpp20',
      source: 'a',
    });
    const same = await repository.save({
      userId: 'u1',
      problemId: 'p1',
      language: 'cpp20',
      source: 'a',
      expectedVersion: 1,
    });
    expect(same.version).toBe(1);
    expect(await repository.get('u2', 'p1', 'cpp20')).toBeUndefined();
    await expect(
      repository.save({
        userId: 'u1',
        problemId: 'p1',
        language: 'cpp20',
        source: 'b',
        expectedVersion: first.version - 1,
      }),
    ).rejects.toBeInstanceOf(EditorDraftConflictError);
  });
});
