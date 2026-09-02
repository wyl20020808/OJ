import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemoryProblemRepository,
  ProblemService,
  registerProblemModule,
  type AuthorizationPolicy,
} from '../apps/api/src/modules/problem/index.js';

const input = {
  slug: 'sum-two',
  title: 'Sum Two',
  statement: 'Add values',
  inputDescription: 'Two ints',
  outputDescription: 'One int',
  examples: [{ input: '1 2', output: '3' }],
  constraints: '1..10',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'public' as const,
  status: 'published' as const,
  testdataVersion: 'v1',
};
const allow: AuthorizationPolicy = { can: () => true };

describe('problem foundation', () => {
  it('preserves published snapshots when editing and orders revisions', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    const context = { userId: 'u1' };
    const created = await service.create(input, context);
    await service.update(created.id, { title: 'Draft title' }, context);
    const revisions = await repo.revisions(created.id);
    expect(revisions.map((revision) => revision.revisionNumber)).toEqual([
      1, 2,
    ]);
    expect(revisions[0]?.title).toBe('Sum Two');
    expect((await repo.get(created.id))?.title).toBe('Sum Two');
    await expect(
      service.transition(created.id, { status: 'draft' }, context),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('enforces ownership through the public policy boundary', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    const created = await service.create(
      { ...input, status: 'draft', visibility: 'private' },
      { userId: 'owner' },
    );
    await expect(
      service.update(created.id, { title: 'Nope' }, { userId: 'other' }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      service.history(created.id, { userId: 'other' }),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('creates, lists, updates, transitions and hides drafts', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    const context = { userId: 'u1' };
    const created = await service.create(input, context);
    expect(created.testdataVersion).toBe('v1');
    expect((await service.list({ limit: 20, offset: 0 })).total).toBe(1);
    await service.update(created.id, { title: 'Updated' }, context);
    expect((await service.detail(created.slug)).title).toBe('Sum Two');
    await service.transition(created.id, { visibility: 'private' }, context);
    await expect(service.detail(created.id)).rejects.toThrow(
      'Problem not found',
    );
  });
  it('publishes the current revision with the problem', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    const created = await service.create(
      { ...input, status: 'draft', visibility: 'private' },
      { userId: 'u1' },
    );
    await service.transition(
      created.id,
      { status: 'published', visibility: 'public' },
      { userId: 'u1' },
    );
    const current = (await repo.revisions(created.id)).find(
      (revision) => revision.revisionId === created.currentRevisionId,
    );
    expect(current).toMatchObject({
      status: 'published',
      visibility: 'public',
    });
  });
  it('rejects malformed and duplicate input', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    await expect(
      service.create({ ...input, slug: 'Bad Slug' }, { userId: 'u1' }),
    ).rejects.toThrow('validation');
    await service.create(input, { userId: 'u1' });
    await expect(service.create(input, { userId: 'u1' })).rejects.toThrow(
      'already exists',
    );
  });
  it('serves the documented API error and pagination contract', async () => {
    const app = Fastify();
    await registerProblemModule(app, {
      authorizationPolicy: allow,
      getAuthContext: () => ({ userId: 'u1' }),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/problems?limit=0',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      requestId: expect.any(String),
    });
    await app.close();
  });

  it('serves real product data for home and problemset search/filter pagination', async () => {
    const app = Fastify();
    const repository = new InMemoryProblemRepository();
    const service = new ProblemService(repository, allow);
    await service.create(input, { userId: 'u1' });
    await service.create(
      { ...input, slug: 'multiply-two', title: 'Multiply Two' },
      { userId: 'u1' },
    );
    await registerProblemModule(app, {
      repository,
      authorizationPolicy: allow,
      getAuthContext: () => undefined,
    });
    const home = await app.inject({ method: 'GET', url: '/api/home' });
    expect(home.statusCode).toBe(200);
    expect(home.json().recentProblems).toHaveLength(2);
    expect(home.json()).not.toHaveProperty('rating');
    const search = await app.inject({
      method: 'GET',
      url: '/api/problems?search=multiply&limit=1',
    });
    expect(search.statusCode).toBe(200);
    expect(
      search.json().items.map((item: { slug: string }) => item.slug),
    ).toEqual(['multiply-two']);
    expect(search.json().items[0].currentRevisionId).toBeTruthy();
    await app.close();
  });
});
