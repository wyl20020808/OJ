import { describe, expect, it } from 'vitest';
import { buildJudgeService } from '../apps/judge-service/src/app.js';
import { InMemoryJudgeServiceStateRepository } from '../apps/judge-service/src/repository.js';
import { InMemoryJudgeJobRepository } from '@ojplatform/judge-runtime';
import {
  JudgeServiceClient,
  productPublication,
} from '../apps/api/src/modules/submission/judge-service-client.js';

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
