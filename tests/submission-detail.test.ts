import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  projectJudgeServiceDetail,
  projectJudgeServiceResult,
} from '../apps/judge-service/src/projection.js';
import {
  InMemorySubmissionRepository,
  productPublication,
  registerSubmissionModule,
  type PublishEvaluationInput,
} from '../apps/api/src/modules/submission/index.js';

const input = {
  ownerUserId: 'owner',
  problemId: 'problem',
  problemRevisionId: 'revision',
  testdataVersionRef: 'testdata-v1',
  languageId: 'cpp20',
  source: 'int main(){}',
};

const safeDetail = () =>
  projectJudgeServiceDetail({
    id: 'job-1',
    submissionId: 'submission-1',
    idempotencyKey: 'request-1',
    ownerUserId: 'judge-service',
    problemId: 'problem',
    problemRevisionId: 'revision',
    testdataVersionRef: 'testdata-v1',
    languageId: 'cpp20',
    executionMode: 'REAL_SANDBOXED_EXECUTION',
    status: 'COMPLETED',
    attempt: 1,
    maxAttempts: 3,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:01.000Z',
    rawExecutionResult: {
      protocol_version: '2C.4',
      judge_job_id: 'job-1',
      submission_id: 'submission-1',
      attempt: 1,
      correlation_id: 'internal-lease-token',
      language_profile_id: 'cpp20-gcc-13-v1',
      source_sha256: 'a'.repeat(64),
      pipeline_outcome: 'PIPELINE_COMPLETED',
      compile: {},
      started_at: '2026-09-02T00:00:00.000Z',
      completed_at: '2026-09-02T00:00:01.000Z',
      clean: true,
      aggregate_execution_set_record: {
        testcases: [
          {
            status: 'RAW_COMPLETED',
            record: {
              wall: { available: true, value: 12, units: 'milliseconds' },
              memory: {
                peak: { available: true, value: 3_200_000, units: 'bytes' },
              },
              facts: { exit_code: 0 },
              stdout: 'hidden output',
              sandbox_path: '/srv/secret/rootfs',
            },
          },
          {
            status: 'RAW_COMPLETED',
            record: {
              wall: { available: true, value: 21, units: 'milliseconds' },
              memory: {
                peak: { available: true, value: 3_400_000, units: 'bytes' },
              },
              facts: { exit_code: 7 },
            },
          },
        ],
      } as never,
      verdict_record: {
        evaluation_state: 'COMPLETE',
        overall_user_verdict: 'RE',
        cases: [
          {
            evaluation_state: 'COMPLETE',
            testcase_index: 0,
            verdict: 'AC',
            reason_code: 'CHECKER_MATCH',
          },
          {
            evaluation_state: 'COMPLETE',
            testcase_index: 1,
            verdict: 'RE',
            reason_code: 'USER_RUNTIME_FAILURE',
          },
        ],
      },
    },
  });

const compileDetail = () =>
  projectJudgeServiceDetail({
    id: 'job-ce',
    submissionId: 'submission-1',
    idempotencyKey: 'request-ce',
    ownerUserId: 'judge-service',
    problemId: 'problem',
    problemRevisionId: 'revision',
    testdataVersionRef: 'testdata-v1',
    languageId: 'cpp20',
    executionMode: 'REAL_SANDBOXED_EXECUTION',
    status: 'COMPLETED',
    attempt: 1,
    maxAttempts: 3,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:01.000Z',
    rawExecutionResult: {
      protocol_version: '2C.4',
      judge_job_id: 'job-ce',
      submission_id: 'submission-1',
      attempt: 1,
      correlation_id: 'internal-token',
      language_profile_id: 'cpp20-gcc-13-v1',
      source_sha256: 'a'.repeat(64),
      pipeline_outcome: 'PIPELINE_COMPILE_FAILED',
      compile: {
        wall_time_ms: 18,
        stderr: '/srv/judge/private/main.cpp:1: error: token=secret-value',
        stderr_truncated: true,
      },
      started_at: '2026-09-02T00:00:00.000Z',
      completed_at: '2026-09-02T00:00:01.000Z',
      clean: true,
      aggregate_execution_set_record: { testcases: [] } as never,
      verdict_record: {
        evaluation_state: 'COMPLETE',
        overall_user_verdict: 'CE',
        cases: [],
        digest: 'b'.repeat(64),
      },
    },
  });

