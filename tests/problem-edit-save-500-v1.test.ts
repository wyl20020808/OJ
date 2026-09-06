import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemoryProblemRepository,
  PostgresProblemRepository,
  ProblemService,
  registerProblemModule,
  type AuthorizationPolicy,
} from '../apps/api/src/modules/problem/index.js';

const input = {
  slug: 'edit-save-fixture',
  title: 'Original title',
  statement: 'Original **statement**',
  inputDescription: 'Input',
  outputDescription: 'Output',
  constraints: 'n <= 10',
  notes: '',
  samples: [{ input: '1', output: '2' }],
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'private' as const,
  status: 'draft' as const,
  testdataVersion: null,
  tags: ['math'],
};

const allow: AuthorizationPolicy = { can: () => true };

describe('problem edit save V1', () => {
  it('persists title, Markdown, formats, tags, samples and reloads them', async () => {
    const repository = new InMemoryProblemRepository();
    const service = new ProblemService(repository, allow);
    const created = await service.create(input, { userId: 'author' });
    await service.update(
      created.id,
      {
        title: 'Updated title',
        statement: 'Updated **Markdown**',
        inputDescription: 'Updated input',
        outputDescription: 'Updated output',
        tags: ['graphs', 'dp'],
        samples: [{ input: '3', output: '4' }],
      },
      { userId: 'author' },
    );
    await expect(repository.get(created.publicId)).resolves.toMatchObject({
      publicId: created.publicId,
      title: 'Updated title',
      statement: 'Updated **Markdown**',
      inputDescription: 'Updated input',
      outputDescription: 'Updated output',
      tags: ['graphs', 'dp'],
      samples: [{ ordinal: 1, input: '3', output: '4' }],
      authorId: 'author',
    });
  });

  it('returns 4xx for invalid payload and unauthorized edit', async () => {
    const repository = new InMemoryProblemRepository();
    const created = await new ProblemService(repository, allow).create(
      input,
      { userId: 'owner' },
    );
    const app = Fastify();
    await registerProblemModule(app, {
      repository,
      getAuthContext: (request) =>
        request.headers['x-user']
          ? { userId: String(request.headers['x-user']), sessionId: 's' }
          : undefined,
      authorizationPolicy: {
        can: (_action, _resource, context) => context?.userId === 'owner',
      },
    });
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/problems/${created.id}`,
      headers: {
        cookie: 'oj_csrf=t',
        'x-csrf-token': 't',
        'x-user': 'owner',
      },
      payload: { tags: 'not-an-array' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe('VALIDATION_ERROR');
    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/problems/${created.id}`,
      headers: {
        cookie: 'oj_csrf=t',
        'x-csrf-token': 't',
        'x-user': 'other',
      },
      payload: { title: 'leak' },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it('maps samples payload to Postgres examples JSONB and keeps tag update atomic', async () => {
    const row = {
      id: 'p1',
      public_number: 1,
      slug: input.slug,
      title: input.title,
      background: '',
      statement: input.statement,
      input_description: input.inputDescription,
      output_description: input.outputDescription,
      examples: [{ input: '1', output: '2' }],
      constraints: input.constraints,
      notes: '',
      time_limit_ms: 1000,
      memory_limit_bytes: 1024,
      visibility: 'private',
      difficulty: null,
      status: 'draft',
      testdata_version: null,
      author_id: 'author',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      tags: ['math'],
    };
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      async query(text: string, values?: unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        if (text.startsWith('SELECT p.*')) return { rows: [row] };
        if (text.startsWith('UPDATE problems')) {
          const examples = JSON.parse(String(values?.[0]));
          return { rows: [{ ...row, examples, updated_at: '2026-01-02T00:00:00.000Z' }] };
        }
        return { rows: [] };
      },
    };
    const repository = new PostgresProblemRepository(pool);
    const updated = await repository.update('p1', {
      samples: [{ ordinal: 9, input: '3', output: '4' }],
      tags: ['graphs'],
    });
    expect(updated.samples).toEqual([{ ordinal: 9, input: '3', output: '4' }]);
    expect(calls.some((call) => call.text.startsWith('BEGIN'))).toBe(false);
    expect(calls.find((call) => call.text.startsWith('UPDATE problems'))?.values?.[0]).toBe(
      JSON.stringify([{ ordinal: 9, input: '3', output: '4' }]),
    );
    expect(calls.some((call) => call.text.startsWith('DELETE FROM problem_tags'))).toBe(true);
  });

  it('binds published revision INSERT with matching parameter count', async () => {
    const row = {
      id: 'published-1',
      public_number: 7,
      slug: input.slug,
      title: input.title,
      background: '',
      statement: input.statement,
      input_description: input.inputDescription,
      output_description: input.outputDescription,
      examples: [{ input: '1', output: '2' }],
      constraints: input.constraints,
      notes: '',
      time_limit_ms: 1000,
      memory_limit_bytes: 1024,
      visibility: 'public',
      difficulty: null,
      status: 'published',
      testdata_version: null,
      author_id: 'author',
      current_revision_id: 'revision-1',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      tags: [],
    };
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      async query(text: string, values?: unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        if (text.startsWith('SELECT p.*')) return { rows: [row] };
        if (text.startsWith('SELECT * FROM problem_revisions')) return { rows: [] };
        return { rows: [] };
      },
    };
    const repository = new PostgresProblemRepository(pool);
    await repository.createRevision('published-1', { title: 'Draft title' }, 'editor');
    const insert = calls.find((call) => call.text.startsWith('INSERT INTO problem_revisions'))!;
    expect(insert.text).not.toContain('$22');
    expect(insert.values).toHaveLength(21);
  });
});
