import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryJudgeJobRepository } from '../apps/api/src/modules/judge/index.js';
import { registerWorkerControlRoutes } from '../apps/api/src/modules/judge/worker-control.js';

const setup = async (operatorUserIds = new Set<string>()) => {
  const app = Fastify();
  const repository = new InMemoryJudgeJobRepository();
  const owners = new Map([['submission-1', 'owner']]);
  await registerWorkerControlRoutes(app, {
    getAuthContext: async (request) => {
      const userId = request.headers['x-user-id'];
      return typeof userId === 'string'
        ? { userId, sessionId: 'session', strength: 'password' }
        : undefined;
    },
    judgeRepository: repository,
    resolveSubmission: async (id) => {
      const ownerUserId = owners.get(id);
      return ownerUserId ? { ownerUserId } : undefined;
    },
    operatorUserIds,
  });
  const job = (
    await repository.enqueue({
      submissionId: 'submission-1',
      ownerUserId: 'owner',
      problemId: 'problem',
      problemRevisionId: 'revision',
      testdataVersionRef: 'td',
      languageId: 'qualification',
    })
  ).job;
  return { app, repository, job };
};

describe('Lead Worker control API', () => {
  it('denies diagnostics and capabilities to unauthenticated/ordinary users', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/operations/judge-workers')).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          url: '/api/operations/judge-workers',
          headers: { 'x-user-id': 'owner' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/judge/capabilities',
          headers: { 'x-user-id': 'owner' },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });

  it('uses authoritative submission ownership for cancellation and is idempotent', async () => {
    const { app, job } = await setup(new Set(['operator']));
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/submissions/${job.submissionId}/judge/cancel`,
      headers: { 'x-user-id': 'other' },
    });
    expect(forbidden.statusCode).toBe(403);
    const owner = await app.inject({
      method: 'POST',
      url: `/api/submissions/${job.submissionId}/judge/cancel`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json()).toMatchObject({
      status: 'CANCELLED',
      synthetic: false,
    });
    const repeated = await app.inject({
      method: 'POST',
      url: `/api/submissions/${job.submissionId}/judge/cancel`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().status).toBe('CANCELLED');
    await app.close();
  });

  it('rejects terminal cancellation and never exposes internal fields', async () => {
    const { app, repository, job } = await setup();
    const lease = await repository.claimById(job.id, 'worker-a', 1000);
    await repository.complete(job.id, lease!.leaseToken, 'fixture');
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${job.submissionId}/judge/cancel`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.stringify(response.json())).not.toMatch(
      /leaseToken|redis|source|secret/i,
    );
    await app.close();
  });
});
