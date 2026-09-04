import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { TestcaseSetManifest } from '@ojplatform/judge-runtime';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { createCache, checkCache } from '@ojplatform/cache';
import { createRedisRateLimiter } from './modules/auth/rate-limiter.js';
import { createStorage, checkStorage, ensureBucket } from '@ojplatform/storage';
import { loadConfig, type RuntimeConfig } from './config.js';
import {
  createPostgresGuestAuthStore,
  createMemoryGuestAuthStore,
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
  ProductJudgeDataSubmissionBridge,
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
  ProblemJudgeDataService,
  InMemoryJudgeDataRepository,
  PostgresJudgeDataRepository,
  MemoryByteStorage,
  S3ByteStorage,
  registerProblemJudgeDataRoutes,
} from './modules/problem-judge-data/index.js';
import {
  PostgresSubmissionRepository,
  InMemorySubmissionRepository,
  registerSubmissionModule,
  publicationFromJudgeJob,
  publicSubmissionEvaluation,
  JudgeServiceClient,
  judgeServiceInput,
  productPublication,
  RedisEvaluationEventHub,
  RedisJudgeProgressBridge,
  type ProblemRevisionResolver,
  type Submission,
} from './modules/submission/index.js';
import type { JudgeProgressEvent } from '@ojplatform/judge-runtime';
import {
  registerCodeRunRoutes,
  codeRunResultFromJob,
} from './modules/code-run/routes.js';

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
  judgeAdminPermissions?: ReadonlyMap<string, ReadonlySet<string>>;
  realSubmissionExecution?: boolean;
  judgeAdminAdapter?: JudgeAdminAdapter;
};
type Owned = {
  close: () => Promise<void>;
  checks: Record<string, () => Promise<void>>;
};

type GuestAuthoringLimiter = {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
};

function createMemoryGuestAuthoringLimiter(): GuestAuthoringLimiter {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return {
    async consume(key, limit, windowSeconds) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.expiresAt <= now) {
        buckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
        return true;
      }
      bucket.count += 1;
      return bucket.count <= limit;
    },
  };
}

