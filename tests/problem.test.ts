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
  it('creates, lists, updates, transitions and hides drafts', async () => {
    const repo = new InMemoryProblemRepository();
    const service = new ProblemService(repo, allow);
    const context = { userId: 'u1' };
    const created = await service.create(input, context);
    expect(created.testdataVersion).toBe('v1');
    expect((await service.list({ limit: 20, offset: 0 })).total).toBe(1);
    await service.update(created.id, { title: 'Updated' }, context);
    expect((await service.detail(created.slug)).title).toBe('Updated');
    await service.transition(created.id, { visibility: 'private' }, context);
    await expect(service.detail(created.id)).rejects.toThrow(
      'Problem not found',
    );
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
});
