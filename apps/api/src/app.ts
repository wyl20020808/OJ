import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import type { IncomingMessage } from 'node:http';
import { Type } from '@sinclair/typebox';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { createCache, checkCache } from '@ojplatform/cache';
import { createStorage, checkStorage } from '@ojplatform/storage';
import { loadConfig, type RuntimeConfig } from './config.js';
import {
  createMemoryAuthRepository,
  createPostgresAuthRepository,
  registerAuthModule,
} from './modules/auth/index.js';
import {
  InMemoryProblemRepository,
  PostgresProblemRepository,
  registerProblemModule,
} from './modules/problem/index.js';
import { createMemoryAuditHook } from './modules/authz/index.js';
import { createSubmissionAuthorizationPolicy } from './modules/authz/index.js';
import {
  InMemoryJudgeJobRepository,
  RedisJudgeJobRepository,
  registerJudgeModule,
} from './modules/judge/index.js';
import type { AuditHook as ProblemAuditHook } from './modules/problem/model.js';
import {
  PostgresSubmissionRepository,
  InMemorySubmissionRepository,
  registerSubmissionModule,
  type ProblemRevisionResolver,
} from './modules/submission/index.js';

const HealthResponse = Type.Object({ status: Type.Literal('ok') });
const ReadyResponse = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('not_ready')]),
  dependencies: Type.Record(
    Type.String(),
    Type.Union([Type.Literal('ok'), Type.Literal('unavailable')]),
  ),
});
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});
export type AppOptions = {
  logger?: boolean;
  exposeTestErrorRoute?: boolean;
  withInfrastructure?: boolean;
  config?: RuntimeConfig;
};
type Owned = {
  close: () => Promise<void>;
  checks: Record<string, () => Promise<void>>;
};

