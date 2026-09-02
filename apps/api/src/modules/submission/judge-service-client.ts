import type {
  JudgeJobCreateInput,
  TestcaseSetManifest,
} from '@ojplatform/judge-runtime';
import { createHash } from 'node:crypto';
import type { Submission } from './model.js';
import type { SubmissionEvaluationDetail } from './model.js';
import type { PublishEvaluationInput } from './repository.js';

const verdicts = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE']);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const integer = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

/** Accept only the terminal DTO fields explicitly allowed across this boundary. */
function safeDetail(value: unknown): SubmissionEvaluationDetail | undefined {
  const detail = record(value);
  const cases = detail?.testcases;
  const testcaseCount = integer(detail?.testcaseCount);
  const completedTestcaseCount = integer(detail?.completedTestcaseCount);
  if (
    !detail ||
    !Array.isArray(cases) ||
    cases.length > 64 ||
    testcaseCount !== cases.length ||
    completedTestcaseCount !== cases.length
  )
    return undefined;
  const testcases = cases.map((item, index) => {
    const testcase = record(item);
    const verdict = testcase?.verdict;
    const ordinal = integer(testcase?.ordinal);
    if (
      !testcase ||
      ordinal !== index + 1 ||
      typeof verdict !== 'string' ||
      !verdicts.has(verdict)
    )
      return undefined;
    const reasonCode = testcase.runtimeReasonCode;
    const reason = testcase.runtimeReason;
    if (
      (reasonCode !== undefined &&
        (typeof reasonCode !== 'string' ||
          !/^[A-Z_]{1,64}$/.test(reasonCode))) ||
      (reason !== undefined &&
        (typeof reason !== 'string' || reason.length > 256))
    )
      return undefined;
    return {
      ordinal,
      verdict:
        verdict as SubmissionEvaluationDetail['testcases'][number]['verdict'],
      ...(integer(testcase.timeMs) !== undefined
        ? { timeMs: integer(testcase.timeMs)! }
        : {}),
      ...(integer(testcase.memoryBytes) !== undefined
        ? { memoryBytes: integer(testcase.memoryBytes)! }
        : {}),
      ...(integer(testcase.exitCode) !== undefined
        ? { exitCode: integer(testcase.exitCode)! }
        : {}),
      ...(reasonCode ? { runtimeReasonCode: reasonCode } : {}),
      ...(reason ? { runtimeReason: reason } : {}),
    };
  });
  if (testcases.some((item) => !item)) return undefined;
  const compile = record(detail.compile);
  if (compile && compile.status !== 'FAILED') return undefined;
  const diagnostics = compile?.diagnostics;
  if (
    diagnostics !== undefined &&
    (typeof diagnostics !== 'string' ||
      Buffer.byteLength(diagnostics, 'utf8') > 8192)
  )
    return undefined;
  return {
    testcaseCount,
    completedTestcaseCount,
    ...(integer(detail.totalTimeMs) !== undefined
      ? { totalTimeMs: integer(detail.totalTimeMs)! }
      : {}),
    ...(integer(detail.peakMemoryBytes) !== undefined
      ? { peakMemoryBytes: integer(detail.peakMemoryBytes)! }
      : {}),
    ...(compile
      ? {
          compile: {
            status: 'FAILED',
            ...(integer(compile.durationMs) !== undefined
              ? { durationMs: integer(compile.durationMs)! }
              : {}),
            ...(diagnostics ? { diagnostics } : {}),
            truncated: Boolean(compile.truncated),
          },
        }
      : {}),
    testcases: testcases as SubmissionEvaluationDetail['testcases'],
  };
}

export type JudgeServiceJob = {
  judgeJobId: string;
  externalSubmissionId: string;
  evaluationGeneration: number;
  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED_WITH_VERDICT'
    | 'CANCELLED'
    | 'INFRA_FAILED'
    | 'NO_VERDICT';
  attemptGeneration: number;
  verdict?: 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
  testcaseSetId?: string;
  manifestHash?: string;
  resultDigest?: string;
  completedAt?: string;
  detail?: SubmissionEvaluationDetail;
};

export class JudgeServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly send: typeof fetch = fetch,
  ) {}

  async submit(input: Record<string, unknown>): Promise<JudgeServiceJob> {
    return this.request('/v1/jobs', { method: 'POST', body: input });
  }

  async get(jobId: string): Promise<JudgeServiceJob> {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  async rejudge(jobId: string, clientRequestId: string) {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}/rejudge`, {
      method: 'POST',
      body: { clientRequestId },
    });
  }

  private async request(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ) {
    const response = await this.send(new URL(path, this.baseUrl), {
      method: init.method ?? 'GET',
      headers: {
        'x-judge-service-token': this.token,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!response.ok) throw new Error(`JUDGE_SERVICE_${response.status}`);
    return (await response.json()) as JudgeServiceJob;
  }
}

export function judgeServiceInput(
  submission: Submission,
  clientRequestId: string,
  realExecution: boolean,
  testcaseSet?: TestcaseSetManifest,
) {
  const base: Omit<JudgeJobCreateInput, 'submissionId' | 'ownerUserId'> = {
    problemId: submission.problemId,
    problemRevisionId: submission.problemRevisionId,
    testdataVersionRef: submission.testdataVersionRef,
    languageId: submission.languageId,
    ...(testcaseSet
      ? { testcaseSet, executionSetPolicy: 'RUN_ALL' as const }
      : {}),
  };
  if (!realExecution || submission.languageId !== 'cpp20')
    return { ...base, clientRequestId, externalSubmissionId: submission.id };
  const hash = createHash('sha256')
    .update(submission.source, 'utf8')
    .digest('hex');
  return {
    ...base,
    clientRequestId,
    externalSubmissionId: submission.id,
    executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
    languageProfileId: 'cpp20-gcc-13-v1' as const,
    sourceSnapshotRef: `submission:${submission.id}`,
    sourceBytes: submission.source,
    sourceSha256: hash,
    controlledInputId: 'stdin-empty-v1' as const,
  };
}

export function productPublication(
  value: JudgeServiceJob,
): PublishEvaluationInput | undefined {
  if (
    ![
      'COMPLETED_WITH_VERDICT',
      'CANCELLED',
      'INFRA_FAILED',
      'NO_VERDICT',
    ].includes(value.status)
  )
    return undefined;
  const detail = safeDetail(value.detail);
  return {
    submissionId: value.externalSubmissionId,
    judgeJobId: value.judgeJobId,
    evaluationGeneration: value.evaluationGeneration,
    attemptGeneration: value.attemptGeneration,
    status: value.status as PublishEvaluationInput['status'],
    ...(value.verdict ? { verdict: value.verdict } : {}),
    ...(value.testcaseSetId ? { testcaseSetId: value.testcaseSetId } : {}),
    ...(value.manifestHash ? { manifestHash: value.manifestHash } : {}),
    ...(value.resultDigest ? { verdictRecordDigest: value.resultDigest } : {}),
    evaluationRecordDigest:
      value.resultDigest ?? `${value.judgeJobId}:${value.status}`,
    ...(value.completedAt ? { completedAt: value.completedAt } : {}),
    ...(detail ? { detail } : {}),
  };
}
