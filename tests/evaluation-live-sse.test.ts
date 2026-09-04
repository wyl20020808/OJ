import { describe, expect, it, vi } from 'vitest';
import {
  EvaluationEventHub,
  RedisJudgeProgressBridge,
  RedisEvaluationEventHub,
} from '../apps/api/src/modules/submission/events.js';
import {
  JudgeProgressEventBus,
  testcaseTerminalEvents,
} from '@ojplatform/judge-runtime';
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
  it('emits bounded Judge phases once and excludes hidden testcase content', async () => {
    const bus = new JudgeProgressEventBus(2);
    const events: unknown[] = [];
    bus.on((event) => {
      events.push(event);
    });
    const base = {
      judgeJobId: 'job-1',
      submissionId: 'submission-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    bus.emit({ ...base, phase: 'EVALUATION_QUEUED', state: 'QUEUED' });
    bus.emit({ ...base, phase: 'EVALUATION_QUEUED', state: 'QUEUED' });
    bus.emit({ ...base, phase: 'EVALUATION_STARTED', state: 'RUNNING' });
    bus.emit({
      ...base,
      phase: 'TESTCASE_STARTED',
      state: 'RUNNING',
      testcaseOrdinal: 1,
      testcaseId: 'case-1',
    });
    expect(events).toHaveLength(3);
    const terminal = testcaseTerminalEvents({
      id: 'job-1',
      submissionId: 'submission-1',
      evaluationGeneration: 1,
      idempotencyKey: 'k',
      ownerUserId: 'judge-service',
      problemId: 'p',
      problemRevisionId: 'r',
      testdataVersionRef: 't',
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      status: 'COMPLETED',
      attempt: 1,
      maxAttempts: 3,
      createdAt: base.updatedAt,
      updatedAt: base.updatedAt,
      rawExecutionResult: {
        protocol_version: '2C.4',
        judge_job_id: 'job-1',
        submission_id: 'submission-1',
        attempt: 1,
        correlation_id: 'job-1',
        language_profile_id: 'cpp20-gcc-13-v1',
        source_sha256: 'a'.repeat(64),
        pipeline_outcome: 'PIPELINE_COMPLETED',
        compile: {},
        started_at: base.updatedAt,
        completed_at: base.updatedAt,
        clean: true,
        aggregate_execution_set_record: {
          testcases: [
            {
              testcaseId: 'case-1',
              record: {
                input: 'hidden input',
                expected_output: 'hidden expected',
              },
            },
          ],
        } as never,
        verdict_record: {
          cases: [{ evaluation_state: 'COMPLETE', verdict: 'AC' }],
        },
      },
    });
    expect(terminal[0]).toMatchObject({
      phase: 'TESTCASE_TERMINAL',
      testcaseId: 'case-1',
      verdict: 'AC',
    });
    expect(JSON.stringify(terminal)).not.toMatch(
      /hidden input|hidden expected/,
    );
  });

  it('delivers one Redis progress message to bridge consumer', async () => {
    let handler: ((channel: string, message: string) => void) | undefined;
    const subscriber = {
      publish: vi.fn(async () => 0),
      on: (
        _event: 'message',
        listener: (channel: string, message: string) => void,
      ) => {
        handler = listener;
      },
      subscribe: vi.fn(async () => undefined),
    };
    const received: unknown[] = [];
    const bridge = new RedisJudgeProgressBridge(subscriber, (event) => {
      received.push(event);
    });
    await bridge.connect();
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    handler?.(
      'oj:judge-progress-events:v1',
      JSON.stringify({
        version: 'judge-progress.v1',
        id: 1,
        phase: 'TESTCASE_STARTED',
        judgeJobId: 'job-1',
        submissionId: 'submission-1',
        evaluationGeneration: 1,
        attemptGeneration: 1,
        testcaseOrdinal: 1,
        updatedAt: '2026-09-04T00:00:00.000Z',
      }),
    );
    handler?.('oj:judge-progress-events:v1', '{malformed');
    expect(received).toHaveLength(1);
  });

  it('fans out Product event to a second Redis consumer', async () => {
    const listeners: Array<(channel: string, message: string) => void> = [];
    const client = () => ({
      publish: vi.fn(async (_channel: string, message: string) => {
        for (const listener of listeners)
          listener('oj:evaluation-events:v1', message);
        return 1;
      }),
      subscribe: vi.fn(async () => undefined),
      on: (
        _event: 'message',
        listener: (channel: string, message: string) => void,
      ) => {
        listeners.push(listener);
      },
    });
    const publisher = client();
    const subscriberA = client();
    const subscriberB = client();
    const hubA = new RedisEvaluationEventHub(publisher, subscriberA);
    const hubB = new RedisEvaluationEventHub(client(), subscriberB);
    await Promise.all([hubA.connect(), hubB.connect()]);
    const received: unknown[] = [];
    hubB.subscribe('submission-1', undefined, (event) => received.push(event));
    hubA.publish(
      evaluation({ status: 'RUNNING', updatedAt: '2026-09-04T00:00:02.000Z' }),
    );
    expect(received).toHaveLength(1);
  });

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
