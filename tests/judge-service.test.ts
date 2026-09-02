import { describe, expect, it } from 'vitest';
import { buildJudgeService } from '../apps/judge-service/src/app.js';
import { InMemoryJudgeServiceStateRepository } from '../apps/judge-service/src/repository.js';
import { InMemoryJudgeJobRepository } from '@ojplatform/judge-runtime';
import {
  JudgeServiceClient,
  productPublication,
} from '../apps/api/src/modules/submission/judge-service-client.js';
import { LocalJudgeHostAgent } from '../apps/judge-host-agent/src/agent.js';

const token = 'judge-service-test-token';
const headers = { 'x-judge-service-token': token };
const request = {
  clientRequestId: 'request-1',
  externalSubmissionId: 'external-submission-1',
  problemId: 'problem-1',
  problemRevisionId: 'revision-1',
  testdataVersionRef: 'testdata-1',
  languageId: 'cpp20',
  sourceBytes: 'int main(){}',
};

async function service() {
  const queue = new InMemoryJudgeJobRepository();
  const app = await buildJudgeService({
    queue,
    state: new InMemoryJudgeServiceStateRepository(),
    serviceToken: token,
  });
  return { app, queue };
}

describe('standalone Judge Service V1', () => {
  it('exposes authenticated host-backed lifecycle and autoscaler controls', async () => {
    const host = new LocalJudgeHostAgent(
      [
        {
          templateId: 'node-v1',
          displayName: 'Node V1',
          executable: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          maxConcurrentJobs: 1,
          cpuUnits: 1,
          memoryMb: 64,
          enabled: true,
        },
      ],
      {
        configuredCpuUnits: 4,
        availableCpuUnits: 4,
        configuredMemoryMb: 1024,
        availableMemoryMb: 1024,
      },
    );
    const app = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: token,
      hostAgent: host,
      logger: false,
    });
    expect((await app.inject('/v1/admin/pool/templates')).statusCode).toBe(401);
    const templates = await app.inject({
      method: 'GET',
      url: '/v1/admin/pool/templates',
      headers,
    });
    expect(templates.json()).toMatchObject({
      items: [{ templateId: 'node-v1' }],
    });
    const started = await app.inject({
      method: 'POST',
      url: '/v1/admin/nodes',
      headers,
      payload: { templateId: 'node-v1', count: 1 },
    });
    expect(started.statusCode).toBe(200);
    const operation = started.json().results[0];
    expect(operation).toMatchObject({
      status: 'RUNNING',
      incarnation: expect.any(String),
    });
    const capacity = await app.inject({
      method: 'GET',
      url: '/v1/admin/pool/host-capacity',
      headers,
    });
    expect(capacity.json()).toMatchObject({ currentNodes: 1 });
    const stopped = await app.inject({
      method: 'POST',
      url: '/v1/admin/nodes/node-v1-unknown/stop',
      headers,
      payload: {},
    });
    expect(stopped.statusCode).toBe(409);
    const owned = await host.listOwned();
    expect(owned).toHaveLength(1);
    await host.stop({
      nodeId: owned[0]!.nodeId,
      expectedIncarnation: owned[0]!.incarnation,
    });
    await app.close();
  });
  it('requires a service token while leaving health independent', async () => {
    const { app } = await service();
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/v1/capabilities')).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/capabilities',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      apiVersion: 'v1',
      languages: ['cpp20'],
      checkers: ['EXACT_BYTES', 'TOKEN_WHITESPACE'],
      multiNodeDynamicManagement: 'NOT_YET_QUALIFIED',
      advancedFeatures: { scoring: false, multiLanguage: false },
    });
    await app.close();
  });

  it('rejects stale pool mode control versions', async () => {
    const { app } = await service();
    const current = await app.inject({
      method: 'GET',
      url: '/v1/admin/pool/policy',
      headers,
    });
    const version = current.json().controlVersion as number;
    const stale = await app.inject({
      method: 'POST',
      url: '/v1/admin/pool/mode',
      headers,
      payload: { mode: 'AUTOMATIC', expectedControlVersion: version + 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONTROL_VERSION_CONFLICT' });
    await app.close();
  });

  it('restores pool policy and autoscaler history from the state repository', async () => {
    const state = new InMemoryJudgeServiceStateRepository();
    const first = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state,
      serviceToken: token,
      logger: false,
    });
    const changed = await first.inject({
      method: 'POST',
      url: '/v1/admin/pool/mode',
      headers,
      payload: { mode: 'AUTOMATIC', expectedControlVersion: 1 },
    });
    expect(changed.statusCode).toBe(200);
    await first.close();
    const second = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state,
      serviceToken: token,
      logger: false,
    });
    expect(
      (
        await second.inject({
          method: 'GET',
          url: '/v1/admin/pool/policy',
          headers,
        })
      ).json(),
    ).toMatchObject({ mode: 'AUTOMATIC', controlVersion: 2 });
    await second.close();
  });

  it('accepts opaque external references exactly once and projects no source or lease data', async () => {
    const { app } = await service();
    const first = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers,
      payload: request,
    });
    expect(first.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers,
      payload: request,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().judgeJobId).toBe(first.json().judgeJobId);
    const reordered = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers,
      payload: {
        sourceBytes: request.sourceBytes,
        languageId: request.languageId,
        testdataVersionRef: request.testdataVersionRef,
        problemRevisionId: request.problemRevisionId,
        problemId: request.problemId,
        externalSubmissionId: request.externalSubmissionId,
        clientRequestId: request.clientRequestId,
      },
    });
    expect(reordered.statusCode).toBe(200);
    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers,
      payload: { ...request, sourceBytes: 'different source' },
    });
    expect(conflict.statusCode).toBe(409);
    const read = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${first.json().judgeJobId}`,
      headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      apiVersion: 'v1',
      externalSubmissionId: request.externalSubmissionId,
      status: 'QUEUED',
    });
    expect(JSON.stringify(read.json())).not.toMatch(
      /source|stdout|stderr|expected|lease|worker|token/i,
    );
    await app.close();
  });

  it('keeps cancellation non-verdict and creates a new rejudge generation', async () => {
    const { app, queue } = await service();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers,
      payload: request,
    });
    const id = created.json().judgeJobId as string;
    const cancelled = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${id}/cancel`,
      headers,
    });
    expect(cancelled.json()).toMatchObject({ status: 'CANCELLED' });
    expect(cancelled.json()).not.toHaveProperty('verdict');
    const rejudge = await app.inject({
      method: 'POST',
      url: `/v1/jobs/${id}/rejudge`,
      headers,
      payload: { clientRequestId: 'request-2' },
    });
    expect(rejudge.statusCode).toBe(201);
    expect(rejudge.json()).toMatchObject({ evaluationGeneration: 2 });
    expect(
      (await queue.getById(rejudge.json().judgeJobId))?.evaluationGeneration,
    ).toBe(2);
    const history = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${id}/history`,
      headers,
    });
    expect(history.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evaluationGeneration: 1 }),
        expect.objectContaining({ evaluationGeneration: 2 }),
      ]),
    );
    await app.close();
  });

  it('maps service results to product publication without accepting caller verdicts', async () => {
    const payload = {
      apiVersion: 'v1',
      judgeJobId: 'judge-1',
      externalSubmissionId: 'submission-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      acceptedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:01.000Z',
      resultDigest: 'a'.repeat(64),
    };
    const client = new JudgeServiceClient(
      'http://judge.local',
      token,
      async () => new Response(JSON.stringify(payload), { status: 200 }),
    );
    const result = await client.get('judge-1');
    expect(productPublication(result)).toMatchObject({
      submissionId: 'submission-1',
      verdict: 'AC',
      status: 'COMPLETED_WITH_VERDICT',
    });
  });
});
