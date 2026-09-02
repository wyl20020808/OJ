import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { createCache, checkCache } from '@ojplatform/cache';
import { createRedisRateLimiter } from './modules/auth/rate-limiter.js';
import { createStorage, checkStorage } from '@ojplatform/storage';
import { loadConfig, type RuntimeConfig } from './config.js';
import {
  createPostgresGuestAuthStore,
  RedisGuestRateLimiter,
  createMemoryAuthRepository,
  createPostgresAuthRepository,
  registerAuthModule,
} from './modules/auth/index.js';
import { registerContestModule } from './modules/contest/index.js';
import { registerSocialModule } from './modules/social/index.js';
import { registerProfileModule } from './modules/profile/index.js';
import { RedisFixedWindowLimiter } from './modules/social/rate-limiter.js';
import {
  InMemoryProblemRepository,
  PostgresProblemRepository,
  registerProblemModule,
} from './modules/problem/index.js';
import { createMemoryAuditHook } from './modules/authz/index.js';
import { createSubmissionAuthorizationPolicy } from './modules/authz/index.js';
import { createJudgeAuthorizationPolicy } from './modules/authz/judge.js';
import {
  InMemoryJudgeJobRepository,
  RedisJudgeJobRepository,
  registerJudgeModule,
} from './modules/judge/index.js';
import { registerWorkerControlRoutes } from './modules/judge/worker-control.js';
import {
  JudgeAdminAdapterClient,
  MemoryJudgeAdminAuditRepository,
  PostgresJudgeAdminAuditRepository,
  registerJudgeAdminRoutes,
} from './modules/judge-admin/index.js';
import type { JudgeAdminAdapter } from './modules/judge-admin/model.js';
import {
  createSandboxRuntime,
  registerSandboxControlRoutes,
} from './modules/sandbox/control.js';
import type { AuditHook as ProblemAuditHook } from './modules/problem/model.js';
import {
  PostgresSubmissionRepository,
  InMemorySubmissionRepository,
  registerSubmissionModule,
  publicationFromJudgeJob,
  publicSubmissionEvaluation,
  JudgeServiceClient,
  judgeServiceInput,
  productPublication,
  type ProblemRevisionResolver,
  type Submission,
} from './modules/submission/index.js';

