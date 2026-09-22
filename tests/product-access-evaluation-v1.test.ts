import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import {
  InMemorySubmissionRepository,
  registerSubmissionModule,
} from '../apps/api/src/modules/submission/index.js';

const cookies = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map(String)
    .map((item) => item.split(';', 1)[0] ?? '');
};
const requestHeaders = (values: string[]) => ({
  cookie: values.join('; '),
  'x-csrf-token':
    values
      .find((value) => value.startsWith('oj_csrf='))
      ?.slice('oj_csrf='.length) ?? '',
});
const problem = (slug: string) => ({
  slug,
  title: slug,
  statement: 'Statement',
  inputDescription: 'Input',
  outputDescription: 'Output',
  examples: [],
  constraints: 'Constraints',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  visibility: 'public' as const,
  status: 'published' as const,
  testdataVersion: 'data-v1',
});

async function registerAndLogin(
  app: Awaited<ReturnType<typeof buildApp>>,
  username: string,
) {
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username,
      email: `${username}@example.test`,
      displayName: username,
      password: 'correct-horse-battery-staple',
    },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identity: username, password: 'correct-horse-battery-staple' },
  });
  return {
    id: registration.json().id as string,
    headers: requestHeaders(cookies(login)),
  };
}

describe('Product Access & Evaluation V1', () => {
  it('projects problem edit capability for guest owners, owners, non-owners, and privileged editors', async () => {
    const permissions = new Map<string, ReadonlySet<string>>();
    const app = await buildApp({
      logger: false,
      judgeAdminPermissions: permissions,
    });
    try {
      const guest = await app.inject({
        method: 'POST',
        url: '/api/auth/guest/continue',
        payload: {},
      });
      const guestProblem = await app.inject({
        method: 'POST',
        url: '/api/problems',
        headers: requestHeaders(cookies(guest)),
        payload: {
          ...problem('guest-owned'),
          visibility: 'private',
          status: 'draft',
        },
      });
      expect(guestProblem.statusCode).toBe(201);
      const guestDetail = await app.inject({
        method: 'GET',
        url: `/api/problems/${guestProblem.json().id as string}`,
        headers: requestHeaders(cookies(guest)),
      });
      expect(guestDetail.json().capabilities).toEqual({ canEdit: true });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/problems/${guestProblem.json().id as string}`,
          })
        ).statusCode,
      ).toBe(404);

      const owner = await registerAndLogin(app, 'owner-v1');
      const created = await app.inject({
        method: 'POST',
        url: '/api/problems',
        headers: owner.headers,
        payload: problem('shared-v1'),
      });
      expect(created.statusCode).toBe(201);
      const problemId = created.json().id as string;
      const anonymousPublic = await app.inject({
        method: 'GET',
        url: `/api/problems/${problemId}`,
      });
      expect(anonymousPublic.statusCode).toBe(200);
      const ownerDetail = await app.inject({
        method: 'GET',
        url: `/api/problems/${problemId}`,
        headers: owner.headers,
      });
      expect(ownerDetail.json().capabilities).toEqual({ canEdit: true });

      const other = await registerAndLogin(app, 'other-v1');
      const otherDetail = await app.inject({
        method: 'GET',
        url: `/api/problems/${problemId}`,
        headers: other.headers,
      });
      expect(otherDetail.json().capabilities).toEqual({ canEdit: false });
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/problems/${problemId}`,
            headers: other.headers,
            payload: { title: 'Denied' },
          })
        ).statusCode,
      ).toBe(403);

      const root = await registerAndLogin(app, 'root-v1');
      permissions.set(root.id, new Set(['problem.edit']));
      const rootDetail = await app.inject({
        method: 'GET',
        url: `/api/problems/${problemId}`,
        headers: root.headers,
      });
      expect(rootDetail.json().capabilities).toEqual({ canEdit: true });
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/problems/${problemId}`,
            headers: root.headers,
            payload: { title: 'Privileged update' },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('maps configured administrator capability to problem management without a username bypass', async () => {
    const app = await buildApp({
      logger: false,
      operatorUsernames: new Set(['root-operator']),
    });
    try {
      const owner = await registerAndLogin(app, 'problem-owner-v1');
      const created = await app.inject({
        method: 'POST',
        url: '/api/problems',
        headers: owner.headers,
        payload: problem('operator-managed'),
      });
      expect(created.statusCode).toBe(201);
      const problemId = created.json().id as string;
      const root = await registerAndLogin(app, 'root-operator');
      const capability = await app.inject({
        method: 'GET',
        url: '/api/admin/judge/capabilities',
        headers: root.headers,
      });
      expect(capability.json()).toEqual({ canView: true, canManage: true });
      const update = await app.inject({
        method: 'PATCH',
        url: `/api/problems/${problemId}`,
        headers: root.headers,
        payload: { title: 'Operator update' },
      });
      expect(update.statusCode).toBe(200);
      expect(update.json()).toMatchObject({ title: 'Operator update' });
    } finally {
      await app.close();
    }
  });

  it('serves a source-free global evaluation list with stable cursor filtering', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const repository = new InMemorySubmissionRepository();
    const first = await repository.create({
      ownerUserId: 'u1',
      problemId: 'p1',
      problemRevisionId: 'r1',
      testdataVersionRef: 'data-v1',
      languageId: 'cpp20',
      source: 'first-secret-source',
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    const second = await repository.create({
      ownerUserId: 'u2',
      problemId: 'p2',
      problemRevisionId: 'r2',
      testdataVersionRef: 'data-v1',
      languageId: 'python3',
      source: 'second-secret-source',
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    const third = await repository.create({
      ownerUserId: 'u1',
      problemId: 'p1',
      problemRevisionId: 'r1',
      testdataVersionRef: 'data-v1',
      languageId: 'cpp20',
      source: 'third-secret-source',
    });
    await repository.beginEvaluation!(first.id, 'job-1');
    await repository.publishEvaluation!({
      submissionId: first.id,
      judgeJobId: 'job-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      evaluationRecordDigest: 'one',
      completedAt: new Date().toISOString(),
      detail: {
        testcaseCount: 1,
        completedTestcaseCount: 1,
        totalTimeMs: 7,
        peakMemoryBytes: 1024,
        testcases: [],
      },
    });
    await repository.beginEvaluation!(third.id, 'job-3');
    await repository.publishEvaluation!({
      submissionId: third.id,
      judgeJobId: 'job-3',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'WA',
      evaluationRecordDigest: 'three',
      completedAt: new Date().toISOString(),
    });
    const app = Fastify();
    await registerSubmissionModule(app, {
      repository,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: (user, submission) =>
          user.userId === submission.ownerUserId || user.userId === 'root',
        listOwnSubmissions: () => true,
        canListGlobalSubmissions: () => true,
      },
      problemResolver: { getRevision: async () => undefined },
      getAuthContext: async (request) => {
        const id = request.headers['x-user-id'];
        return typeof id === 'string'
          ? { userId: id, sessionId: 's1', strength: 'password' }
          : undefined;
      },
      projectGlobalListItem: async (submission) => ({
        problem: {
          id: submission.problemId,
          slug: `slug-${submission.problemId}`,
          title: `Problem ${submission.problemId}`,
        },
        submitter: {
          id: submission.ownerUserId,
          displayName: `User ${submission.ownerUserId}`,
        },
      }),
    });
    try {
      const pageOne = await app.inject({
        method: 'GET',
        url: '/api/evaluations?limit=1',
        headers: { 'x-user-id': 'u1' },
      });
      expect(pageOne.statusCode).toBe(200);
      expect(pageOne.json().items[0]).toMatchObject({
        submissionId: third.id,
        problem: { title: 'Problem p1' },
        submitter: { displayName: 'User u1' },
        languageProfileId: 'cpp20',
        verdict: 'WA',
        sourceBytes: Buffer.byteLength('third-secret-source'),
      });
      expect(pageOne.json()).toMatchObject({ total: 3, page: 1 });
      expect(pageOne.body).not.toContain('secret-source');
      const anonymousPage = await app.inject({
        method: 'GET',
        url: '/api/evaluations?limit=2',
      });
      expect(anonymousPage.statusCode).toBe(200);
      expect(anonymousPage.body).not.toContain('secret-source');
      const pageTwo = await app.inject({
        method: 'GET',
        url: `/api/evaluations?limit=2&cursor=${encodeURIComponent(pageOne.json().nextCursor as string)}`,
        headers: { 'x-user-id': 'u1' },
      });
      expect(
        pageTwo
          .json()
          .items.map((item: { submissionId: string }) => item.submissionId),
      ).toEqual([second.id, first.id]);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/evaluations?problemId=p1&language=cpp20&verdict=AC',
            headers: { 'x-user-id': 'u1' },
          })
        )
          .json()
          .items.map((item: { submissionId: string }) => item.submissionId),
      ).toEqual([first.id]);
      const searchedPage = await app.inject({
        method: 'GET',
        url: '/api/evaluations?problemSearch=P1',
      });
      expect(
        searchedPage
          .json()
          .items.map((item: { submissionId: string }) => item.submissionId),
      ).toEqual([third.id, first.id]);
      const offsetPage = await app.inject({
        method: 'GET',
        url: '/api/evaluations?limit=2&page=2',
      });
      expect(
        offsetPage
          .json()
          .items.map((item: { submissionId: string }) => item.submissionId),
      ).toEqual([first.id]);
      const failedPage = await app.inject({
        method: 'GET',
        url: '/api/evaluations?failed=true',
      });
      expect(
        failedPage
          .json()
          .items.map((item: { submissionId: string }) => item.submissionId),
      ).toEqual([third.id]);
      const statistics = await app.inject({
        method: 'GET',
        url: '/api/evaluations/statistics?submitterId=u1',
      });
      expect(statistics.statusCode).toBe(200);
      expect(statistics.json()).toMatchObject({
        total: 2,
        accepted: 1,
        failed: 1,
        judging: 0,
        passRate: 50,
        today: { submissions: 2, accepted: 1, activeUsers: 1 },
        verdicts: { AC: 1, WA: 1, CE: 0, RE: 0, TLE: 0, MLE: 0 },
      });
      expect(statistics.json().trend).toHaveLength(7);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/submissions/${first.id}`,
            headers: { 'x-user-id': 'u2' },
          })
        ).statusCode,
      ).toBe(403);
      const rootDetail = await app.inject({
        method: 'GET',
        url: `/api/submissions/${first.id}`,
        headers: { 'x-user-id': 'root' },
      });
      expect(rootDetail.statusCode).toBe(200);
      expect(rootDetail.json().source).toBe('first-secret-source');
    } finally {
      vi.useRealTimers();
      await app.close();
    }
  });
});
