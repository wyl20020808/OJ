import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthContext } from '../submission/model.js';
import type { JudgeJob } from '@ojplatform/judge-runtime';
import type { CodeRunResult } from './model.js';
import { CodeRunValidationError, validateCodeRun } from './validation.js';

type JudgeResult = {
  judgeJobId: string;
  status: string;
  codeRun?: Omit<CodeRunResult, 'runId'>;
};
type Context = {
  getAuthContext: (request: FastifyRequest) => Promise<AuthContext | undefined>;
  submit: (input: Record<string, unknown>) => Promise<JudgeResult>;
  get: (id: string) => Promise<JudgeResult | undefined>;
};
const error = (
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) =>
  reply.status(status).send({
    code,
    message,
    requestId: request.id,
    ...(details === undefined ? {} : { details }),
  });
export const translateCodeRunStatus = (
  value: string,
): CodeRunResult['status'] => {
  if (value === 'QUEUED') return 'QUEUED';
  if (value === 'RUNNING') return 'RUNNING';
  if (value === 'CANCELLED') return 'CANCELLED';
  if (value === 'INFRA_FAILED' || value === 'NO_VERDICT') return 'INFRA_ERROR';
  if (
    value === 'COMPILE_ERROR' ||
    value === 'RUNTIME_ERROR' ||
    value === 'TIME_LIMIT' ||
    value === 'MEMORY_LIMIT' ||
    value === 'SUCCEEDED'
  )
    return value;
  return 'INFRA_ERROR';
};
const csrf = (request: FastifyRequest) => {
  const token = request.headers['x-csrf-token'];
  return (
    typeof token === 'string' &&
    Boolean(
      request.headers.cookie
        ?.split(';')
        .some((cookie) => cookie.trim() === `oj_csrf=${token}`),
    )
  );
};
export const judgeInputForCodeRun = (
  source: string,
  stdin: string,
  runId: string,
) => ({
  clientRequestId: `code-run:${runId}`,
  externalSubmissionId: `code-run:${runId}`,
  problemId: '__adhoc_code_run__',
  problemRevisionId: 'adhoc-v1',
  testdataVersionRef: 'adhoc-v1',
  languageId: 'cpp20',
  executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
  languageProfileId: 'cpp20-gcc-13-v1' as const,
  executionProfileId: 'cpp20-gcc-13-v1' as const,
  sourceSnapshotRef: `code-run:${runId}`,
  sourceBytes: source,
  sourceSha256: createHash('sha256').update(source, 'utf8').digest('hex'),
  controlledInputId: 'stdin-echo-v1' as const,
  testcaseId: `stdin:${runId}`,
  testcaseInput: stdin,
  testcaseInputSha256: createHash('sha256').update(stdin, 'utf8').digest('hex'),
});
export async function registerCodeRunRoutes(
  app: FastifyInstance,
  context: Context,
) {
  const auth = (request: FastifyRequest) => context.getAuthContext(request);
  app.post('/api/code-runs', async (request, reply) => {
    if (!(await auth(request)))
      return error(
        reply,
        request,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    if (!csrf(request))
      return error(
        reply,
        request,
        403,
        'CSRF_INVALID',
        'CSRF validation failed',
      );
    try {
      const input = validateCodeRun(request.body);
      const requestId = randomUUID();
      const submitted = await context.submit(
        judgeInputForCodeRun(input.source, input.stdin, requestId),
      );
      return reply
        .status(202)
        .send({ runId: submitted.judgeJobId, status: 'QUEUED' });
    } catch (e) {
      if (e instanceof CodeRunValidationError)
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          e.message,
          e.details,
        );
      throw e;
    }
  });
  app.get('/api/code-runs/:runId', async (request, reply) => {
    if (!(await auth(request)))
      return error(
        reply,
        request,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    const runId = (request.params as { runId: string }).runId;
    if (!/^[0-9a-f-]{36}$/i.test(runId))
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid runId');
    const result = await context.get(runId);
    if (!result)
      return error(reply, request, 404, 'NOT_FOUND', 'Code run not found');
    const output = result.codeRun;
    return reply.send({
      runId,
      status: output?.status ?? translateCodeRunStatus(result.status),
      ...(output
        ? {
            stdout: output.stdout,
            stderr: output.stderr,
            compilerDiagnostics: output.compilerDiagnostics,
            exitCode: output.exitCode,
            timeMs: output.timeMs,
            memoryBytes: output.memoryBytes,
          }
        : {}),
    });
  });
}

export function codeRunResultFromJob(job: JudgeJob): JudgeResult {
  const raw = job.rawExecutionResult;
  const output = (value: unknown) =>
    typeof value === 'string'
      ? Buffer.from(value, 'utf8')
          .subarray(0, 64 * 1024)
          .toString('utf8')
      : '';
  return {
    judgeJobId: job.id,
    status:
      job.status === 'LEASED' || job.status === 'LEASED_FAKE'
        ? 'RUNNING'
        : job.status === 'COMPLETED'
          ? 'SUCCEEDED'
          : job.status === 'FAILED_TERMINAL'
            ? 'INFRA_FAILED'
            : job.status === 'CANCELLED'
              ? 'CANCELLED'
              : 'QUEUED',
    ...(raw
      ? {
          codeRun: {
            status:
              raw.pipeline_outcome === 'PIPELINE_COMPILE_FAILED'
                ? 'COMPILE_ERROR'
                : raw.pipeline_outcome === 'PIPELINE_LIMIT_HIT'
                  ? 'TIME_LIMIT'
                  : raw.pipeline_outcome === 'PIPELINE_CANCELLED'
                    ? 'CANCELLED'
                    : raw.pipeline_outcome === 'PIPELINE_INFRA_FAILURE'
                      ? 'INFRA_ERROR'
                      : 'SUCCEEDED',
            stdout: output(raw.runtime?.stdout),
            stderr: output(raw.runtime?.stderr),
            compilerDiagnostics:
              raw.pipeline_outcome === 'PIPELINE_COMPILE_FAILED'
                ? output(raw.compile?.stderr) || null
                : null,
            exitCode:
              (raw.runtime?.exit_code as number | null | undefined) ?? null,
            timeMs:
              (raw.runtime?.wall_time_ms as number | null | undefined) ?? null,
            memoryBytes:
              (raw.runtime?.memory_bytes as number | null | undefined) ?? null,
          },
        }
      : {}),
  };
}