const operatorUserIds = () =>
  new Set(
    (process.env.OJPLATFORM_OPERATOR_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
const operatorUsernames = () =>
  new Set(
    (process.env.OJPLATFORM_OPERATOR_USERNAMES ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

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
  operatorUserIds?: ReadonlySet<string>;
  operatorUsernames?: ReadonlySet<string>;
  realSubmissionExecution?: boolean;
  judgeAdminAdapter?: JudgeAdminAdapter;
  judgeAdminPermissions?: ReadonlyMap<string, ReadonlySet<string>>;
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
  const config = options.config ?? loadConfig();
  const realSubmissionExecution =
    options.realSubmissionExecution ??
    process.env.REAL_SUBMISSION_EXECUTION === 'true';
  const configuredOperatorUserIds =
    options.operatorUserIds ?? operatorUserIds();
  const configuredOperatorUsernames =
    options.operatorUsernames ?? operatorUsernames();
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
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
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
    const qualificationMode =
      process.env.OJPLATFORM_PHASE1E_QUALIFICATION === 'true';
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
    const authRepository = createPostgresAuthRepository(database.pool);
    const auth = await registerAuthModule(app, {
      repository: authRepository,
      production: process.env.NODE_ENV === 'production',
      auditHook,
      rateLimiter: createRedisRateLimiter(cache),
      guestStore: createPostgresGuestAuthStore(database.pool),
      guestRateLimiter: new RedisGuestRateLimiter(cache),
    });
    const adminAdapter =
      options.judgeAdminAdapter ??
      (process.env.JUDGE_SERVICE_ADMIN_URL &&
      process.env.JUDGE_SERVICE_ADMIN_TOKEN
        ? new JudgeAdminAdapterClient(
            process.env.JUDGE_SERVICE_ADMIN_URL,
            process.env.JUDGE_SERVICE_ADMIN_TOKEN,
          )
        : undefined);
    if (adminAdapter)
      await registerJudgeAdminRoutes(app, {
        adapter: adminAdapter,
        getAuthContext: async (request) =>
          (await auth.getAuthContext(request)) ?? undefined,
        can: async (ctx, permission) => {
          if (!ctx || ctx.strength !== 'password') return false;
          if (configuredOperatorUserIds.has(ctx.userId)) return true;
          if (options.judgeAdminPermissions?.get(ctx.userId)?.has(permission))
            return true;
          const result = await database.pool.query(
            'SELECT 1 FROM auth_user_roles ur JOIN auth_roles r ON r.name = ur.role_name WHERE ur.user_id = $1 AND $2 = ANY(r.permissions) LIMIT 1',
            [ctx.userId, permission],
          );
          return (result as { rowCount?: number }).rowCount === 1;
        },
        audit: new PostgresJudgeAdminAuditRepository(database.pool),
      });
    const submissionRepository = new PostgresSubmissionRepository(
      database.pool,
    );
    const judgeRepository = new RedisJudgeJobRepository(
      cache,
      process.env.OJPLATFORM_PHASE1E_REDIS_KEY_PREFIX ??
        (qualificationMode ? 'oj:judge:qualification' : 'oj:judge'),
    );
    const judgeService =
      process.env.JUDGE_SERVICE_URL && process.env.JUDGE_SERVICE_TOKEN
        ? new JudgeServiceClient(
            process.env.JUDGE_SERVICE_URL,
            process.env.JUDGE_SERVICE_TOKEN,
          )
        : undefined;
    await registerJudgeModule(app, {
      repository: judgeRepository,
      authorizationPolicy: createJudgeAuthorizationPolicy({
        resolveSubmissionOwner: async (submissionId) =>
          (await submissionRepository.get(submissionId))?.ownerUserId ?? null,
      }),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      resolveSubmissionOwner: async (submissionId) =>
        (await submissionRepository.get(submissionId))?.ownerUserId ?? null,
      qualificationMode,
      qualificationControlKey:
        process.env.OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY,
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
      repository: submissionRepository,
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
        if (judgeService) {
          const job = await judgeService.submit(
            judgeServiceInput(
              submission,
              `submission:${submission.id}:evaluation:1`,
              realSubmissionExecution,
            ),
          );
          await submissionRepository.beginEvaluation?.(
            submission.id,
            job.judgeJobId,
          );
          return;
        }
        const { job } = await judgeRepository.enqueue(
          judgeInputForSubmission(submission, realSubmissionExecution),
        );
        await submissionRepository.beginEvaluation?.(submission.id, job.id);
      },
      onRejudge: async (submission) => {
        const current = await submissionRepository.getEvaluation?.(
          submission.id,
        );
        if (
          current &&
          ['REJUDGE_PENDING', 'REJUDGING'].includes(current.status)
        )
          return;
        if (judgeService && current) {
          const job = await judgeService.rejudge(
            current.judgeJobId,
            `submission:${submission.id}:evaluation:${current.evaluationGeneration + 1}`,
          );
          await submissionRepository.startRejudge?.(
            submission.id,
            job.judgeJobId,
          );
          return;
        }
        const evaluationGeneration = (current?.evaluationGeneration ?? 0) + 1;
        const { job } = await judgeRepository.enqueue({
          ...judgeInputForSubmission(submission, realSubmissionExecution),
          evaluationGeneration,
          idempotencyKey: `submission:${submission.id}:evaluation:${evaluationGeneration}`,
        });
        await submissionRepository.startRejudge?.(submission.id, job.id);
      },
      evaluationHistory: async (submissionId) =>
        (await submissionRepository.listEvaluationHistory?.(submissionId)) ??
        [],
      projectJudge: async (submission) => {
        if (judgeService) {
          const current = await submissionRepository.getEvaluation?.(
            submission.id,
          );
          if (!current) return {};
          const job = await judgeService.get(current.judgeJobId);
          const publication = productPublication(job);
          if (publication)
            await submissionRepository.publishEvaluation?.(publication);
          const evaluation = await submissionRepository.getEvaluation?.(
            submission.id,
          );
          return {
            judgeJobId: job.judgeJobId,
            status:
              job.status === 'RUNNING'
                ? 'LEASED'
                : job.status === 'QUEUED'
                  ? 'QUEUED'
                  : job.status === 'COMPLETED_WITH_VERDICT'
                    ? 'EXECUTION_COMPLETED'
                    : job.status === 'CANCELLED'
                      ? 'CANCELLED'
                      : 'PROTOCOL_FAILURE',
            attempt: job.attemptGeneration,
            maxAttempts: 3,
            synthetic: false,
            executionStage: job.status,
            ...(publicSubmissionEvaluation(evaluation)
              ? { evaluation: publicSubmissionEvaluation(evaluation) }
              : {}),
          };
        }
        const job = await judgeRepository.getBySubmissionId(submission.id);
        if (!job) return {};
        const publication = publicationFromJudgeJob(job);
        if (publication)
          await submissionRepository.publishEvaluation?.(publication);
        const evaluation = await submissionRepository.getEvaluation?.(
          submission.id,
        );
        const status =
          job.status === 'QUEUED'
            ? 'QUEUED'
            : job.status === 'LEASED_FAKE' || job.status === 'LEASED'
              ? 'LEASED'
              : job.status === 'SUCCEEDED_FAKE'
                ? 'SYNTHETIC_COMPLETED'
                : job.status === 'COMPLETED'
                  ? 'EXECUTION_COMPLETED'
                  : job.status === 'FAILED_RETRYABLE'
                    ? 'RETRYABLE_FAILURE'
                    : job.status === 'CANCELLED'
                      ? 'CANCELLED'
                      : 'PROTOCOL_FAILURE';
        return {
          judgeJobId: job.id,
          status,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          synthetic: job.status === 'SUCCEEDED_FAKE',
          executionStage:
            job.status === 'QUEUED'
              ? 'QUEUED'
              : job.status === 'LEASED_FAKE'
                ? 'SAFE_FIXTURE_RUNNING'
                : job.status === 'LEASED'
                  ? 'REAL_EXECUTION_RUNNING'
                  : job.status === 'SUCCEEDED_FAKE'
                    ? 'SAFE_FIXTURE_SUCCEEDED'
                    : job.status === 'COMPLETED'
                      ? 'EXECUTION_COMPLETED'
                      : job.status === 'FAILED_RETRYABLE'
                        ? 'FAILED_RETRYABLE'
                        : job.status === 'CANCELLED'
                          ? 'CANCELLED'
                          : 'FAILED_TERMINAL',
          ...(publicSubmissionEvaluation(evaluation)
            ? { evaluation: publicSubmissionEvaluation(evaluation) }
            : {}),
        };
      },
    });
    await registerContestModule(app, {
      pool: database.pool,
      getAuth: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      audit: auditHook,
      problemExists: async (id) => Boolean(await problemRepository.get(id)),
    });
    await registerSocialModule(app, {
      pool: database.pool,
      getAuth: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      audit: auditHook,
      limiter: new RedisFixedWindowLimiter(cache),
    });
    await registerProfileModule(app, {
      pool: database.pool,
      getAuth: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
    });
    await registerWorkerControlRoutes(app, {
      cache,
      ...(process.env.OJPLATFORM_WORKER_HEARTBEAT_PREFIX
        ? { heartbeatPrefix: process.env.OJPLATFORM_WORKER_HEARTBEAT_PREFIX }
        : {}),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      judgeRepository,
      resolveSubmission: async (submissionId) =>
        (await submissionRepository.get(submissionId)) ?? undefined,
      submissionRepository,
      operatorUserIds: configuredOperatorUserIds,
    });
    const sandboxRuntime = await createSandboxRuntime();
    await registerSandboxControlRoutes(app, {
      runtime: sandboxRuntime,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      operatorUserIds: configuredOperatorUserIds,
      operatorUsernames: configuredOperatorUsernames,
      resolveUserName: async (userId) => (await auth.getUser(userId))?.username,
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
        await sandboxRuntime.close();
        await database.pool.end();
        cache.disconnect();
        storage.client.destroy();
      },
    };
    app.addHook('onClose', async () => owned?.close());
  }
  if (!options.withInfrastructure) {
    const qualificationMode =
      process.env.OJPLATFORM_PHASE1E_QUALIFICATION === 'true';
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
    const adminAdapter =
      options.judgeAdminAdapter ??
      new JudgeAdminAdapterClient('http://127.0.0.1:0', 'unconfigured');
    await registerJudgeAdminRoutes(app, {
      adapter: adminAdapter,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      can: (ctx, permission) =>
        Boolean(
          ctx &&
          ctx.strength === 'password' &&
          options.judgeAdminPermissions?.get(ctx.userId)?.has(permission),
        ),
      audit: new MemoryJudgeAdminAuditRepository(),
    });
    const submissionRepository = new InMemorySubmissionRepository();
    const judgeRepository = new InMemoryJudgeJobRepository();
    await registerJudgeModule(app, {
      repository: judgeRepository,
      authorizationPolicy: createJudgeAuthorizationPolicy({
        resolveSubmissionOwner: async (submissionId) =>
          (await submissionRepository.get(submissionId))?.ownerUserId ?? null,
      }),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      resolveSubmissionOwner: async (submissionId) =>
        (await submissionRepository.get(submissionId))?.ownerUserId ?? null,
      qualificationMode,
      qualificationControlKey:
        process.env.OJPLATFORM_PHASE1E_QUALIFICATION_CONTROL_KEY,
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
      repository: submissionRepository,
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
        const { job } = await judgeRepository.enqueue(
          judgeInputForSubmission(submission, realSubmissionExecution),
        );
        await submissionRepository.beginEvaluation?.(submission.id, job.id);
      },
      onRejudge: async (submission) => {
        const current = await submissionRepository.getEvaluation?.(
          submission.id,
        );
        if (
          current &&
          ['REJUDGE_PENDING', 'REJUDGING'].includes(current.status)
        )
          return;
        const evaluationGeneration = (current?.evaluationGeneration ?? 0) + 1;
        const { job } = await judgeRepository.enqueue({
          ...judgeInputForSubmission(submission, realSubmissionExecution),
          evaluationGeneration,
          idempotencyKey: `submission:${submission.id}:evaluation:${evaluationGeneration}`,
        });
        await submissionRepository.startRejudge?.(submission.id, job.id);
      },
      evaluationHistory: async (submissionId) =>
        (await submissionRepository.listEvaluationHistory?.(submissionId)) ??
        [],
      projectJudge: async (submission) => {
        const job = await judgeRepository.getBySubmissionId(submission.id);
        if (!job) return {};
        const publication = publicationFromJudgeJob(job);
        if (publication)
          await submissionRepository.publishEvaluation?.(publication);
        const evaluation = await submissionRepository.getEvaluation?.(
          submission.id,
        );
        const status =
          job.status === 'QUEUED'
            ? 'QUEUED'
            : job.status === 'LEASED_FAKE' || job.status === 'LEASED'
              ? 'LEASED'
              : job.status === 'SUCCEEDED_FAKE'
                ? 'SYNTHETIC_COMPLETED'
                : job.status === 'COMPLETED'
                  ? 'EXECUTION_COMPLETED'
                  : job.status === 'FAILED_RETRYABLE'
                    ? 'RETRYABLE_FAILURE'
                    : job.status === 'CANCELLED'
                      ? 'CANCELLED'
                      : 'PROTOCOL_FAILURE';
        return {
          judgeJobId: job.id,
          status,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          synthetic: job.status === 'SUCCEEDED_FAKE',
          executionStage:
            job.status === 'QUEUED'
              ? 'QUEUED'
              : job.status === 'LEASED_FAKE'
                ? 'SAFE_FIXTURE_RUNNING'
                : job.status === 'LEASED'
                  ? 'REAL_EXECUTION_RUNNING'
                  : job.status === 'SUCCEEDED_FAKE'
                    ? 'SAFE_FIXTURE_SUCCEEDED'
                    : job.status === 'COMPLETED'
                      ? 'EXECUTION_COMPLETED'
                      : job.status === 'FAILED_RETRYABLE'
                        ? 'FAILED_RETRYABLE'
                        : job.status === 'CANCELLED'
                          ? 'CANCELLED'
                          : 'FAILED_TERMINAL',
          ...(publicSubmissionEvaluation(evaluation)
            ? { evaluation: publicSubmissionEvaluation(evaluation) }
            : {}),
        };
      },
    });
    await registerWorkerControlRoutes(app, {
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      judgeRepository,
      resolveSubmission: async (submissionId) =>
        (await submissionRepository.get(submissionId)) ?? undefined,
      submissionRepository,
      operatorUserIds: configuredOperatorUserIds,
    });
    const sandboxRuntime = await createSandboxRuntime();
    await registerSandboxControlRoutes(app, {
      runtime: sandboxRuntime,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      operatorUserIds: configuredOperatorUserIds,
      operatorUsernames: configuredOperatorUsernames,
      resolveUserName: async (userId) => (await auth.getUser(userId))?.username,
    });
    app.addHook('onClose', async () => sandboxRuntime.close());
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

function judgeInputForSubmission(
  submission: Submission,
  realSubmissionExecution: boolean,
) {
  const base = {
    submissionId: submission.id,
    ownerUserId: submission.ownerUserId,
    problemId: submission.problemId,
    problemRevisionId: submission.problemRevisionId,
    testdataVersionRef: submission.testdataVersionRef,
    languageId: submission.languageId,
  };
  if (!realSubmissionExecution || submission.languageId !== 'cpp20')
    return base;
  return {
    ...base,
    executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
    languageProfileId: 'cpp20-gcc-13-v1' as const,
    sourceSnapshotRef: `submission:${submission.id}`,
    sourceBytes: submission.source,
    sourceSha256: createHash('sha256')
      .update(submission.source, 'utf8')
      .digest('hex'),
    controlledInputId: 'stdin-empty-v1' as const,
    testcaseId: 'sample-1',
    testcaseInput: '',
    testcaseInputSha256: createHash('sha256').update('', 'utf8').digest('hex'),
    executionProfileId: 'cpp20-gcc-13-v1' as const,
  };
}
