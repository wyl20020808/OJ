import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemoryJudgeJobRepository,
  JudgeJobPayloadError,
} from '../apps/api/src/modules/judge/index.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const source = '#include <iostream>\nint main(){std::cout << "ok\\n";}\n';
const base = {
  submissionId: 'tcx-submission',
  ownerUserId: 'owner',
  problemId: 'problem-v1',
  problemRevisionId: 'problem-v1-revision-1',
  testdataVersionRef: 'testdata-v1',
  languageId: 'cpp20',
  executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
  languageProfileId: 'cpp20-gcc-13-v1' as const,
  sourceSnapshotRef: 'submission:tcx-submission',
  sourceBytes: source,
  sourceSha256: sha256(source),
  controlledInputId: 'stdin-empty-v1' as const,
  testcaseId: 'case-1',
  testcaseInput: '111\n',
  testcaseInputSha256: sha256('111\n'),
  executionProfileId: 'cpp20-gcc-13-v1' as const,
};

describe('Phase 2C.3 deterministic testcase contract', () => {
  it('freezes testcase identity and exact testdata version at enqueue', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const { job } = await repository.enqueue(base);
    expect(job).toMatchObject({
      problemId: 'problem-v1',
      problemRevisionId: 'problem-v1-revision-1',
      testdataVersionRef: 'testdata-v1',
      testcaseId: 'case-1',
      testcaseInputSha256: sha256('111\n'),
      executionProfileId: 'cpp20-gcc-13-v1',
    });
    const lease = await repository.claim('worker', 30_000);
    expect(lease?.job.testdataVersionRef).toBe('testdata-v1');
    expect(lease?.job.testcaseInput).toBe('111\n');
  });

  it('rejects wrong input hash and profile mutation fail-closed', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await expect(
      repository.enqueue({ ...base, testcaseInputSha256: sha256('222\n') }),
    ).rejects.toBeInstanceOf(JudgeJobPayloadError);
    await expect(
      repository.enqueue({
        ...base,
        executionProfileId: 'mutable-profile' as never,
      }),
    ).rejects.toBeInstanceOf(JudgeJobPayloadError);
    const missingTestcaseId = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== 'testcaseId'),
    ) as Omit<typeof base, 'testcaseId'>;
    await expect(repository.enqueue(missingTestcaseId)).rejects.toBeInstanceOf(
      JudgeJobPayloadError,
    );
    await expect(
      repository.enqueue({
        ...base,
        testdataVersionRef: 'latest',
      }),
    ).rejects.toBeInstanceOf(JudgeJobPayloadError);
    await expect(
      repository.enqueue({
        ...base,
        testcaseId: '../escape',
      }),
    ).rejects.toBeInstanceOf(JudgeJobPayloadError);
  });

  it('requires an immutable record on terminal publication', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const { job } = await repository.enqueue(base);
    const lease = await repository.claim('worker', 30_000);
    const record = {
      record_version: '2C.3',
      record_id: `${lease!.job.executionRequestId}:case-1`,
      digest: 'a'.repeat(64),
      identity: {
        problem_id: job.problemId,
        problem_revision_id: job.problemRevisionId,
        testdata_version_id: job.testdataVersionRef,
        testcase_id: job.testcaseId!,
        input_sha256: job.testcaseInputSha256!,
        execution_profile_id: job.executionProfileId!,
        execution_attempt_id: lease!.job.executionAttemptId!,
      },
    };
    const result = {
      protocol_version: '2C.3' as const,
      execution_request_id: lease!.job.executionRequestId!,
      judge_job_id: job.id,
      submission_id: job.submissionId,
      attempt: lease!.job.attempt,
      execution_attempt_id: lease!.job.executionAttemptId!,
      compile_attempt_id: `${lease!.job.executionRequestId}:compile`,
      runtime_attempt_id: `${lease!.job.executionRequestId}:runtime`,
      result_generation: lease!.job.resultGeneration!,
      correlation_id: job.id,
      language_profile_id: 'cpp20-gcc-13-v1' as const,
      source_sha256: job.sourceSha256!,
      problem_id: job.problemId,
      problem_revision_id: job.problemRevisionId,
      testdata_version_id: job.testdataVersionRef,
      testcase_id: job.testcaseId!,
      testcase_input_sha256: job.testcaseInputSha256!,
      execution_profile_id: job.executionProfileId!,
      single_testcase_record: record,
      pipeline_outcome: 'PIPELINE_COMPLETED' as const,
      compile: {
        outcome: 'COMPILE_SUCCEEDED',
        stdout: '',
        stderr: '',
        stdout_bytes: 0,
        stderr_bytes: 0,
        stdout_sha256: sha256(''),
        stderr_sha256: sha256(''),
        stdout_truncated: false,
        stderr_truncated: false,
      },
      runtime: {
        outcome: 'EXECUTION_COMPLETED',
        stdout: '111\n',
        stderr: '',
        stdout_bytes: 4,
        stderr_bytes: 0,
        stdout_sha256: sha256('111\n'),
        stderr_sha256: sha256(''),
        stdout_truncated: false,
        stderr_truncated: false,
      },
      started_at: '2026-08-31T00:00:00.000Z',
      completed_at: '2026-08-31T00:00:01.000Z',
      clean: true,
    };
    const completed = await repository.completeReal!(
      job.id,
      lease!.leaseToken,
      result,
    );
    expect(completed.status).toBe('COMPLETED');
    const duplicate = await repository.completeReal!(
      job.id,
      lease!.leaseToken,
      result,
    );
    expect(duplicate.rawResultDigest).toBe(completed.rawResultDigest);
    await expect(
      repository.completeReal!(job.id, lease!.leaseToken, {
        ...result,
        single_testcase_record: { ...record, digest: 'b'.repeat(64) },
      }),
    ).rejects.toThrow('Conflicting duplicate');
    const staleDuplicate = await repository.completeReal!(
      job.id,
      'stale-token',
      result,
    );
    expect(staleDuplicate.status).toBe('COMPLETED');
  });

  it('rejects a terminal publication whose provenance or record identity drifts', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const { job } = await repository.enqueue(base);
    const lease = await repository.claim('worker', 30_000);
    const result = {
      protocol_version: '2C.3' as const,
      execution_request_id: lease!.job.executionRequestId!,
      judge_job_id: job.id,
      submission_id: job.submissionId,
      attempt: lease!.job.attempt,
      execution_attempt_id: lease!.job.executionAttemptId!,
      compile_attempt_id: `${lease!.job.executionRequestId}:compile`,
      runtime_attempt_id: `${lease!.job.executionRequestId}:runtime`,
      result_generation: lease!.job.resultGeneration!,
      correlation_id: job.id,
      language_profile_id: 'cpp20-gcc-13-v1' as const,
      source_sha256: job.sourceSha256!,
      problem_id: job.problemId,
      problem_revision_id: job.problemRevisionId,
      testdata_version_id: job.testdataVersionRef,
      testcase_id: job.testcaseId!,
      testcase_input_sha256: job.testcaseInputSha256!,
      execution_profile_id: job.executionProfileId!,
      single_testcase_record: {
        record_version: '2C.3',
        record_id: `${lease!.job.executionRequestId}:case-1`,
        digest: 'a'.repeat(64),
        identity: {
          problem_id: job.problemId,
          problem_revision_id: job.problemRevisionId,
          testdata_version_id: job.testdataVersionRef,
          testcase_id: job.testcaseId!,
          input_sha256: job.testcaseInputSha256!,
          execution_profile_id: job.executionProfileId!,
          execution_attempt_id: lease!.job.executionAttemptId!,
        },
      },
      pipeline_outcome: 'PIPELINE_COMPLETED' as const,
      compile: {
        outcome: 'COMPILE_SUCCEEDED',
        stdout: '',
        stderr: '',
        stdout_bytes: 0,
        stderr_bytes: 0,
        stdout_sha256: sha256(''),
        stderr_sha256: sha256(''),
        stdout_truncated: false,
        stderr_truncated: false,
      },
      runtime: {
        outcome: 'EXECUTION_COMPLETED',
        stdout: '111\n',
        stderr: '',
        stdout_bytes: 4,
        stderr_bytes: 0,
        stdout_sha256: sha256('111\n'),
        stderr_sha256: sha256(''),
        stdout_truncated: false,
        stderr_truncated: false,
      },
      started_at: '2026-08-31T00:00:00.000Z',
      completed_at: '2026-08-31T00:00:01.000Z',
      clean: true,
    };
    const drifted = {
      ...result,
      testdata_version_id: 'testdata-v2',
      single_testcase_record: {
        ...result.single_testcase_record,
        identity: {
          ...result.single_testcase_record.identity,
          testdata_version_id: 'testdata-v2',
        },
      },
    };
    await expect(
      repository.completeReal!(job.id, lease!.leaseToken, drifted),
    ).rejects.toThrow('Real execution result mismatch');
    const oversized = {
      ...result,
      runtime: { ...result.runtime, stdout_bytes: 64 * 1024 + 1 },
    };
    await expect(
      repository.completeReal!(job.id, lease!.leaseToken, oversized),
    ).rejects.toThrow('Real execution result mismatch');
  });
});
