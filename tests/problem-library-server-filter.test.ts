import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  InMemoryProblemRepository,
  InMemoryTagCatalogRepository,
  PostgresProblemRepository,
  ProblemService,
  registerProblemModule,
  type AuthorizationPolicy,
} from '../apps/api/src/modules/problem/index.js';

const allow: AuthorizationPolicy = { can: () => true };
const baseInput = {
  title: 'Problem',
  statement: 'x',
  inputDescription: 'x',
  outputDescription: 'x',
  constraints: 'x',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'public' as const,
  status: 'published' as const,
  testdataVersion: null,
};

describe('problem library server-side filters', () => {
  it('composes canonical filters across the full dataset with matching totals', async () => {
    const app = Fastify();
    const repository = new InMemoryProblemRepository();
    const catalog = new InMemoryTagCatalogRepository();
    const service = new ProblemService(
      repository,
      allow,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    await service.create(
      {
        ...baseInput,
        slug: 'outside-first-page',
        title: 'Binary tree medium',
        difficulty: '中等',
        sourceType: 'EXTERNAL',
        tagIds: [1, 24],
      },
      { userId: 'author' },
    );
    await service.create(
      {
        ...baseInput,
        slug: 'same-filter-second',
        title: 'Binary tree medium follow-up',
        difficulty: '中等',
        sourceType: 'EXTERNAL',
        tagIds: [1],
      },
      { userId: 'author' },
    );
    await service.create(
      {
        ...baseInput,
        slug: 'different-filter',
        title: 'Binary tree easy',
        difficulty: '简单',
        sourceType: 'IMPORT',
        tagIds: [2],
      },
      { userId: 'author' },
    );
    await registerProblemModule(app, {
      repository,
      tagCatalog: catalog,
      authorizationPolicy: allow,
      getAuthContext: () => undefined,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/problems?search=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&sourceType=EXTERNAL&limit=1',
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      items: [
        {
          slug: 'outside-first-page',
          statistics: { submissionCount: 0, acceptedCount: 0 },
        },
      ],
      page: { total: 2, limit: 1, offset: 0 },
    });

    const second = await app.inject({
      method: 'GET',
      url: '/api/problems?search=binary&difficulty=%E4%B8%AD%E7%AD%89&tagIds=1&sourceType=EXTERNAL&limit=1&offset=1',
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      items: [{ slug: 'same-filter-second' }],
      page: { total: 2, limit: 1, offset: 1 },
    });
    await app.close();
  });

  it('validates canonical filter inputs and rejects unknown tags', async () => {
    const app = Fastify();
    await registerProblemModule(app, {
      authorizationPolicy: allow,
      getAuthContext: () => undefined,
    });
    for (const sourceType of [
      'CREATOR',
      'EXTERNAL',
      'IMPORT',
      'TEST_FIXTURE',
      'API_AUTOMATION',
    ]) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/problems?sourceType=${sourceType}`,
          })
        ).statusCode,
      ).toBe(200);
    }
    for (const url of [
      '/api/problems?difficulty=unknown',
      '/api/problems?sourceType=unknown',
      '/api/problems?tagIds=1,2',
      '/api/problems?tagIds=999999',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('returns authoritative facets and applies whitelisted sorting before pagination', async () => {
    const app = Fastify();
    const repository = new InMemoryProblemRepository();
    const catalog = new InMemoryTagCatalogRepository();
    const service = new ProblemService(
      repository,
      allow,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    await service.create(
      {
        ...baseInput,
        slug: 'binary-alpha',
        title: 'Binary Alpha',
        difficulty: '简单',
        sourceType: 'IMPORT',
        tagIds: [1],
      },
      { userId: 'author' },
    );
    await service.create(
      {
        ...baseInput,
        slug: 'binary-zeta',
        title: 'Binary Zeta',
        difficulty: '中等',
        sourceType: 'EXTERNAL',
        tagIds: [1, 2],
      },
      { userId: 'author' },
    );
    await registerProblemModule(app, {
      repository,
      tagCatalog: catalog,
      authorizationPolicy: allow,
      getAuthContext: () => undefined,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/problems?search=binary&sort=title&order=desc&limit=1',
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      items: [{ slug: 'binary-zeta' }],
      page: { total: 2, offset: 0, limit: 1 },
      facets: {
        difficulty: { 简单: 1, 中等: 1 },
        sourceType: { IMPORT: 1, EXTERNAL: 1 },
      },
    });
    expect(first.json().facets.tags).toEqual(
      expect.arrayContaining([
        { id: 1, count: 2 },
        { id: 2, count: 1 },
      ]),
    );

    const second = await app.inject({
      method: 'GET',
      url: '/api/problems?search=binary&sort=title&order=desc&limit=1&offset=1',
    });
    expect(second.statusCode).toBe(200);
    expect(
      second.json().items.map((item: { slug: string }) => item.slug),
    ).toEqual(['binary-alpha']);

    for (const url of [
      '/api/problems?sort=unsupported',
      '/api/problems?order=sideways',
    ])
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    await app.close();
  });

  it('qualifies PostgreSQL search fields and maps real submission aggregates', async () => {
    const queries: string[] = [];
    const repository = new PostgresProblemRepository({
      query: async (text: string) => {
        queries.push(text);
        if (queries.length === 1) return { rows: [{ total: 1 }] };
        return {
          rows: [
            {
              id: 'aggregate-problem',
              public_number: 7,
              slug: 'aggregate-problem',
              title: 'Aggregate problem',
              statement: 'statement',
              input_description: 'input',
              output_description: 'output',
              examples: [],
              constraints: 'constraints',
              notes: '',
              time_limit_ms: 1000,
              memory_limit_bytes: 1024,
              visibility: 'public',
              status: 'published',
              difficulty: '中等',
              testdata_version: null,
              author_id: 'author',
              source_type: 'TEST_FIXTURE',
              tags: [],
              tag_details: [],
              submission_count: 20,
              accepted_count: 13,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        };
      },
    });

    const result = await repository.list({
      limit: 20,
      publicOnly: true,
      search: 'aggregate',
    });

    expect(queries[1]).toContain('p.slug ILIKE');
    expect(queries[1]).toContain('p.statement ILIKE');
    expect(result.items[0]?.statistics).toEqual({
      submissionCount: 20,
      acceptedCount: 13,
    });
  });
});
