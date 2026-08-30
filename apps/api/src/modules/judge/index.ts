export * from './model.js';
export * from './repository.js';
export * from './service.js';
export * from './safety.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AuthContext } from '../submission/model.js';
import type {
  JudgeAuthorizationPolicy,
  JudgeAuthorizationUser,
  JudgeJobReference,
} from '../authz/judge.js';
import type {
  JudgeJob,
  JudgeJobRepository,
  RawExecutionResult,
} from './model.js';

export type JudgeModuleContext = {
  repository: JudgeJobRepository;
  authorizationPolicy: JudgeAuthorizationPolicy;
  getAuthContext?: (
    request: FastifyRequest,
  ) => AuthContext | undefined | Promise<AuthContext | undefined>;
  resolveSubmissionOwner?: (submissionId: string) => Promise<string | null>;
  qualificationMode?: boolean;
  qualificationControlKey?: string | undefined;
};

export function publicJudgeJob(job: JudgeJob) {
  return {
    id: job.id,
    submissionId: job.submissionId,
    problemId: job.problemId,
    problemRevisionId: job.problemRevisionId,
    testdataVersionRef: job.testdataVersionRef,
    languageId: job.languageId,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    ...(job.failureReason ? { failureReason: job.failureReason } : {}),
    ...(job.syntheticFixtureId ? { synthetic: true } : {}),
    ...(job.rawExecutionResult
      ? { rawExecution: publicRawExecutionResult(job.rawExecutionResult) }
      : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function publicStage(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  return {
    outcome: value.outcome,
    exitCode: value.exit_code,
    ...(value.termination_signal
      ? { terminationSignal: value.termination_signal }
      : {}),
    stdout: value.stdout,
    stderr: value.stderr,
    stdoutTruncated: value.stdout_truncated,
    stderrTruncated: value.stderr_truncated,
    wallTimeMs: value.wall_time_ms,
    ...(value.diagnostic_code ? { diagnosticCode: value.diagnostic_code } : {}),
    clean: value.clean,
  };
}

function publicRawExecutionResult(result: RawExecutionResult) {
  return {
    protocolVersion: result.protocol_version,
    executionRequestId: result.execution_request_id,
    ...(result.execution_attempt_id
      ? { executionAttemptId: result.execution_attempt_id }
      : {}),
    ...(result.result_generation !== undefined
      ? { resultGeneration: result.result_generation }
      : {}),
    pipelineOutcome: result.pipeline_outcome,
    languageProfileId: result.language_profile_id,
    snapshotSha256: result.source_sha256,
    compile: publicStage(result.compile),
    ...(result.artifact
      ? {
          artifact: {
            sha256: result.artifact.sha256,
            sizeBytes: result.artifact.size_bytes,
            languageProfileId: result.artifact.language_profile_id,
            compilerVersion: result.artifact.compiler_version,
            compilerRootfsIdentity: result.artifact.compiler_rootfs_identity,
            commandTemplateSha256: result.artifact.command_template_sha256,
          },
        }
      : {}),
    ...(result.runtime ? { runtime: publicStage(result.runtime) } : {}),
    startedAt: result.started_at,
    completedAt: result.completed_at,
    clean: result.clean,
  };
}

function jobReference(job: JudgeJob) {
  const state: JudgeJobReference['state'] =
    job.status === 'RETRYABLE_FAILURE'
      ? 'FAILED_RETRYABLE'
      : job.status === 'TERMINAL_FAILURE'
        ? 'FAILED_TERMINAL'
        : job.status;
  return {
    id: job.id,
    submissionId: job.submissionId,
    ownerUserId: job.ownerUserId,
    state,
    attemptNumber: job.attempt,
  };
}

function matchesControlKey(
  supplied: string | string[] | undefined,
  expected: string,
) {
  if (typeof supplied !== 'string') return false;
  const actual = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}

export async function registerJudgeModule(
  app: FastifyInstance,
  context: JudgeModuleContext,
) {
  const authUser = async (
    request: FastifyRequest,
  ): Promise<JudgeAuthorizationUser | undefined> => {
    const value = context.getAuthContext
      ? await context.getAuthContext(request)
      : undefined;
    return value
      ? {
          userId: value.userId,
          status: 'active',
          ...(value.sessionId ? { sessionId: value.sessionId } : {}),
          strength: 'password',
        }
      : undefined;
  };
  app.get('/api/judge/jobs/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const job = await context.repository.getById(id);
    if (!job)
      return reply.status(404).send({
        code: 'NOT_FOUND',
        message: 'Judge job not found',
        requestId: request.id,
      });
    const allowed = await context.authorizationPolicy.canViewJudgeJob(
      await authUser(request),
      jobReference(job),
      request.id,
    );
    if (!allowed)
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Judge job access forbidden',
        requestId: request.id,
      });
    return reply.send(publicJudgeJob(job));
  });
  if (context.qualificationMode && context.qualificationControlKey) {
    const authorizeFixture = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<JudgeJob | undefined> => {
      const id = (request.params as { id: string }).id;
      const job = await context.repository.getById(id);
      if (!job)
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: 'Judge job not found',
          requestId: request.id,
        });
      if (
        !matchesControlKey(
          request.headers['x-ojplatform-qualification-control'],
          context.qualificationControlKey!,
        )
      )
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: request.id,
        });
      const allowed = await context.authorizationPolicy.canViewJudgeJob(
        await authUser(request),
        jobReference(job),
        request.id,
      );
      if (!allowed)
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Judge job access forbidden',
          requestId: request.id,
        });
      return job;
    };
    app.post('/api/qualification/judge/:id/claim', async (request, reply) => {
      const authorized = await authorizeFixture(request, reply);
      if (!authorized) return;
      const result = await context.repository.claimById(
        authorized.id,
        `qualification-${request.id}`,
        30_000,
      );
      if (!result)
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'Job is not claimable',
          requestId: request.id,
        });
      return reply.send(publicJudgeJob(result.job));
    });
    app.post('/api/qualification/judge/:id/retry', async (request, reply) => {
      const job = await authorizeFixture(request, reply);
      if (!job) return;
      if (!job || job.status !== 'LEASED_FAKE' || !job.leaseToken)
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'Job is not leased',
          requestId: request.id,
        });
      return reply.send(
        publicJudgeJob(
          await context.repository.retry(
            job.id,
            job.leaseToken,
            'qualification_retry',
          ),
        ),
      );
    });
    app.post(
      '/api/qualification/judge/:id/complete',
      async (request, reply) => {
        const job = await authorizeFixture(request, reply);
        if (!job) return;
        if (!job || job.status !== 'LEASED_FAKE' || !job.leaseToken)
          return reply.status(409).send({
            code: 'CONFLICT',
            message: 'Job is not leased',
            requestId: request.id,
          });
        return reply.send(
          publicJudgeJob(
            await context.repository.complete(
              job.id,
              job.leaseToken,
              'control-pass-v1',
            ),
          ),
        );
      },
    );
  }
}
