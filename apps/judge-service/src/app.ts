import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { JudgeJobRepository } from '@ojplatform/judge-runtime';
import { requestDigest, projectJudgeServiceResult } from './projection.js';
import type {
  JudgeServiceCapabilities,
  StoredJudgeServiceJob,
  SubmitJudgeJobRequest,
} from './model.js';
import { JUDGE_SERVICE_API_VERSION } from './model.js';
import type { JudgeServiceStateRepository } from './repository.js';
import type { JudgeNodeRepository } from './node-repository.js';
import type { RequiredNodeCapabilities } from './node-model.js';

export type JudgeServiceAppOptions = {
  queue: JudgeJobRepository;
  state: JudgeServiceStateRepository;
  serviceToken: string;
  nodeToken?: string;
  nodes?: JudgeNodeRepository;
  ready?: () => Promise<boolean>;
  logger?: boolean;
};

const capabilities: JudgeServiceCapabilities = {
  apiVersion: JUDGE_SERVICE_API_VERSION,
  languages: ['cpp20'],
  languageProfiles: ['cpp20-gcc-13-v1'],
  checkers: ['EXACT_BYTES', 'TOKEN_WHITESPACE'],
  verdicts: ['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE'],
  multiNodeDynamicManagement: 'NOT_YET_QUALIFIED',
  advancedFeatures: {
    specialJudge: false,
    interactive: false,
    scoring: false,
    multiLanguage: false,
  },
};

const opaque = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  !/[\0\r\n]/.test(value);

const serviceToken = (request: FastifyRequest, expected: string) => {
  const supplied = request.headers['x-judge-service-token'];
  if (typeof supplied !== 'string') return false;
  const actual = Buffer.from(supplied);
  const expectedValue = Buffer.from(expected);
  return (
    actual.length === expectedValue.length &&
    timingSafeEqual(actual, expectedValue)
  );
};

const nodeToken = (request: FastifyRequest, expected: string) => {
  const supplied = request.headers['x-judge-node-token'];
  if (typeof supplied !== 'string') return false;
  const actual = Buffer.from(supplied);
  const expectedValue = Buffer.from(expected);
  return (
    actual.length === expectedValue.length &&
    timingSafeEqual(actual, expectedValue)
  );
};

function validSubmit(value: unknown): value is SubmitJudgeJobRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    opaque(item.clientRequestId) &&
    opaque(item.externalSubmissionId) &&
    opaque(item.problemId) &&
    opaque(item.problemRevisionId) &&
    opaque(item.testdataVersionRef) &&
    item.languageId === 'cpp20'
  );
}

const requiredCapabilities = (job: {
  languageProfileId?: string | undefined;
  executionMode: RequiredNodeCapabilities['executionMode'];
  testcaseSet?:
    { entries: readonly { checkerType?: string | undefined }[] } | undefined;
}): RequiredNodeCapabilities => ({
  languageProfile:
    job.languageProfileId === 'cpp20-gcc-13-v1'
      ? 'cpp20-gcc-13-v1'
      : 'cpp20-gcc-13-v1',
  executionMode: job.executionMode,
  ...(job.testcaseSet?.entries[0]?.checkerType === 'TOKEN_WHITESPACE' ||
  job.testcaseSet?.entries[0]?.checkerType === 'EXACT_BYTES'
    ? { checker: job.testcaseSet.entries[0].checkerType }
    : {}),
});

