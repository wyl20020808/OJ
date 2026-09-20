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

  it('cancels production submissions through the authoritative control plane', async () => {
    const app = Fastify();
    const repository = new InMemoryJudgeJobRepository();
    const published: Array<{ submissionId: string; judgeJobId?: string }> = [];
    let job: {
      judgeJobId: string;
      status: string;
      attempt: number;
      maxAttempts: number;
      terminal: boolean;
      publication?: {
        submissionId: string;
        judgeJobId: string;
        evaluationGeneration: number;
        attemptGeneration: number;
        status: 'CANCELLED';
        evaluationRecordDigest: string;
      };
    } = {
      judgeJobId: 'judge-service-job-1',
      status: 'RUNNING',
      attempt: 1,
      maxAttempts: 0,
      terminal: false,
      publication: {
        submissionId: 'submission-1',
        judgeJobId: 'judge-service-job-1',
        evaluationGeneration: 1,
        attemptGeneration: 1,
        status: 'CANCELLED',
        evaluationRecordDigest: 'judge-service-digest',
      },
    };
    await registerWorkerControlRoutes(app, {
      getAuthContext: async (request) => {
        const userId = request.headers['x-user-id'];
        return typeof userId === 'string'
          ? { userId, sessionId: 'session', strength: 'password' }
          : undefined;
      },
      judgeRepository: repository,
      judgeJobCancellation: {
        getBySubmissionId: async () => job,
        cancel: async () => {
          job = { ...job, status: 'CANCELLED' };
          return job;
        },
      },
      resolveSubmission: async (id) =>
        id === 'submission-1' ? { ownerUserId: 'owner' } : undefined,
      submissionRepository: {
        publishEvaluation: async (input: { submissionId: string }) => {
          published.push({ submissionId: input.submissionId });
          return undefined;
        },
        cancelEvaluation: async (submissionId: string, judgeJobId: string) => {
          published.push({ submissionId, judgeJobId });
          return undefined;
        },
      } as never,
      operatorUserIds: new Set<string>(),
    });
    const cancelled = await app.inject({
      method: 'POST',
      url: '/api/submissions/submission-1/judge/cancel',
      headers: { 'x-user-id': 'owner' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      judgeJobId: 'judge-service-job-1',
      status: 'CANCELLED',
      synthetic: false,
    });
    // The Judge Service publication owns the persisted digest, so the product
    // must publish it instead of a second synthetic cancellation digest.
    expect(published).toEqual([{ submissionId: 'submission-1' }]);
    job = { ...job, status: 'COMPLETED_WITH_VERDICT', terminal: true };
    const terminal = await app.inject({
      method: 'POST',
      url: '/api/submissions/submission-1/judge/cancel',
      headers: { 'x-user-id': 'owner' },
    });
    expect(terminal.statusCode).toBe(409);
    expect(terminal.json()).toMatchObject({ code: 'TERMINAL' });
    expect(published).toHaveLength(1);
    await app.close();
  });

  it('falls back to the persisted cancellation without a control-plane publication', async () => {
    const app = Fastify();
    const published: Array<{ submissionId: string; judgeJobId: string }> = [];
    await registerWorkerControlRoutes(app, {
      getAuthContext: async (request) => {
        const userId = request.headers['x-user-id'];
        return typeof userId === 'string'
          ? { userId, sessionId: 'session', strength: 'password' }
          : undefined;
      },
      judgeRepository: new InMemoryJudgeJobRepository(),
      judgeJobCancellation: {
        getBySubmissionId: async () => ({
          judgeJobId: 'judge-service-job-2',
          status: 'QUEUED',
          attempt: 0,
          maxAttempts: 0,
          terminal: false,
        }),
        cancel: async () => ({
          judgeJobId: 'judge-service-job-2',
          status: 'CANCELLED',
          attempt: 0,
          maxAttempts: 0,
          terminal: false,
        }),
      },
      resolveSubmission: async () => ({ ownerUserId: 'owner' }),
      submissionRepository: {
        cancelEvaluation: async (submissionId: string, judgeJobId: string) => {
          published.push({ submissionId, judgeJobId });
          return undefined;
        },
      } as never,
      operatorUserIds: new Set<string>(),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions/submission-1/judge/cancel',
      headers: { 'x-user-id': 'owner' },
    });
    expect(response.statusCode).toBe(200);
    expect(published).toEqual([
      { submissionId: 'submission-1', judgeJobId: 'judge-service-job-2' },
    ]);
    await app.close();
  });

  it('reports a missing control-plane judge job instead of a fake outage', async () => {
    const app = Fastify();
    await registerWorkerControlRoutes(app, {
      getAuthContext: async (request) => {
        const userId = request.headers['x-user-id'];
        return typeof userId === 'string'
          ? { userId, sessionId: 'session', strength: 'password' }
          : undefined;
      },
      judgeRepository: new InMemoryJudgeJobRepository(),
      judgeJobCancellation: {
        getBySubmissionId: async () => undefined,
        cancel: async () => {
          throw new Error('cancel must not be reached');
        },
      },
      resolveSubmission: async () => ({ ownerUserId: 'owner' }),
      operatorUserIds: new Set<string>(),
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/submissions/submission-1/judge/cancel',
      headers: { 'x-user-id': 'owner' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' });
    await app.close();
  });
});
