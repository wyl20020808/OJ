import { describe, expect, it, vi } from 'vitest';
import { EvaluationEventHub } from '../apps/api/src/modules/submission/events.js';
import Fastify from 'fastify';
import { registerSubmissionModule } from '../apps/api/src/modules/submission/routes.js';
import { InMemorySubmissionRepository } from '../apps/api/src/modules/submission/repository.js';

const evaluation = (overrides: Record<string, unknown> = {}) => ({
  submissionId: 'submission-1',
  evaluationGeneration: 1,
  attemptGeneration: 0,
  judgeJobId: 'job-1',
  evaluationRecordDigest: '',
  status: 'QUEUED' as const,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: String(overrides.updatedAt ?? '2026-09-04T00:00:00.000Z'),
  current: true,
  ...overrides,
});

describe('evaluation live event contract', () => {
  it('publishes monotonic, duplicate-safe deltas and replays by cursor', () => {
    const hub = new EvaluationEventHub(2);
    const listener = vi.fn();
    const first = hub.publish(evaluation());
    expect(first?.id).toBe(1);
    expect(hub.publish(evaluation())).toBeUndefined();
    hub.publish(
      evaluation({ status: 'RUNNING', updatedAt: '2026-09-04T00:00:01.000Z' }),
    );
    const subscription = hub.subscribe('submission-1', 1, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      id: 2,
      status: 'RUNNING',
    });
    subscription.unsubscribe();
  });

  it('reports replay gaps after bounded history eviction', () => {
    const hub = new EvaluationEventHub(1);
    hub.publish(evaluation());
    hub.publish(
      evaluation({ status: 'RUNNING', updatedAt: '2026-09-04T00:00:01.000Z' }),
    );
    const result = hub.subscribe('submission-1', 0, () => undefined);
    expect(result.replayGap).toBe(true);
    result.unsubscribe();
  });

  it('authorizes evaluation stream and closes after terminal event', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create({
      problemId: 'p',
      problemRevisionId: 'r',
      testdataVersionRef: 't',
      languageId: 'cpp20',
      source: 'int main(){}',
      ownerUserId: 'owner',
    });
    await repository.beginEvaluation!(submission.id, 'job-1');
    await repository.publishEvaluation!({
      submissionId: submission.id,
      judgeJobId: 'job-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      evaluationRecordDigest: 'digest',
    });
    const app = Fastify();
    await registerSubmissionModule(app, {
      repository,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: (user, value) => user.userId === value.ownerUserId,
        listOwnSubmissions: () => true,
      },
      problemResolver: { getRevision: async () => undefined },
      getAuthContext: async (request) =>
        typeof request.headers['x-user-id'] === 'string'
          ? { userId: request.headers['x-user-id'] }
          : undefined,
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations/1/stream`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: evaluation.terminal');
    const denied = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations/1/stream`,
      headers: { 'x-user-id': 'other' },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
