import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerProfileModule } from '../apps/api/src/modules/profile/index.js';

const profile = {
  id: 'user-1',
  username: 'ada',
  display_name: 'Ada',
  created_at: '2026-01-01T00:00:00Z',
};

async function appFor(authUserId?: string) {
  const sql: string[] = [];
  const app = Fastify();
  await registerProfileModule(app, {
    getAuth: async () =>
      authUserId ? { userId: authUserId, strength: 'password' } : undefined,
    pool: {
      query: async (statement: string) => {
        sql.push(statement);
        if (statement.includes('FROM users WHERE username'))
          return { rows: [profile] };
        if (statement.includes('created_problem_count'))
          return {
            rows: [
              {
                created_problem_count: 2,
                solved_problem_count: 1,
                submission_count: 3,
                accepted_submission_count: 1,
              },
            ],
          };
        if (statement.includes('max(se.completed_at)'))
          return {
            rows: [
              {
                id: 'p1',
                slug: 'two-sum',
                title: 'Two Sum',
                accepted_at: '2026-02-01T00:00:00Z',
                source: 'must-not-leak',
              },
            ],
          };
        if (statement.includes('count(DISTINCT s.problem_id)'))
          return { rows: [{ total: 1 }] };
        if (statement.includes('problem_favorites'))
          return { rows: [{ count: 4 }] };
        return { rows: [] };
      },
    },
  });
  return { app, sql };
}

describe('Profile Navigation Product V1', () => {
  it('projects self-only counts and an authoritative solved list without source', async () => {
    const { app } = await appFor('user-1');
    const overview = await app.inject('/api/profiles/ada/overview');
    const solved = await app.inject('/api/profiles/ada/solved?limit=20');

    expect(overview.json()).toMatchObject({
      createdProblemCount: 2,
      solvedProblemCount: 1,
      favoriteCount: 4,
    });
    expect(solved.json()).toEqual({
      items: [
        {
          problemId: 'p1',
          slug: 'two-sum',
          title: 'Two Sum',
          lastAcceptedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      page: { limit: 20, total: 1 },
    });
    await app.close();
  });

  it('keeps public profile projections constrained to published public problems', async () => {
    const { app, sql } = await appFor();
    const response = await app.inject('/api/profiles/ada/overview');

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('favoriteCount');
    expect(
      sql.find((statement) => statement.includes('created_problem_count')),
    ).toContain("p.visibility='public' AND p.status='published'");
    await app.close();
  });

  it('returns 365-day public activity aggregates without submission details', async () => {
    const sql: string[] = [];
    const app = Fastify();
    await registerProfileModule(app, {
      getAuth: async () => undefined,
      pool: {
        query: async (statement: string) => {
          sql.push(statement);
          if (statement.includes('FROM users WHERE username'))
            return { rows: [profile] };
          if (statement.includes('generate_series'))
            return {
              rows: Array.from({ length: 365 }, (_, index) => ({
                date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
                submission_count: index === 364 ? 3 : 0,
                accepted_count: index === 364 ? 2 : 0,
                source: 'must-not-leak',
              })),
            };
          return { rows: [] };
        },
      },
    });
    const response = await app.inject('/api/profiles/ada/activity');
    expect(response.statusCode).toBe(200);
    expect(response.json().days).toHaveLength(365);
    expect(response.json().days.at(-1)).toEqual({
      date: '2026-01-01',
      submissionCount: 3,
      acceptedCount: 2,
    });
    expect(response.json().days.at(-1)).not.toHaveProperty('source');
    expect(
      sql.find((statement) => statement.includes('generate_series')),
    ).toContain("p.visibility='public' AND p.status='published'");
    await app.close();
  });
});