const limitDetail = (verdict: 'TLE' | 'MLE', reasonCode: string) =>
  projectJudgeServiceDetail({
    id: `job-${verdict.toLowerCase()}`,
    submissionId: 'submission-1',
    idempotencyKey: `request-${verdict.toLowerCase()}`,
    ownerUserId: 'judge-service',
    problemId: 'problem',
    problemRevisionId: 'revision',
    testdataVersionRef: 'testdata-v1',
    languageId: 'cpp20',
    executionMode: 'REAL_SANDBOXED_EXECUTION',
    status: 'COMPLETED',
    attempt: 1,
    maxAttempts: 3,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:01.000Z',
    rawExecutionResult: {
      protocol_version: '2C.4',
      judge_job_id: `job-${verdict.toLowerCase()}`,
      submission_id: 'submission-1',
      attempt: 1,
      correlation_id: 'internal-token',
      language_profile_id: 'cpp20-gcc-13-v1',
      source_sha256: 'a'.repeat(64),
      pipeline_outcome: 'PIPELINE_LIMIT_HIT',
      compile: {},
      started_at: '2026-09-02T00:00:00.000Z',
      completed_at: '2026-09-02T00:00:01.000Z',
      clean: true,
      aggregate_execution_set_record: {
        testcases: [
          {
            status: 'RAW_COMPLETED',
            record: {
              wall: { available: true, value: 2000, units: 'milliseconds' },
              memory: {
                peak: { available: true, value: 67_108_864, units: 'bytes' },
              },
              facts: { exit_code: 137 },
            },
          },
        ],
      } as never,
      verdict_record: {
        evaluation_state: 'COMPLETE',
        overall_user_verdict: verdict,
        cases: [
          {
            evaluation_state: 'COMPLETE',
            testcase_index: 0,
            verdict,
            reason_code: reasonCode,
          },
        ],
      },
    },
  });

const publication = (
  submissionId: string,
  overrides: Partial<PublishEvaluationInput> = {},
): PublishEvaluationInput => ({
  submissionId,
  judgeJobId: overrides.judgeJobId ?? 'job-1',
  evaluationGeneration: overrides.evaluationGeneration ?? 1,
  attemptGeneration: overrides.attemptGeneration ?? 1,
  status: overrides.status ?? 'COMPLETED_WITH_VERDICT',
  verdict: overrides.verdict ?? 'RE',
  ...(overrides.verdictRecordDigest
    ? { verdictRecordDigest: overrides.verdictRecordDigest }
    : {}),
  evaluationRecordDigest: overrides.evaluationRecordDigest ?? 'record-1',
  detail: overrides.detail ?? safeDetail()!,
  completedAt: '2026-09-02T00:00:01.000Z',
});

