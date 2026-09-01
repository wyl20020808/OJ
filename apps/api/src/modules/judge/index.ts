export * from './model.js';
export * from './repository.js';
export * from './service.js';
export * from './safety.js';
export * from './testcase-set.js';

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
    ...(job.testcaseId ? { testcaseId: job.testcaseId } : {}),
    ...(job.testcaseInputSha256
      ? { testcaseInputSha256: job.testcaseInputSha256 }
      : {}),
    ...(job.executionProfileId
      ? { executionProfileId: job.executionProfileId }
      : {}),
    ...(job.testcaseSet
      ? {
          testcaseSet: {
            testcaseSetId: job.testcaseSet.testcaseSetId,
            manifestHash: job.testcaseSet.manifestHash,
            testcaseCount: job.testcaseSet.entries.length,
            entries: job.testcaseSet.entries.map((entry) => ({
              index: entry.index,
              testcaseId: entry.testcaseId,
              inputSha256: entry.inputSha256,
            })),
            policy: job.executionSetPolicy,
          },
        }
      : {}),
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
    stdoutBytes: value.stdout_bytes,
    stderrBytes: value.stderr_bytes,
    stdoutSha256: value.stdout_sha256,
    stderrSha256: value.stderr_sha256,
    setupTimeMs: value.setup_time_ms,
    cpuTimeUsec: value.cpu_time_usec,
    cpuTimeSource: value.cpu_time_source,
    memoryPeakBytes: value.memory_peak_bytes,
    memoryPeakSource: value.memory_peak_source,
    stdoutTruncated: value.stdout_truncated,
    stderrTruncated: value.stderr_truncated,
    wallTimeMs: value.wall_time_ms,
    ...(value.diagnostic_code ? { diagnosticCode: value.diagnostic_code } : {}),
    clean: value.clean,
  };
}

function publicRawExecutionResult(result: RawExecutionResult) {
  const record = result.single_testcase_record;
  const aggregate = result.aggregate_execution_set_record;
  const aggregateValue = aggregate as unknown as
    Record<string, unknown> | undefined;
  const aggregateField = (snake: string, camel: string) =>
    aggregateValue
      ? (aggregateValue[snake] ?? aggregateValue[camel])
      : undefined;
  const aggregateMembers = aggregateField('testcases', 'testcases') as
    Array<Record<string, unknown>> | undefined;
  const verdict = result.verdict_record;
  const verdictCases =
    verdict && Array.isArray(verdict.cases)
      ? verdict.cases.filter(
          (value): value is Record<string, unknown> =>
            !!value && typeof value === 'object',
        )
      : undefined;
  return {
    protocolVersion: result.protocol_version,
    executionRequestId:
      result.execution_set_request_id ?? result.execution_request_id,
    ...((result.execution_set_attempt_id ?? result.execution_attempt_id)
      ? {
          executionAttemptId:
            result.execution_set_attempt_id ?? result.execution_attempt_id,
        }
      : {}),
    ...(result.result_generation !== undefined
      ? { resultGeneration: result.result_generation }
      : {}),
    pipelineOutcome: result.pipeline_outcome,
    languageProfileId: result.language_profile_id,
    snapshotSha256: result.source_sha256,
    ...(result.problem_id ? { problemId: result.problem_id } : {}),
    ...(result.problem_revision_id
      ? { problemRevisionId: result.problem_revision_id }
      : {}),
    ...(result.testdata_version_id
      ? { testdataVersionId: result.testdata_version_id }
      : {}),
    ...(result.testcase_id ? { testcaseId: result.testcase_id } : {}),
    ...(result.testcase_input_sha256
      ? { testcaseInputSha256: result.testcase_input_sha256 }
      : {}),
    ...(result.execution_profile_id
      ? { executionProfileId: result.execution_profile_id }
      : {}),
    ...(record &&
    typeof record.record_version === 'string' &&
    typeof record.record_id === 'string' &&
    typeof record.digest === 'string'
      ? {
          executionRecord: {
            recordVersion: record.record_version,
            recordId: record.record_id,
            digest: record.digest,
          },
        }
      : {}),
    ...(aggregate
      ? {
          executionSetRecord: {
            recordVersion: aggregateField('record_version', 'recordVersion'),
            recordId: aggregateField('record_id', 'recordId'),
            digest: aggregateField('digest', 'digest'),
            testcaseSetId: aggregateField('testcase_set_id', 'testcaseSetId'),
            manifestHash: aggregateField('manifest_hash', 'manifestHash'),
            totalTestcaseCount: aggregateField(
              'total_testcase_count',
              'totalTestcaseCount',
            ),
            startedTestcaseCount: aggregateField(
              'started_testcase_count',
              'startedTestcaseCount',
            ),
            completedTestcaseCount: aggregateField(
              'completed_testcase_count',
              'completedTestcaseCount',
            ),
            stopReason: aggregateField('stop_reason', 'stopReason'),
            setCancelled: aggregateField('set_cancelled', 'setCancelled'),
            setInfrastructureFailure: aggregateField(
              'set_infrastructure_failure',
              'setInfrastructureFailure',
            ),
            testcases: (aggregateMembers ?? []).map((testcase) => {
              const memberRecord =
                testcase.record &&
                typeof testcase.record === 'object' &&
                !Array.isArray(testcase.record)
                  ? (testcase.record as Record<string, unknown>)
                  : undefined;
              return {
                index: testcase.index,
                testcaseId: testcase.testcase_id ?? testcase.testcaseId,
                inputSha256: testcase.input_sha256 ?? testcase.inputSha256,
                status: testcase.status,
                ...(memberRecord &&
                typeof (memberRecord.record_id ?? memberRecord.recordId) ===
                  'string' &&
                typeof memberRecord.digest === 'string'
                  ? {
                      record: {
                        recordId:
                          memberRecord.record_id ?? memberRecord.recordId,
                        digest: memberRecord.digest,
                      },
                    }
                  : {}),
              };
            }),
          },
        }
      : {}),
    ...(verdict && typeof verdict === 'object'
      ? {
          verdict: {
            engineVersion: verdict.record_version,
            digest: verdict.digest,
            compileVerdict: verdict.compile_verdict,
            overallUserVerdict: verdict.overall_user_verdict,
            evaluationState: verdict.evaluation_state,
            cases: verdictCases?.map((value) => ({
              testcaseIndex: value.testcase_index,
              testcaseId: value.testcase_id,
              verdict: value.verdict,
              evaluationState: value.evaluation_state,
              reasonCode: value.reason_code,
              digest: value.digest,
            })),
          },
        }
      : {}),
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
