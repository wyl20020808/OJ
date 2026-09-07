import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemoryProblemRepository,
  InMemoryTagCatalogRepository,
  ProblemService,
  registerProblemModule,
  type AuthorizationPolicy,
} from '../apps/api/src/modules/problem/index.js';

const allow: AuthorizationPolicy = { can: () => true };
const input = {
  slug: 'tagged-problem',
  title: 'Tagged',
  statement: 'x',
  inputDescription: 'x',
  outputDescription: 'x',
  constraints: 'x',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'private' as const,
  status: 'draft' as const,
  testdataVersion: null,
};

describe('problem tag catalog', () => {
  it('returns active tags in deterministic category/order sequence', async () => {
    const catalog = new InMemoryTagCatalogRepository();
    const tags = await catalog.list();
    expect(tags.length).toBeGreaterThan(50);
    expect(tags[0]).toMatchObject({
      category: '基础算法',
      displayOrder: 0,
      isActive: true,
    });
    expect(tags.map((tag) => tag.id)).toEqual(
      [...tags].sort((a, b) => a.id - b.id).map((tag) => tag.id),
    );
  });

  it('persists selected catalog IDs and rejects unknown IDs', async () => {
    const catalog = new InMemoryTagCatalogRepository();
    const service = new ProblemService(
      new InMemoryProblemRepository(),
      allow,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    const created = await service.create(
      { ...input, tagIds: [1, 24] },
      { userId: 'u1' },
    );
    expect(created.tags).toEqual(['枚举', '最短路']);
    expect(created.tagDetails?.map((tag) => tag.slug)).toEqual([
      'enumeration',
      'shortest-path',
    ]);
    await expect(
      service.update(created.id, { tagIds: [999999] }, { userId: 'u1' }),
    ).rejects.toThrow('INVALID_TAGS');
  });

  it('serves catalog endpoint and keeps problem API compatibility tags', async () => {
    const app = Fastify();
    const repository = new InMemoryProblemRepository();
    await registerProblemModule(app, {
      repository,
      authorizationPolicy: allow,
      getAuthContext: () => ({ userId: 'u1' }),
    });
    const catalog = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()[0]).toMatchObject({
      slug: 'enumeration',
      category: '基础算法',
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/problems',
      headers: { 'x-csrf-token': 'csrf', cookie: 'oj_csrf=csrf' },
      payload: { ...input, tagIds: [1] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      tags: ['枚举'],
      tagDetails: [{ slug: 'enumeration' }],
    });
    await app.close();
  });
});