const bounded = async (
  task: () => Promise<void>,
  timeoutMs = 1200,
): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('dependency timeout')),
          timeoutMs,
        );
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: (request: IncomingMessage) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' &&
        /^[A-Za-z0-9._:-]{1,96}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    },
  });
  await app.register(cors, { origin: true });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  await app.register(swagger, {
    openapi: { info: { title: 'OJPlatform API', version: '0.3.0' } },
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400
        ? error.statusCode
        : 500;
    return reply.status(statusCode).send({
      code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: statusCode === 404 ? 'Route not found' : 'Internal server error',
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: request.id,
    }),
  );

  let owned: Owned | undefined;
  if (options.withInfrastructure) {
    const config = options.config ?? loadConfig();
    const database = createDatabase({ url: config.databaseUrl });
    const cache = createCache({ url: config.redisUrl });
    const storage = createStorage({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      bucket: config.s3Bucket,
    });
    const auditHook = createMemoryAuditHook();
    const problemAuditHook: ProblemAuditHook = {
      record: (event) =>
        auditHook.record({
          ...event,
          outcome: event.outcome === 'success' ? 'allowed' : 'denied',
          requestId: event.requestId ?? 'internal',
        }),
    };
    const auth = await registerAuthModule(app, {
      repository: createPostgresAuthRepository(database.pool),
      production: process.env.NODE_ENV === 'production',
      auditHook,
    });
    const judgeRepository = new RedisJudgeJobRepository(cache);
    await registerJudgeModule(app, {
      repository: judgeRepository,
      authorizationPolicy: (
        await import('./modules/authz/judge.js')
      ).createJudgeAuthorizationPolicy(),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
    });
    const problemRepository = new PostgresProblemRepository(database.pool);
    await registerProblemModule(app, {
      repository: problemRepository,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      authorizationPolicy: {
        can: async (action, resource, context, target) =>
          resource === 'problem' &&
          Boolean(
            context?.userId &&
            context.sessionId &&
            context.strength === 'password',
          ) &&
          Boolean(target?.id || !target) &&
          ['read', 'create', 'update', 'transition'].includes(action),
      },
      auditHook: problemAuditHook,
    });
    const submissionPolicy = createSubmissionAuthorizationPolicy();
    const problemResolver: ProblemRevisionResolver = {
      getRevision: async (problemId, revisionId) => {
        const revisions = await problemRepository.revisions(problemId);
        const revision = revisions.find(
          (item) => item.revisionId === revisionId,
        );
        if (
          !revision ||
          revision.status !== 'published' ||
          revision.visibility !== 'public'
        )
          return undefined;
        return {
          problemId,
          revisionId: revision.revisionId,
          testdataVersionRef: revision.testdataVersion,
        };
      },
    };
    await registerSubmissionModule(app, {
      repository: new PostgresSubmissionRepository(database.pool),
      authorizationPolicy: {
        canSubmit: (context, revision) =>
          submissionPolicy.canSubmit(
            { id: context.userId, status: 'active' },
            {
              id: revision.revisionId,
              problemId: revision.problemId,
              status: 'published',
              visibility: 'public',
            },
          ),
        canViewSubmission: (context, submission) =>
          submissionPolicy.canViewSubmission(
            { id: context.userId, status: 'active' },
            {
              id: submission.id,
              ownerUserId: submission.ownerUserId,
              problemId: submission.problemId,
              problemRevisionId: '',
              status: 'PENDING',
            },
          ),
        listOwnSubmissions: (context) =>
          submissionPolicy.canListOwnSubmissions({
            id: context.userId,
            status: 'active',
          }),
      },
      problemResolver,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      onCreated: async (submission) => {
        await judgeRepository.enqueue({
          submissionId: submission.id,
          ownerUserId: submission.ownerUserId,
          problemId: submission.problemId,
          problemRevisionId: submission.problemRevisionId,
          testdataVersionRef: submission.testdataVersionRef,
          languageId: submission.languageId,
        });
      },
      projectJudge: async (submission) => {
        const job = await judgeRepository.getBySubmissionId(submission.id);
        if (!job) return {};
        return {
          judgeJobId: job.id,
          status:
            job.status === 'QUEUED'
              ? 'QUEUED'
              : job.status === 'LEASED'
                ? 'LEASED'
                : job.status === 'COMPLETED'
                  ? 'SYNTHETIC_COMPLETED'
                  : job.status === 'RETRYABLE_FAILURE'
                    ? 'RETRYABLE_FAILURE'
                    : 'PROTOCOL_FAILURE',
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          synthetic: job.status === 'COMPLETED',
        };
      },
    });
    owned = {
      checks: {
        postgres: () => checkDatabase(database.pool),
        redis: async () => {
          if (cache.status !== 'ready') await cache.connect();
          return checkCache(cache);
        },
        storage: () => checkStorage(storage),
      },
      close: async () => {
        await database.pool.end();
        cache.disconnect();
        storage.client.destroy();
      },
    };
    app.addHook('onClose', async () => owned?.close());
  }
  if (!options.withInfrastructure) {
    const auditHook = createMemoryAuditHook();
    const problemAuditHook: ProblemAuditHook = {
      record: (event) =>
        auditHook.record({
          ...event,
          outcome: event.outcome === 'success' ? 'allowed' : 'denied',
          requestId: event.requestId ?? 'internal',
        }),
    };
    const auth = await registerAuthModule(app, {
      repository: createMemoryAuthRepository(),
      auditHook,
    });
    const judgeRepository = new InMemoryJudgeJobRepository();
    await registerJudgeModule(app, {
      repository: judgeRepository,
      authorizationPolicy: (
        await import('./modules/authz/judge.js')
      ).createJudgeAuthorizationPolicy(),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
    });
    const problemRepository = new InMemoryProblemRepository();
    await registerProblemModule(app, {
      repository: problemRepository,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      authorizationPolicy: {
        can: async (action, resource, context, target) =>
          resource === 'problem' &&
          Boolean(
            context?.userId &&
            context.sessionId &&
            context.strength === 'password',
          ) &&
          Boolean(target?.id || !target) &&
          ['read', 'create', 'update', 'transition'].includes(action),
      },
      auditHook: problemAuditHook,
    });
    const submissionPolicy = createSubmissionAuthorizationPolicy();
    await registerSubmissionModule(app, {
      repository: new InMemorySubmissionRepository(),
      authorizationPolicy: {
        canSubmit: (context, revision) =>
          submissionPolicy.canSubmit(
            { id: context.userId, status: 'active' },
            {
              id: revision.revisionId,
              problemId: revision.problemId,
              status: 'published',
              visibility: 'public',
            },
          ),
        canViewSubmission: (context, submission) =>
          submissionPolicy.canViewSubmission(
            { id: context.userId, status: 'active' },
            {
              id: submission.id,
              ownerUserId: submission.ownerUserId,
              problemId: submission.problemId,
              problemRevisionId: '',
              status: 'PENDING',
            },
          ),
        listOwnSubmissions: (context) =>
          submissionPolicy.canListOwnSubmissions({
            id: context.userId,
            status: 'active',
          }),
      },
      problemResolver: {
        getRevision: async (problemId, revisionId) => {
          const revisions = await problemRepository.revisions(problemId);
          const revision = revisions.find(
            (item) => item.revisionId === revisionId,
          );
          if (
            !revision ||
            revision.status !== 'published' ||
            revision.visibility !== 'public'
          )
            return undefined;
          return {
            problemId,
            revisionId: revision.revisionId,
            testdataVersionRef: revision.testdataVersion,
          };
        },
      },
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      onCreated: async (submission) => {
        await judgeRepository.enqueue({
          submissionId: submission.id,
          ownerUserId: submission.ownerUserId,
          problemId: submission.problemId,
          problemRevisionId: submission.problemRevisionId,
          testdataVersionRef: submission.testdataVersionRef,
          languageId: submission.languageId,
        });
      },
      projectJudge: async (submission) => {
        const job = await judgeRepository.getBySubmissionId(submission.id);
        if (!job) return {};
        return {
          judgeJobId: job.id,
          status:
            job.status === 'QUEUED'
              ? 'QUEUED'
              : job.status === 'LEASED'
                ? 'LEASED'
                : job.status === 'COMPLETED'
                  ? 'SYNTHETIC_COMPLETED'
                  : job.status === 'RETRYABLE_FAILURE'
                    ? 'RETRYABLE_FAILURE'
                    : 'PROTOCOL_FAILURE',
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          synthetic: job.status === 'COMPLETED',
        };
      },
    });
  }
  app.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get(
    '/ready',
    { schema: { response: { 200: ReadyResponse, 503: ReadyResponse } } },
    async (_request, reply) => {
      if (!owned) return { status: 'ok' as const, dependencies: {} };
      const entries = await Promise.all(
        Object.entries(owned.checks).map(
          async ([name, check]) =>
            [name, (await bounded(check)) ? 'ok' : 'unavailable'] as const,
        ),
      );
      const dependencies = Object.fromEntries(entries);
      const ready = Object.values(dependencies).every(
        (value) => value === 'ok',
      );
      return reply.status(ready ? 200 : 503).send({
        status: ready ? ('ok' as const) : ('not_ready' as const),
        dependencies,
      });
    },
  );
  app.get('/openapi.json', async () => app.swagger());
  if (options.exposeTestErrorRoute)
    app.get(
      '/__test__/error',
      { schema: { response: { 500: ErrorResponse } } },
      async () => {
        throw new Error('intentional test failure at D:\\private\\internal.ts');
      },
    );
  return app;
}
