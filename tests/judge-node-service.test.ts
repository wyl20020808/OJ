import { describe, expect, it } from 'vitest';
import { buildJudgeService } from '../apps/judge-service/src/app.js';
import { InMemoryJudgeServiceStateRepository } from '../apps/judge-service/src/repository.js';
import {
  InMemoryJudgeNodeRepository,
  type JudgeNodeAssignment,
} from '../apps/judge-service/src/node-repository.js';
import type { JudgeNodeRegistration } from '../apps/judge-service/src/node-model.js';
import { InMemoryJudgeJobRepository } from '@ojplatform/judge-runtime';

const serviceToken = 'judge-service-test-token';
const nodeToken = 'judge-node-test-token-2c7b';
const serviceHeaders = { 'x-judge-service-token': serviceToken };
const nodeHeaders = { 'x-judge-node-token': nodeToken };
const registration = (
  nodeId: string,
  incarnation: string,
): JudgeNodeRegistration => ({
  nodeId,
  incarnation,
  runtimeVersion: '2c7b-v1',
  maxConcurrentJobs: 1,
  capabilities: {
    languageProfiles: ['cpp20-gcc-13-v1'],
    checkers: ['EXACT_BYTES', 'TOKEN_WHITESPACE'],
    executionModes: ['SAFE_FIXTURE_QUALIFICATION', 'REAL_SANDBOXED_EXECUTION'],
    sandboxContractVersion: '2C.3',
    architecture: 'amd64',
    resourceClass: 'standard-v1',
  },
});
const request = {
  clientRequestId: 'node-service-request',
  externalSubmissionId: 'node-service-submission',
  problemId: 'problem-1',
  problemRevisionId: 'revision-1',
  testdataVersionRef: 'testdata-1',
  languageId: 'cpp20',
  sourceBytes: 'int main(){}',
};

async function service() {
  const app = await buildJudgeService({
    queue: new InMemoryJudgeJobRepository(),
    state: new InMemoryJudgeServiceStateRepository(),
    nodes: new InMemoryJudgeNodeRepository(),
    serviceToken,
    nodeToken,
    logger: false,
  });
  return app;
}