describe('submission detail projection', () => {
  it('reduces Judge facts to safe ordered testcase details and truthful aggregates', () => {
    const detail = safeDetail();
    expect(detail).toEqual({
      testcaseCount: 2,
      completedTestcaseCount: 2,
      totalTimeMs: 33,
      peakMemoryBytes: 3_400_000,
      testcases: [
        { ordinal: 1, verdict: 'AC', timeMs: 12, memoryBytes: 3_200_000 },
        {
          ordinal: 2,
          verdict: 'RE',
          timeMs: 21,
          memoryBytes: 3_400_000,
          exitCode: 7,
          runtimeReasonCode: 'USER_RUNTIME_FAILURE',
          runtimeReason: 'Process exited with code 7',
        },
      ],
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /stdout|rootfs|sandbox|lease|token|source_sha|expected/i,
    );
  });

  it('keeps CE diagnostics bounded and strips host paths and secret values', () => {
    const detail = compileDetail();
    expect(detail).toMatchObject({
      testcaseCount: 0,
      compile: {
        status: 'FAILED',
        durationMs: 18,
        truncated: true,
        diagnostics: '<path>:1: error: token=<redacted>',
      },
    });
    expect(JSON.stringify(detail)).not.toMatch(/srv|secret-value|private/i);
  });

  it('projects authoritative TLE and MLE reason facts without exposing runtime internals', () => {
    expect(limitDetail('TLE', 'TIME_LIMIT_ENFORCED')).toMatchObject({
      totalTimeMs: 2000,
      peakMemoryBytes: 67_108_864,
      testcases: [
        {
          ordinal: 1,
          verdict: 'TLE',
          timeMs: 2000,
          memoryBytes: 67_108_864,
          runtimeReasonCode: 'TIME_LIMIT_ENFORCED',
          runtimeReason: 'Time limit exceeded',
        },
      ],
    });
    expect(limitDetail('MLE', 'MEMORY_LIMIT_ENFORCED')).toMatchObject({
      testcases: [
        {
          ordinal: 1,
          verdict: 'MLE',
          runtimeReasonCode: 'MEMORY_LIMIT_ENFORCED',
          runtimeReason: 'Memory limit exceeded',
        },
      ],
    });
  });

  it('attaches a safe detail only to a terminal Judge Service result', () => {
    const job = {
      id: 'job-ce',
      submissionId: 'submission-1',
      idempotencyKey: 'request-ce',
      ownerUserId: 'judge-service',
      problemId: 'problem',
      problemRevisionId: 'revision',
      testdataVersionRef: 'testdata-v1',
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
      status: 'COMPLETED' as const,
      attempt: 1,
      maxAttempts: 3,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:01.000Z',
      rawExecutionResult: {
        protocol_version: '2C.4' as const,
        judge_job_id: 'job-ce',
        submission_id: 'submission-1',
        attempt: 1,
        correlation_id: 'internal-token',
        language_profile_id: 'cpp20-gcc-13-v1' as const,
        source_sha256: 'a'.repeat(64),
        pipeline_outcome: 'PIPELINE_COMPILE_FAILED' as const,
        compile: {},
        started_at: '2026-09-02T00:00:00.000Z',
        completed_at: '2026-09-02T00:00:01.000Z',
        clean: true,
        aggregate_execution_set_record: { testcases: [] } as never,
        verdict_record: {
          evaluation_state: 'COMPLETE',
          overall_user_verdict: 'CE',
          cases: [],
          digest: 'b'.repeat(64),
        },
      },
    };
    expect(projectJudgeServiceResult(job).detail).toMatchObject({
      testcaseCount: 0,
      compile: { status: 'FAILED', truncated: false },
    });
    expect(
      projectJudgeServiceResult({ ...job, status: 'QUEUED' }),
    ).not.toHaveProperty('detail');
  });

  it('whitelists the Judge Service detail before Product persistence', () => {
    const publication = productPublication({
      judgeJobId: 'job-1',
      externalSubmissionId: 'submission-1',
      evaluationGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      attemptGeneration: 1,
      verdict: 'AC',
      detail: {
        testcaseCount: 1,
        completedTestcaseCount: 1,
        totalTimeMs: 12,
        testcases: [
          {
            ordinal: 1,
            verdict: 'AC',
            timeMs: 12,
            hidden_input: 'must not persist',
          } as never,
        ],
        rootfs: '/srv/private/rootfs',
      } as never,
    });
    expect(publication?.detail).toEqual({
      testcaseCount: 1,
      completedTestcaseCount: 1,
      totalTimeMs: 12,
      testcases: [{ ordinal: 1, verdict: 'AC', timeMs: 12 }],
    });
    expect(JSON.stringify(publication?.detail)).not.toMatch(
      /hidden_input|rootfs|private/i,
    );
  });

  it('binds one terminal detail to its generation and fails closed on conflicting or stale publication', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create(input);
    await repository.beginEvaluation!(submission.id, 'job-1');
    const first = publication(submission.id);
    await expect(repository.publishEvaluation!(first)).resolves.toMatchObject({
      detail: safeDetail(),
    });
    await expect(repository.publishEvaluation!(first)).resolves.toMatchObject({
      verdict: 'RE',
    });
    await expect(
      repository.publishEvaluation!({
        ...first,
        detail: {
          ...first.detail!,
          testcases: [...first.detail!.testcases],
        },
      }),
    ).resolves.toMatchObject({ verdict: 'RE' });
    await expect(
      repository.publishEvaluation!({
        ...first,
        detail: { ...first.detail!, totalTimeMs: 99 },
      }),
    ).rejects.toThrow('CONFLICTING_PUBLICATION');
    await repository.startRejudge!(submission.id, 'job-2');
    await expect(repository.publishEvaluation!(first)).rejects.toThrow(
      'STALE_EVALUATION',
    );
    expect(await repository.getEvaluation!(submission.id)).toMatchObject({
      evaluationGeneration: 2,
      current: true,
    });
  });

  it('backfills a pre-detail terminal generation exactly once', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create(input);
    await repository.beginEvaluation!(submission.id, 'job-1');
    const terminal = publication(submission.id, {
      evaluationRecordDigest: 'projection-envelope',
      verdictRecordDigest: 'sealed-verdict',
    });
    const { detail: terminalDetail, ...beforeBackfill } = terminal;
    void terminalDetail;
    await repository.publishEvaluation!({
      ...beforeBackfill,
      evaluationRecordDigest: 'sealed-verdict',
    });
    await expect(
      repository.publishEvaluation!({
        ...terminal,
        evaluationRecordDigest: 'conflicting-record',
        verdictRecordDigest: 'conflicting-verdict',
      }),
    ).rejects.toThrow('CONFLICTING_PUBLICATION');
    expect(await repository.getEvaluation!(submission.id)).not.toHaveProperty(
      'detail',
    );
    await repository.startRejudge!(submission.id, 'job-2');
    await expect(
      repository.publishEvaluation!(terminal),
    ).resolves.toMatchObject({
      evaluationGeneration: 1,
      current: false,
      detail: safeDetail(),
    });
    await expect(
      repository.publishEvaluation!({
        ...terminal,
        detail: { ...terminal.detail!, totalTimeMs: 99 },
      }),
    ).rejects.toThrow('STALE_EVALUATION');
    await expect(repository.publishEvaluation!(terminal)).rejects.toThrow(
      'STALE_EVALUATION',
    );
    expect(await repository.getEvaluation!(submission.id)).toMatchObject({
      evaluationGeneration: 2,
      current: true,
    });
  });

  it('serves the selected generation detail only to authorized viewers', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create(input);
    await repository.beginEvaluation!(submission.id, 'job-1');
    await repository.publishEvaluation!(publication(submission.id));
    const app = Fastify();
    await registerSubmissionModule(app, {
      repository,
      authorizationPolicy: {
        canSubmit: () => true,
        canViewSubmission: (user, value) => user.userId === value.ownerUserId,
        listOwnSubmissions: () => true,
      },
      problemResolver: { getRevision: async () => undefined },
      getAuthContext: async (request) =>
        typeof request.headers['x-user-id'] === 'string'
          ? { userId: request.headers['x-user-id'], strength: 'password' }
          : undefined,
      evaluationHistory: (submissionId) =>
        repository.listEvaluationHistory!(submissionId),
    });
    const history = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().items[0]).not.toHaveProperty('detail');
    const owner = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations/1`,
      headers: { 'x-user-id': 'owner' },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().evaluation.detail).toMatchObject({ totalTimeMs: 33 });
    expect(owner.json().evaluation.detail.testcases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ordinal: 1, verdict: 'AC' }),
      ]),
    );
    expect(JSON.stringify(owner.json())).not.toMatch(
      /rootfs|sandbox|lease|token|stdout|source_sha|expected/i,
    );
    const other = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submission.id}/evaluations/1`,
      headers: { 'x-user-id': 'other' },
    });
    expect(other.statusCode).toBe(403);
    await app.close();
  });

  it('keeps nonterminal evaluations detail-free', async () => {
    const repository = new InMemorySubmissionRepository();
    const submission = await repository.create(input);
    await repository.beginEvaluation!(submission.id, 'job-1');
    const evaluation = await repository.getEvaluation!(submission.id);
    expect(evaluation).not.toHaveProperty('detail');
  });
});