async function guardGuestAuthoring(
  limiter: GuestAuthoringLimiter,
  actor: { strength?: string; userId?: string },
  scope: string,
) {
  if (actor.strength !== 'guest' || !actor.userId) return;
  try {
    const create = scope === 'create';
    const submission = scope === 'submission';
    if (
      !(await limiter.consume(
        `guest:${actor.userId}:${scope}`,
        create ? 5 : submission ? 20 : 60,
        create ? 3600 : 60,
      ))
    )
      throw new Error('RATE_LIMITED');
  } catch {
    throw new Error('RATE_LIMITED');
  }
}

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
    const evaluationEventSubscriber = cache.duplicate();
    await evaluationEventSubscriber.connect();
    const evaluationEventHub = new RedisEvaluationEventHub(
      cache,
      evaluationEventSubscriber,
    );
    await evaluationEventHub.connect();
    const judgeProgressSubscriber = cache.duplicate();
    await judgeProgressSubscriber.connect();
    const storage = createStorage({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      bucket: config.s3Bucket,
    });
    await ensureBucket(storage);
    const guestAuthoringLimiter = new RedisFixedWindowLimiter(
      cache,
      'ojplatform:guest-authoring:rate',
    );
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
        : new JudgeAdminAdapterClient('http://127.0.0.1:0', 'unconfigured'));
    await registerJudgeAdminRoutes(app, {
      adapter: adminAdapter,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      can: async (ctx, permission) => {
        if (!ctx || ctx.strength !== 'password') return false;
        if (configuredOperatorUserIds.has(ctx.userId)) return true;
        const operator = await auth.getUser(ctx.userId);
        if (
          operator?.username &&
          configuredOperatorUsernames.has(operator.username.toLowerCase())
        )
          return true;
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
    let judgeProgressBridge: RedisJudgeProgressBridge | undefined;
    await registerCodeRunRoutes(app, {
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      submit: async (input) => {
        if (!judgeService) throw new Error('JUDGE_SERVICE_UNAVAILABLE');
        const result = await judgeService.submit(input);
        return {
          judgeJobId: result.judgeJobId,
          status: result.status,
          ...(result.codeRun ? { codeRun: result.codeRun } : {}),
        };
      },
      get: async (runId) => {
        if (!judgeService) return undefined;
        const result = await judgeService.get(runId);
        return {
          judgeJobId: result.judgeJobId,
          status: result.status,
          ...(result.codeRun ? { codeRun: result.codeRun } : {}),
        };
      },
    });
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
    const hasPermissions = async (
      userId: string,
      required: readonly string[],
    ) => {
      if (
        required.every((permission) =>
          options.judgeAdminPermissions?.get(userId)?.has(permission),
        )
      )
        return true;
      const result = await database.pool.query(
        'SELECT COUNT(DISTINCT p.permission)::int AS matched FROM auth_user_roles ur JOIN auth_roles r ON r.name=ur.role_name CROSS JOIN LATERAL unnest(r.permissions) p(permission) WHERE ur.user_id=$1 AND p.permission = ANY($2::text[])',
        [userId, required],
      );
      return Number(result.rows[0]?.matched ?? 0) === required.length;
    };
    await registerProblemModule(app, {
      repository: problemRepository,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      authorizationPolicy: {
        can: async (action, resource, context, target) => {
          if (
            resource !== 'problem' ||
            !context?.userId ||
            !context.sessionId ||
            !['read', 'create', 'update', 'transition'].includes(action)
          )
            return false;
          if (action === 'create') return true;
          if (!target?.id) return false;
          const problem = await problemRepository.get(target.id);
          if (!problem) return false;
          if (problem.authorId === context.userId) return true;
          return (
            context.strength === 'password' &&
            (await hasPermissions(context.userId, ['problem.edit']))
          );
        },
      },
      auditHook: problemAuditHook,
      guardGuestMutation: (action, context) =>
        guardGuestAuthoring(guestAuthoringLimiter, context, action),
      projectMetadata: async (problem) => {
        const creator = problem.authorId
          ? await auth.getUser(problem.authorId)
          : undefined;
        return {
          sourceType: 'CREATOR' as const,
          source:
            creator?.displayName ?? (problem.authorId ? 'Unknown user' : null),
        };
      },
    });
    const judgeDataRepository = new PostgresJudgeDataRepository(database.pool);
    const judgeDataStorage = new S3ByteStorage(storage.client, storage.bucket);
    const judgeData = new ProblemJudgeDataService(
      judgeDataRepository,
      judgeDataStorage,
      async (id) => Boolean(await problemRepository.get(id)),
      async (action, context, problemId) => {
        const permission = (
          {
            view: 'problem.judge_data.view',
            manage: 'problem.judge_data.manage',
            publish: 'problem.judge_data.publish',
          } as Record<string, string>
        )[action];
        const actor = context as
          { strength?: string; userId?: string } | undefined;
        if (!permission || !actor || !actor.userId) return false;
        const actorId: string = actor.userId;
        const problem = await problemRepository.get(problemId);
        if (!problem) return false;
        if (problem.authorId === actorId) return true;
        if (actor.strength !== 'password') return false;
        const required: string[] =
          action === 'view' ? [permission] : [permission, 'problem.edit'];
        if (
          required.every((p) =>
            options.judgeAdminPermissions?.get(actorId as string)?.has(p),
          )
        )
          return true;
        const result = await database.pool.query(
          'SELECT COUNT(DISTINCT p.permission)::int AS matched FROM auth_user_roles ur JOIN auth_roles r ON r.name=ur.role_name CROSS JOIN LATERAL unnest(r.permissions) p(permission) WHERE ur.user_id=$1 AND p.permission = ANY($2::text[])',
          [actorId, required],
        );
        return Number(result.rows[0]?.matched ?? 0) === required.length;
      },
      async (problemId) => {
        const problem = await problemRepository.get(problemId);
        if (!problem?.currentRevisionId)
          throw new Error('Problem revision identity unavailable');
        const revision = (await problemRepository.revisions(problemId)).find(
          (item) => item.revisionId === problem.currentRevisionId,
        );
        const testdataVersionId =
          revision?.testdataVersion ??
          problem.testdataVersion ??
          `judge-data-${problem.currentRevisionId}`;
        return {
          problemRevisionId: problem.currentRevisionId,
          testdataVersionId,
          testcaseSetId: `judge-data-${problem.currentRevisionId}`,
          executionProfileId: 'cpp20-gcc-13-v1' as const,
        };
      },
      async (action, user) => {
        try {
          await guardGuestAuthoring(
            guestAuthoringLimiter,
            user as { strength?: string; userId?: string },
            action,
          );
        } catch {
          throw new Error('RATE_LIMITED');
        }
      },
    );
    await registerProblemJudgeDataRoutes(app, {
      service: judgeData,
      getAuth: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      resolveProblemId: async (key) => (await problemRepository.get(key))?.id,
    });
    const submissionJudgeData = new ProductJudgeDataSubmissionBridge(
      judgeDataRepository,
      judgeDataStorage,
    );
    const submissionPolicy = createSubmissionAuthorizationPolicy();
    const problemResolver: ProblemRevisionResolver = {
      getRevision: async (problemId, revisionId) => {
        const revisions = await problemRepository.revisions(problemId);
        const revision = revisions.find(
          (item) => item.revisionId === revisionId,
        );
        if (!revision) return undefined;
        return {
          problemId,
          revisionId: revision.revisionId,
          testdataVersionRef: revision.testdataVersion,
        };
      },
    };
    await registerSubmissionModule(app, {
      eventHub: evaluationEventHub,
      repository: submissionRepository,
      authorizationPolicy: {
        canSubmit: async (context, reference) => {
          const revision = (
            await problemRepository.revisions(reference.problemId)
          ).find((item) => item.revisionId === reference.revisionId);
          if (!revision) return false;
          return submissionPolicy.canSubmit(
            { id: context.userId, status: 'active' },
            {
              id: revision.revisionId,
              problemId: reference.problemId,
              authorId: revision.authorId,
              status: revision.status,
              visibility: revision.visibility,
            },
          );
        },
        canViewSubmission: async (context, submission) =>
          (await submissionPolicy.canViewSubmission(
            { id: context.userId, status: 'active' },
            {
              id: submission.id,
              ownerUserId: submission.ownerUserId,
              problemId: submission.problemId,
              problemRevisionId: '',
              status: 'PENDING',
            },
          )) ||
          (context.strength === 'password' &&
            (await hasPermissions(context.userId, ['submission:view:any']))),
        listOwnSubmissions: (context) =>
          submissionPolicy.canListOwnSubmissions({
            id: context.userId,
            status: 'active',
          }),
        canListGlobalSubmissions: () => true,
      },
      problemResolver,
      judgeDataResolver: submissionJudgeData,
      guardCreate: async (context) =>
        guardGuestAuthoring(guestAuthoringLimiter, context, 'submission'),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      onCreated: async (submission) => {
        const testcaseSet = await submissionJudgeData.manifest(submission);
        if (judgeService) {
          const job = await judgeService.submit(
            judgeServiceInput(
              submission,
              `submission:${submission.id}:evaluation:1`,
              realSubmissionExecution,
              testcaseSet,
            ),
          );
          await submissionRepository.beginEvaluation?.(
            submission.id,
            job.judgeJobId,
          );
          return;
        }
        const { job } = await judgeRepository.enqueue(
          judgeInputForSubmission(
            submission,
            realSubmissionExecution,
            testcaseSet,
          ),
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
        const testcaseSet = await submissionJudgeData.manifest(submission);
        const { job } = await judgeRepository.enqueue({
          ...judgeInputForSubmission(
            submission,
            realSubmissionExecution,
            testcaseSet,
          ),
          evaluationGeneration,
          idempotencyKey: `submission:${submission.id}:evaluation:${evaluationGeneration}`,
        });
        await submissionRepository.startRejudge?.(submission.id, job.id);
      },
      evaluationHistory: async (submissionId) =>
        (await submissionRepository.listEvaluationHistory?.(submissionId)) ??
        [],
      projectGlobalListItem: async (submission) => {
        const [problem, submitter] = await Promise.all([
          problemRepository.get(submission.problemId),
          auth.getUser(submission.ownerUserId),
        ]);
        return {
          problem: problem
            ? {
                id: problem.id,
                slug: problem.slug,
                title: problem.title,
                publicId: problem.publicId,
              }
            : {
                id: submission.problemId,
                slug: submission.problemId,
                title: 'Unavailable',
              },
          submitter: {
            id: submission.ownerUserId,
            displayName: submitter?.displayName ?? 'Unknown user',
          },
        };
      },
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
    if (judgeService) {
      judgeProgressBridge = new RedisJudgeProgressBridge(
        judgeProgressSubscriber,
        async (event: JudgeProgressEvent) => {
          const current = await submissionRepository.getEvaluation?.(
            event.submissionId,
          );
          if (
            !current ||
            current.judgeJobId !== event.judgeJobId ||
            current.evaluationGeneration !== event.evaluationGeneration
          )
            return;
          if (
            [
              'COMPLETED_WITH_VERDICT',
              'CANCELLED',
              'INFRA_FAILED',
              'NO_VERDICT',
              'INCOMPLETE',
            ].includes(current.status) &&
            event.phase !== 'EVALUATION_TERMINAL'
          )
            return;
          let status = current.status;
          let detail = current.detail;
          if (
            event.phase === 'EVALUATION_STARTED' ||
            event.phase === 'TESTCASE_STARTED' ||
            event.phase === 'TESTCASE_TERMINAL'
          ) {
            status = 'RUNNING';
            if (detail && event.testcaseOrdinal) {
              const testcases = detail.testcases.map((testcase) => ({
                ...testcase,
              }));
              const index = event.testcaseOrdinal - 1;
              const testcase = testcases[index];
              if (testcase) {
                if (event.phase === 'TESTCASE_STARTED')
                  testcase.status = 'RUNNING';
                if (event.phase === 'TESTCASE_TERMINAL') {
                  testcase.status = event.verdict ?? 'SKIPPED';
                  if (event.verdict) testcase.verdict = event.verdict;
                  if (event.timeMs !== undefined)
                    testcase.timeMs = event.timeMs;
                  if (event.memoryBytes !== undefined)
                    testcase.memoryBytes = event.memoryBytes;
                }
                const completed = testcases.filter((item) =>
                  [
                    'AC',
                    'WA',
                    'CE',
                    'RE',
                    'TLE',
                    'MLE',
                    'CANCELLED',
                    'SKIPPED',
                  ].includes(item.status ?? ''),
                ).length;
                detail = {
                  ...detail,
                  completedTestcaseCount: completed,
                  testcases,
                };
              }
            }
          }
          if (event.phase === 'EVALUATION_TERMINAL') {
            const job = await judgeService.get(event.judgeJobId);
            const publication = productPublication(job);
            if (publication) {
              const published =
                await submissionRepository.publishEvaluation?.(publication);
              if (published) evaluationEventHub.publish(published);
              return;
            }
            status =
              event.state === 'CANCELLED'
                ? 'CANCELLED'
                : event.state === 'FAILED_TERMINAL'
                  ? 'INFRA_FAILED'
                  : 'NO_VERDICT';
          }
          const published = await submissionRepository.publishEvaluation?.({
            submissionId: current.submissionId,
            judgeJobId: current.judgeJobId,
            evaluationGeneration: current.evaluationGeneration,
            attemptGeneration: event.attemptGeneration,
            status,
            ...(detail ? { detail } : {}),
            ...(status === 'COMPLETED_WITH_VERDICT'
              ? { verdict: current.verdict }
              : {}),
            evaluationRecordDigest: `${event.judgeJobId}:progress:${event.id}`,
          });
          if (published) evaluationEventHub.publish(published);
        },
      );
      await judgeProgressBridge.connect();
    }
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
        evaluationEventSubscriber.disconnect();
        judgeProgressSubscriber.disconnect();
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
    const memoryAuthRepository = createMemoryAuthRepository();
    const memoryGuestLimiter = createMemoryGuestAuthoringLimiter();
    const auth = await registerAuthModule(app, {
      repository: memoryAuthRepository,
      auditHook,
      guestStore: createMemoryGuestAuthStore(memoryAuthRepository),
      guestRateLimiter: memoryGuestLimiter,
    });
    const adminAdapter =
      options.judgeAdminAdapter ??
      new JudgeAdminAdapterClient('http://127.0.0.1:0', 'unconfigured');
    await registerJudgeAdminRoutes(app, {
      adapter: adminAdapter,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      can: (ctx, permission) =>
        (async () => {
          if (!ctx || ctx.strength !== 'password') return false;
          if (configuredOperatorUserIds.has(ctx.userId)) return true;
          const operator = await auth.getUser(ctx.userId);
          if (
            operator?.username &&
            configuredOperatorUsernames.has(operator.username.toLowerCase())
          )
            return true;
          return Boolean(
            options.judgeAdminPermissions?.get(ctx.userId)?.has(permission),
          );
        })(),
      audit: new MemoryJudgeAdminAuditRepository(),
    });
    const submissionRepository = new InMemorySubmissionRepository();
    const judgeRepository = new InMemoryJudgeJobRepository();
    await registerCodeRunRoutes(app, {
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      submit: async (input) => {
        const { clientRequestId, externalSubmissionId, ...job } = input as any;
        const result = await judgeRepository.enqueue({
          ...job,
          submissionId: externalSubmissionId,
          ownerUserId: 'code-run',
          idempotencyKey: clientRequestId,
        });
        return { judgeJobId: result.job.id, status: result.job.status };
      },
      get: async (runId) => {
        const job = await judgeRepository.getById(runId);
        return job ? codeRunResultFromJob(job) : undefined;
      },
    });
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
    const guestAuthoringLimiter = createMemoryGuestAuthoringLimiter();
    const hasPermissions = (userId: string, required: readonly string[]) =>
      required.every((permission) =>
        options.judgeAdminPermissions?.get(userId)?.has(permission),
      );
    await registerProblemModule(app, {
      repository: problemRepository,
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      authorizationPolicy: {
        can: async (action, resource, context, target) => {
          if (
            resource !== 'problem' ||
            !context?.userId ||
            !context.sessionId ||
            !['read', 'create', 'update', 'transition'].includes(action)
          )
            return false;
          if (action === 'create') return true;
          if (!target?.id) return false;
          const problem = await problemRepository.get(target.id);
          if (!problem) return false;
          if (problem.authorId === context.userId) return true;
          return (
            context.strength === 'password' &&
            hasPermissions(context.userId, ['problem.edit'])
          );
        },
      },
      auditHook: problemAuditHook,
      guardGuestMutation: (action, context) =>
        guardGuestAuthoring(guestAuthoringLimiter, context, action),
      projectMetadata: async (problem) => {
        const creator = problem.authorId
          ? await auth.getUser(problem.authorId)
          : undefined;
        return {
          sourceType: 'CREATOR' as const,
          source:
            creator?.displayName ?? (problem.authorId ? 'Unknown user' : null),
        };
      },
    });
    const judgeDataRepository = new InMemoryJudgeDataRepository();
    const judgeDataStorage = new MemoryByteStorage();
    const judgeData = new ProblemJudgeDataService(
      judgeDataRepository,
      judgeDataStorage,
      async (id) => Boolean(await problemRepository.get(id)),
      async (action, context, problemId) => {
        const actor = context as
          { strength?: string; userId?: string } | undefined;
        if (!actor?.userId) return false;
        const actorId = actor.userId;
        const problem = await problemRepository.get(problemId);
        if (!problem) return false;
        if (problem.authorId === actorId) return true;
        if (actor.strength !== 'password') return false;
        const required =
          action === 'view'
            ? [`problem.judge_data.${action}`]
            : [`problem.judge_data.${action}`, 'problem.edit'];
        return Boolean(
          options.judgeAdminPermissions?.get(actorId) &&
          required.every((permission) =>
            options.judgeAdminPermissions?.get(actorId)?.has(permission),
          ),
        );
      },
      async (problemId) => {
        const problem = await problemRepository.get(problemId);
        if (!problem?.currentRevisionId)
          throw new Error('Problem revision identity unavailable');
        const revision = (await problemRepository.revisions(problemId)).find(
          (item) => item.revisionId === problem.currentRevisionId,
        );
        const testdataVersionId =
          revision?.testdataVersion ??
          problem.testdataVersion ??
          `judge-data-${problem.currentRevisionId}`;
        return {
          problemRevisionId: problem.currentRevisionId,
          testdataVersionId,
          testcaseSetId: `judge-data-${problem.currentRevisionId}`,
          executionProfileId: 'cpp20-gcc-13-v1' as const,
        };
      },
      async (action, user) => {
        await guardGuestAuthoring(
          guestAuthoringLimiter,
          user as { strength?: string; userId?: string },
          action,
        );
      },
    );
    await registerProblemJudgeDataRoutes(app, {
      service: judgeData,
      getAuth: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      resolveProblemId: async (key) => (await problemRepository.get(key))?.id,
    });
    const submissionJudgeData = new ProductJudgeDataSubmissionBridge(
      judgeDataRepository,
      judgeDataStorage,
    );
    const submissionPolicy = createSubmissionAuthorizationPolicy();
    await registerSubmissionModule(app, {
      repository: submissionRepository,
      authorizationPolicy: {
        canSubmit: async (context, reference) => {
          const revision = (
            await problemRepository.revisions(reference.problemId)
          ).find((item) => item.revisionId === reference.revisionId);
          if (!revision) return false;
          return submissionPolicy.canSubmit(
            { id: context.userId, status: 'active' },
            {
              id: revision.revisionId,
              problemId: reference.problemId,
              authorId: revision.authorId,
              status: revision.status,
              visibility: revision.visibility,
            },
          );
        },
        canViewSubmission: async (context, submission) =>
          (await submissionPolicy.canViewSubmission(
            { id: context.userId, status: 'active' },
            {
              id: submission.id,
              ownerUserId: submission.ownerUserId,
              problemId: submission.problemId,
              problemRevisionId: '',
              status: 'PENDING',
            },
          )) ||
          (context.strength === 'password' &&
            hasPermissions(context.userId, ['submission:view:any'])),
        listOwnSubmissions: (context) =>
          submissionPolicy.canListOwnSubmissions({
            id: context.userId,
            status: 'active',
          }),
        canListGlobalSubmissions: () => true,
      },
      problemResolver: {
        getRevision: async (problemId, revisionId) => {
          const revisions = await problemRepository.revisions(problemId);
          const revision = revisions.find(
            (item) => item.revisionId === revisionId,
          );
          if (!revision) return undefined;
          return {
            problemId,
            revisionId: revision.revisionId,
            testdataVersionRef: revision.testdataVersion,
          };
        },
      },
      judgeDataResolver: submissionJudgeData,
      guardCreate: async (context) =>
        guardGuestAuthoring(guestAuthoringLimiter, context, 'submission'),
      getAuthContext: async (request) =>
        (await auth.getAuthContext(request)) ?? undefined,
      onCreated: async (submission) => {
        const testcaseSet = await submissionJudgeData.manifest(submission);
        const { job } = await judgeRepository.enqueue(
          judgeInputForSubmission(
            submission,
            realSubmissionExecution,
            testcaseSet,
          ),
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
        const testcaseSet = await submissionJudgeData.manifest(submission);
        const { job } = await judgeRepository.enqueue({
          ...judgeInputForSubmission(
            submission,
            realSubmissionExecution,
            testcaseSet,
          ),
          evaluationGeneration,
          idempotencyKey: `submission:${submission.id}:evaluation:${evaluationGeneration}`,
        });
        await submissionRepository.startRejudge?.(submission.id, job.id);
      },
      evaluationHistory: async (submissionId) =>
        (await submissionRepository.listEvaluationHistory?.(submissionId)) ??
        [],
      projectGlobalListItem: async (submission) => {
        const [problem, submitter] = await Promise.all([
          problemRepository.get(submission.problemId),
          auth.getUser(submission.ownerUserId),
        ]);
        return {
          problem: problem
            ? {
                id: problem.id,
                slug: problem.slug,
                title: problem.title,
                publicId: problem.publicId,
              }
            : {
                id: submission.problemId,
                slug: submission.problemId,
                title: 'Unavailable',
              },
          submitter: {
            id: submission.ownerUserId,
            displayName: submitter?.displayName ?? 'Unknown user',
          },
        };
      },
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
  testcaseSet?: TestcaseSetManifest,
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
  if (!testcaseSet) throw new Error('JUDGE_DATA_BINDING_MISSING');
  return {
    ...base,
    executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
    languageProfileId: 'cpp20-gcc-13-v1' as const,
    sourceSnapshotRef: `submission:${submission.id}`,
    sourceBytes: submission.source,
    sourceSha256: createHash('sha256')
      .update(submission.source, 'utf8')
      .digest('hex'),
    testcaseSet,
    executionSetPolicy: 'RUN_ALL' as const,
  };
}