describe('Phase 2C.7B Judge node service contract', () => {
  it('authenticates nodes separately and schedules deterministically through an assignment', async () => {
    const app = await service();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/nodes/register',
          payload: registration('node-a', 'a1'),
        })
      ).statusCode,
    ).toBe(401);
    for (const [nodeId, incarnation] of [
      ['node-b', 'b1'],
      ['node-a', 'a1'],
    ] as const)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/nodes/register',
            headers: nodeHeaders,
            payload: registration(nodeId, incarnation),
          })
        ).statusCode,
      ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/jobs',
          headers: serviceHeaders,
          payload: request,
        })
      ).statusCode,
    ).toBe(201);
    const a = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({
      assignment: { nodeId: 'node-a', incarnation: 'a1', attemptGeneration: 1 },
      job: { submissionId: request.externalSubmissionId },
    });
    const assignmentId = a.json().assignment.assignmentId as string;
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a2'),
    });
    const staleCompletion = await app.inject({
      method: 'POST',
      url: `/v1/nodes/node-a/assignments/${assignmentId}/complete`,
      headers: nodeHeaders,
      payload: { incarnation: 'a1', leaseToken: 'old-token', result: {} },
    });
    expect(staleCompletion.statusCode).toBe(409);
    expect(staleCompletion.json()).toMatchObject({
      code: 'STALE_NODE_INCARNATION',
    });
    await app.close();
  });

  it('rejects stale incarnation, honors drain/offline, and does not expose node credentials', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a2'),
    });
    const stale = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/heartbeat',
      headers: nodeHeaders,
      payload: { incarnation: 'a1', activeJobs: 0 },
    });
    expect(stale.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/nodes/node-a/drain',
          headers: serviceHeaders,
        })
      ).json(),
    ).toMatchObject({ state: 'OFFLINE' });
    const detail = await app.inject({
      method: 'GET',
      url: '/v1/nodes/node-a',
      headers: serviceHeaders,
    });
    expect(JSON.stringify(detail.json())).not.toContain(nodeToken);
    await app.close();
  });

  it('resolves fixture work through the current assignment and releases capacity', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: serviceHeaders,
      payload: { ...request, clientRequestId: 'node-service-resolve' },
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    const assignmentId = claim.json().assignment.assignmentId as string;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/nodes/node-a/assignments/${assignmentId}/resolve`,
          headers: nodeHeaders,
          payload: {
            incarnation: 'a1',
            leaseToken: claim.json().leaseToken,
            action: 'SUCCEEDED_FAKE',
            fixtureId: 'FX-SUCCESS',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/jobs/${accepted.json().judgeJobId}`,
          headers: serviceHeaders,
        })
      ).json(),
    ).toMatchObject({ status: 'NO_VERDICT' });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/nodes/node-a',
          headers: serviceHeaders,
        })
      ).json(),
    ).toMatchObject({ activeJobs: 0, state: 'ONLINE' });
    await app.close();
  });

  it('does not let a node cancel an assignment with a wrong lease token', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: serviceHeaders,
      payload: { ...request, clientRequestId: 'node-service-cancel-token' },
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    const assignmentId = claim.json().assignment.assignmentId as string;
    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/nodes/node-a/assignments/${assignmentId}/resolve`,
      headers: nodeHeaders,
      payload: {
        incarnation: 'a1',
        leaseToken: 'wrong-token',
        action: 'CANCELLED',
      },
    });
    expect(rejected.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/jobs/${accepted.json().judgeJobId}`,
          headers: serviceHeaders,
        })
      ).json(),
    ).toMatchObject({ status: 'RUNNING' });
    await app.close();
  });

  it('reports cancellation only to the current assignment and releases capacity after service cancellation', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: serviceHeaders,
      payload: { ...request, clientRequestId: 'node-service-cancellation' },
    });
    const jobId = accepted.json().judgeJobId as string;
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    const assignmentId = claim.json().assignment.assignmentId as string;
    const status = () =>
      app.inject({
        method: 'POST',
        url: `/v1/nodes/node-a/assignments/${assignmentId}/cancellation-status`,
        headers: nodeHeaders,
        payload: { incarnation: 'a1' },
      });

    expect((await status()).json()).toEqual({ cancelRequested: false });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/jobs/${jobId}/cancel`,
          headers: serviceHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect((await status()).json()).toEqual({ cancelRequested: true });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/nodes/node-a/assignments/${assignmentId}/resolve`,
          headers: nodeHeaders,
          payload: {
            incarnation: 'a1',
            leaseToken: claim.json().leaseToken,
            action: 'CANCELLED',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/nodes/node-a',
          headers: serviceHeaders,
        })
      ).json(),
    ).toMatchObject({ activeJobs: 0, state: 'ONLINE' });
    await app.close();
  });

  it('rejects cancellation status queries from a stale incarnation', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: serviceHeaders,
      payload: {
        ...request,
        clientRequestId: 'node-service-stale-cancellation',
      },
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a2'),
    });
    const stale = await app.inject({
      method: 'POST',
      url: `/v1/nodes/node-a/assignments/${claim.json().assignment.assignmentId as string}/cancellation-status`,
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: 'STALE_NODE_INCARNATION' });
    await app.close();
  });

  it('does not over-reserve in-memory node capacity', async () => {
    const nodes = new InMemoryJudgeNodeRepository();
    await nodes.register(registration('node-a', 'a1'));
    const node = await nodes.get('node-a');
    if (!node) throw new Error('registered node missing');
    await nodes.assign(node, 'job-1', 1);
    await expect(nodes.assign(node, 'job-2', 1)).rejects.toThrow(
      'NODE_CAPACITY_UNAVAILABLE',
    );
  });

  it('preserves operator intent through completion and requires service auth for admin', async () => {
    const app = await service();
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    const denied = await app.inject({ method: 'GET', url: '/v1/admin/nodes' });
    expect(denied.statusCode).toBe(401);
    const drained = await app.inject({
      method: 'POST',
      url: '/v1/admin/nodes/node-a/drain',
      headers: serviceHeaders,
    });
    expect(drained.json()).toMatchObject({ desiredState: 'DRAINING' });
    const summary = await app.inject({
      method: 'GET',
      url: '/v1/admin/cluster/summary',
      headers: serviceHeaders,
    });
    expect(summary.json()).toMatchObject({
      totalNodes: 1,
      schedulableCapacity: 0,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a2'),
    });
    const detail = await app.inject({
      method: 'GET',
      url: '/v1/admin/nodes/node-a',
      headers: serviceHeaders,
    });
    expect(detail.json()).toMatchObject({
      desiredState: 'DRAINING',
      observedState: 'ONLINE',
    });
    const enabled = await app.inject({
      method: 'POST',
      url: '/v1/admin/nodes/node-a/enable',
      headers: serviceHeaders,
      payload: { expectedControlVersion: detail.json().controlVersion },
    });
    expect(enabled.json()).toMatchObject({
      desiredState: 'ONLINE',
      observedState: 'ONLINE',
    });
    await app.close();
  });

  it('compensates a claim when node capacity reservation loses a race', async () => {
    class RejectingNodeRepository extends InMemoryJudgeNodeRepository {
      override async assign(
        ...args: Parameters<InMemoryJudgeNodeRepository['assign']>
      ): Promise<JudgeNodeAssignment> {
        void args;
        throw new Error('NODE_CAPACITY_UNAVAILABLE');
      }
    }

    const queue = new InMemoryJudgeJobRepository();
    const app = await buildJudgeService({
      queue,
      state: new InMemoryJudgeServiceStateRepository(),
      nodes: new RejectingNodeRepository(),
      serviceToken,
      nodeToken,
      logger: false,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/nodes/register',
      headers: nodeHeaders,
      payload: registration('node-a', 'a1'),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: serviceHeaders,
      payload: { ...request, clientRequestId: 'node-capacity-race' },
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/v1/nodes/node-a/assignments/claim',
      headers: nodeHeaders,
      payload: { incarnation: 'a1' },
    });

    expect(claim.statusCode).toBe(200);
    expect(claim.json()).toEqual({
      assignment: null,
      reason: 'NO_COMPATIBLE_JUDGE_NODE',
    });
    expect(await queue.getById(accepted.json().judgeJobId)).toMatchObject({
      status: 'FAILED_RETRYABLE',
      attempt: 1,
    });
    await app.close();
  });
});