export async function buildJudgeService(
  options: JudgeServiceAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const nodes = options.nodes;
  const deny = async (
    request: FastifyRequest,
    reply: { code: (value: number) => { send: (value: unknown) => unknown } },
  ) => {
    if (serviceToken(request, options.serviceToken)) return true;
    reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Service authentication required',
    });
    return false;
  };
  const denyNode = async (
    request: FastifyRequest,
    reply: { code: (value: number) => { send: (value: unknown) => unknown } },
  ) => {
    if (options.nodeToken && nodeToken(request, options.nodeToken)) return true;
    reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Node authentication required',
    });
    return false;
  };
  const sync = async (
    stored: StoredJudgeServiceJob,
    jobId = stored.result.judgeJobId,
  ) => {
    const queued = await options.queue.getById(jobId);
    if (!queued) return stored;
    return options.state.save({
      ...stored,
      result: projectJudgeServiceResult(queued, stored.result.acceptedAt),
    });
  };

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    const ready = (await options.ready?.()) ?? true;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'not_ready',
      dependencies: {
        judgeDatabase: ready ? 'ok' : 'unavailable',
        redis: ready ? 'ok' : 'unavailable',
      },
    });
  });
  app.get('/v1/capabilities', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return capabilities;
  });
  app.post('/v1/nodes/register', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return reply.code(201).send(await nodes.register(request.body as never));
    } catch (error) {
      return reply.code(400).send({
        code: 'INVALID_NODE_REGISTRATION',
        message:
          error instanceof Error ? error.message : 'Invalid node registration',
      });
    }
  });
  app.post('/v1/nodes/:nodeId/heartbeat', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const body = request.body as {
      incarnation?: unknown;
      activeJobs?: unknown;
    };
    if (
      typeof body?.incarnation !== 'string' ||
      !Number.isInteger(body?.activeJobs)
    )
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    try {
      return await nodes.heartbeat(
        (request.params as { nodeId: string }).nodeId,
        body.incarnation,
        Number(body.activeJobs),
      );
    } catch (error) {
      return reply.code(409).send({
        code:
          error instanceof Error ? error.message : 'NODE_HEARTBEAT_REJECTED',
      });
    }
  });
  app.get('/v1/nodes', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    return { items: await nodes.list() };
  });
  app.get('/v1/nodes/:nodeId', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const value = await nodes.get(
      (request.params as { nodeId: string }).nodeId,
    );
    return value ? value : reply.code(404).send({ code: 'NOT_FOUND' });
  });
  app.post('/v1/nodes/:nodeId/drain', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return await nodes.drain((request.params as { nodeId: string }).nodeId);
    } catch {
      return reply.code(404).send({ code: 'NOT_FOUND' });
    }
  });
  app.post('/v1/nodes/:nodeId/offline', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return await nodes.offline((request.params as { nodeId: string }).nodeId);
    } catch {
      return reply.code(404).send({ code: 'NOT_FOUND' });
    }
  });
  app.post('/v1/nodes/:nodeId/assignments/claim', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const nodeId = (request.params as { nodeId: string }).nodeId;
    const body = request.body as { incarnation?: unknown };
    if (typeof body?.incarnation !== 'string')
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    const current = await nodes.get(nodeId);
    if (!current || current.incarnation !== body.incarnation)
      return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
    for (const stored of await options.state.listAll()) {
      const job = await options.queue.getById(stored.result.judgeJobId);
      if (!job || !['QUEUED', 'FAILED_RETRYABLE'].includes(job.status))
        continue;
      const selected = await nodes.choose(requiredCapabilities(job));
      if (!selected.node) continue;
      if (
        selected.node.nodeId !== nodeId ||
        selected.node.incarnation !== body.incarnation
      )
        continue;
      const claim = await options.queue.claimById(
        job.id,
        `${nodeId}:${body.incarnation}`,
        30_000,
      );
      if (!claim) continue;
      let assignment;
      try {
        assignment = await nodes.assign(
          selected.node,
          claim.job.id,
          claim.job.attempt,
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== 'NODE_CAPACITY_UNAVAILABLE'
        )
          throw error;
        // Queue and node capacity are separate durable authorities. Compensate
        // with the current lease so a reservation race cannot strand a job.
        await options.queue.retry(
          claim.job.id,
          claim.leaseToken,
          'NODE_CAPACITY_UNAVAILABLE',
        );
        continue;
      }
      return { assignment, job: claim.job, leaseToken: claim.leaseToken };
    }
    return { assignment: null, reason: 'NO_COMPATIBLE_JUDGE_NODE' };
  });
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/complete',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes || !options.queue.completeReal)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const nodeId = (
        request.params as { nodeId: string; assignmentId: string }
      ).nodeId;
      const assignmentId = (
        request.params as { nodeId: string; assignmentId: string }
      ).assignmentId;
      const body = request.body as {
        incarnation?: unknown;
        leaseToken?: unknown;
        result?: unknown;
      };
      if (
        typeof body?.incarnation !== 'string' ||
        typeof body.leaseToken !== 'string'
      )
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const nodeValue = await nodes.get(nodeId);
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (
        !nodeValue ||
        nodeValue.incarnation !== body.incarnation ||
        !assignment
      )
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      try {
        await options.queue.completeReal(
          assignment.judgeJobId,
          body.leaseToken,
          body.result as never,
        );
        await nodes.completeAssignment(assignmentId);
        return { status: 'COMPLETED' };
      } catch {
        return reply.code(409).send({ code: 'ASSIGNMENT_COMPLETION_REJECTED' });
      }
    },
  );
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/resolve',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const { nodeId, assignmentId } = request.params as {
        nodeId: string;
        assignmentId: string;
      };
      const body = request.body as {
        incarnation?: unknown;
        leaseToken?: unknown;
        action?: unknown;
        reason?: unknown;
        fixtureId?: unknown;
      };
      if (
        typeof body?.incarnation !== 'string' ||
        typeof body.leaseToken !== 'string' ||
        ![
          'SUCCEEDED_FAKE',
          'FAILED_RETRYABLE',
          'FAILED_TERMINAL',
          'CANCELLED',
        ].includes(String(body.action))
      )
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (!assignment)
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      try {
        switch (body.action) {
          case 'SUCCEEDED_FAKE':
            await options.queue.complete(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.fixtureId === 'string'
                ? body.fixtureId
                : 'FX-SUCCESS',
            );
            break;
          case 'FAILED_RETRYABLE':
            await options.queue.retry(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.reason === 'string' ? body.reason : 'WORKER_FAILURE',
            );
            break;
          case 'FAILED_TERMINAL':
            await options.queue.failTerminal(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.reason === 'string' ? body.reason : 'WORKER_FAILURE',
            );
            break;
          case 'CANCELLED':
            if (!options.queue.cancelLease)
              return reply.code(501).send({ code: 'CANCELLATION_UNAVAILABLE' });
            await options.queue.cancelLease(
              assignment.judgeJobId,
              body.leaseToken,
            );
            break;
        }
        await nodes.completeAssignment(assignmentId);
        return { status: 'RESOLVED' };
      } catch {
        return reply.code(409).send({ code: 'ASSIGNMENT_RESOLUTION_REJECTED' });
      }
    },
  );
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/cancellation-status',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const { nodeId, assignmentId } = request.params as {
        nodeId: string;
        assignmentId: string;
      };
      const body = request.body as { incarnation?: unknown };
      if (typeof body?.incarnation !== 'string')
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const nodeValue = await nodes.get(nodeId);
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (
        !nodeValue ||
        nodeValue.incarnation !== body.incarnation ||
        !assignment
      )
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      const job = await options.queue.getById(assignment.judgeJobId);
      if (!job)
        return reply
          .code(409)
          .send({ code: 'ASSIGNMENT_CANCELLATION_STATUS_REJECTED' });
      return { cancelRequested: job.status === 'CANCELLED' };
    },
  );
  app.post('/v1/jobs', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!validSubmit(request.body))
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid Judge job request',
      });
    const input = request.body;
    const existing = await options.state.getByClientRequestId(
      input.clientRequestId,
    );
    if (existing) {
      if (requestDigest(existing.request) !== requestDigest(input))
        return reply
          .code(409)
          .send({ code: 'CONFLICT', message: 'Conflicting clientRequestId' });
      return reply.code(200).send(existing.result);
    }
    const { clientRequestId, externalSubmissionId, ...jobInput } = input;
    const { job, created } = await options.queue.enqueue({
      ...jobInput,
      submissionId: externalSubmissionId,
      ownerUserId: 'judge-service',
      idempotencyKey: clientRequestId,
    });
    const existingJob = await options.state.getByJobId(job.id);
    if (
      !created &&
      existingJob &&
      existingJob.clientRequestId !== clientRequestId
    )
      return reply
        .code(409)
        .send({ code: 'CONFLICT', message: 'Evaluation already exists' });
    const stored = await options.state.save({
      clientRequestId,
      request: input,
      result: projectJudgeServiceResult(job),
    });
    return reply.code(created ? 201 : 200).send(stored.result);
  });
  app.get('/v1/jobs/:id', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    return (await sync(stored)).result;
  });
  app.get('/v1/jobs/:id/history', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    const entries = await options.state.listByExternalSubmissionId(
      stored.result.externalSubmissionId,
    );
    return {
      items: await Promise.all(
        entries.map((entry) => sync(entry).then((value) => value.result)),
      ),
    };
  });
  app.post('/v1/jobs/:id/cancel', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    if (!options.queue.cancel)
      return reply
        .code(501)
        .send({ code: 'NOT_IMPLEMENTED', message: 'Cancellation unavailable' });
    const job = await options.queue.cancel(id);
    return (
      await options.state.save({
        ...stored,
        result: projectJudgeServiceResult(job, stored.result.acceptedAt),
      })
    ).result;
  });
  app.post('/v1/jobs/:id/rejudge', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    const body = request.body as { clientRequestId?: unknown } | undefined;
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    const clientRequestId = body?.clientRequestId;
    if (!opaque(clientRequestId))
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'clientRequestId is required',
      });
    const existing = await options.state.getByClientRequestId(clientRequestId);
    if (existing) return reply.send(existing.result);
    const { clientRequestId: previousClientRequestId, ...jobInput } =
      stored.request;
    void previousClientRequestId;
    const { job } = await options.queue.enqueue({
      ...jobInput,
      submissionId: stored.result.externalSubmissionId,
      ownerUserId: 'judge-service',
      evaluationGeneration: stored.result.evaluationGeneration + 1,
      idempotencyKey: clientRequestId,
    });
    const next = await options.state.save({
      clientRequestId,
      request: { ...stored.request, clientRequestId },
      result: projectJudgeServiceResult(job),
    });
    return reply.code(201).send(next.result);
  });
  return app;
}
