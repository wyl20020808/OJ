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

export type JudgeServiceAppOptions = {
  queue: JudgeJobRepository;
  state: JudgeServiceStateRepository;
  serviceToken: string;
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

export async function buildJudgeService(
  options: JudgeServiceAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
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
