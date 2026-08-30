import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertPayload,
  InMemoryJudgeJobRepository,
  JudgeJobPayloadError,
  publicJudgeJob,
  type RawExecutionResult,
} from '../apps/api/src/modules/judge/index.js';
import { LANGUAGE_CATALOG } from '../apps/api/src/modules/submission/languages.js';

const source = '#include <iostream>\nint main(){std::cout << "ok\\n";}\n';
const sourceSha256 = createHash('sha256').update(source, 'utf8').digest('hex');
const input = {
  submissionId: 'submission-real',
  ownerUserId: 'owner',
  problemId: 'problem',
  problemRevisionId: 'revision',
  testdataVersionRef: 'testdata-v1',
  languageId: 'cpp20',
  executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
  languageProfileId: 'cpp20-gcc-13-v1' as const,
  sourceSnapshotRef: 'submission:submission-real',
  sourceBytes: source,
  sourceSha256,
  controlledInputId: 'stdin-empty-v1' as const,
};

function result(jobId: string, attempt: number): RawExecutionResult {
  return {
    protocol_version: '2C.1',
    execution_request_id: `${jobId}:${attempt}`,
    judge_job_id: jobId,
    submission_id: input.submissionId,
    attempt,
    correlation_id: jobId,
    language_profile_id: 'cpp20-gcc-13-v1',
    source_sha256: sourceSha256,
    pipeline_outcome: 'PIPELINE_COMPLETED',
    compile: {
      outcome: 'COMPILE_SUCCEEDED',
      exit_code: 0,
      stdout: '',
      stderr: '',
      stdout_truncated: false,
      stderr_truncated: false,
      wall_time_ms: 100,
      clean: true,
      resource_evidence: {
        control_group: '/host/private/cgroup',
      },
    },
    runtime: {
      outcome: 'EXECUTION_COMPLETED',
      exit_code: 0,
      stdout: 'ok\n',
      stderr: '',
      stdout_truncated: false,
      stderr_truncated: false,
      wall_time_ms: 10,
      clean: true,
    },
    started_at: '2026-08-30T00:00:00.000Z',
    completed_at: '2026-08-30T00:00:01.000Z',
    clean: true,
  };
}

describe('Phase 2C.1 immutable Judge Job contract', () => {
  it('registers only the fixed C++20 intake profile', () => {
    expect(LANGUAGE_CATALOG.get('cpp20')).toMatchObject({
      displayName: 'C++20 (GCC 13)',
      maxSourceBytes: 256 * 1024,
    });
  });

  it('binds source hash, real lease, and current-attempt raw completion', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const created = await repository.enqueue(input);
    expect(created.job).toMatchObject({
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      sourceBytes: source,
      sourceSha256,
    });
    const lease = await repository.claim('real-worker', 30_000);
    expect(lease?.job.status).toBe('LEASED');
    const completed = await repository.completeReal!(
      lease!.job.id,
      lease!.leaseToken,
      result(lease!.job.id, lease!.job.attempt),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.rawExecutionResult?.pipeline_outcome).toBe(
      'PIPELINE_COMPLETED',
    );
  });

  it('rejects source tampering and stale/cross-job raw results', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await expect(
      repository.enqueue({ ...input, sourceBytes: `${source}//tamper` }),
    ).rejects.toBeInstanceOf(JudgeJobPayloadError);
    const { job } = await repository.enqueue(input);
    const lease = await repository.claim('real-worker', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repository.recoverStale();
    const next = await repository.claim('real-worker-next', 30_000);
    await expect(
      repository.completeReal!(
        job.id,
        lease!.leaseToken,
        result(job.id, lease!.job.attempt),
      ),
    ).rejects.toThrow('conflict');
    await expect(
      repository.completeReal!(job.id, next!.leaseToken, {
        ...result(job.id, next!.job.attempt),
        submission_id: 'other',
      }),
    ).rejects.toThrow('mismatch');
  });

  it('public projection omits source, lease, and host cgroup evidence', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue(input);
    const lease = await repository.claim('real-worker', 30_000);
    const completed = await repository.completeReal!(
      lease!.job.id,
      lease!.leaseToken,
      result(lease!.job.id, lease!.job.attempt),
    );
    const projected = JSON.stringify(publicJudgeJob(completed));
    expect(projected).toContain('PIPELINE_COMPLETED');
    expect(projected).not.toContain(source);
    expect(projected).not.toMatch(
      /sourceBytes|sourceSnapshotRef|leaseToken|control_group|\/host\/private/,
    );
  });

  it('rejects a tampered completed payload when it is read from storage', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue(input);
    const lease = await repository.claim('real-worker', 30_000);
    const completed = await repository.completeReal!(
      lease!.job.id,
      lease!.leaseToken,
      result(lease!.job.id, lease!.job.attempt),
    );
    expect(() => assertPayload(structuredClone(completed))).not.toThrow();
    expect(() =>
      assertPayload({
        ...structuredClone(completed),
        rawExecutionResult: {
          ...completed.rawExecutionResult,
          attempt: completed.attempt - 1,
        },
      }),
    ).toThrow('Invalid raw execution result');
    expect(() =>
      assertPayload({
        ...structuredClone(completed),
        rawExecutionResult: undefined,
      }),
    ).toThrow('Invalid raw execution result');
  });
});
