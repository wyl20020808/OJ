import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemoryJudgeJobRepository,
  JudgeJobConflictError,
  publicJudgeJob,
  type JudgeJob,
  type RawExecutionResult,
} from '../apps/api/src/modules/judge/index.js';

const source = (marker: string) =>
  `#include <iostream>\nint main(){std::cout << "${marker}\\n";}\n`;
const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const input = (submissionId: string, marker = submissionId) => {
  const bytes = source(marker);
  return {
    submissionId,
    ownerUserId: `owner-${submissionId}`,
    problemId: 'problem',
    problemRevisionId: 'revision',
    testdataVersionRef: 'testdata-v1',
    languageId: 'cpp20',
    executionMode: 'REAL_SANDBOXED_EXECUTION' as const,
    languageProfileId: 'cpp20-gcc-13-v1' as const,
    sourceSnapshotRef: `submission:${submissionId}`,
    sourceBytes: bytes,
    sourceSha256: digest(bytes),
    controlledInputId: 'stdin-empty-v1' as const,
  };
};

function result(job: JudgeJob, stdout = 'ok\n'): RawExecutionResult {
  return {
    protocol_version: '2C.1',
    execution_request_id: job.executionRequestId!,
    judge_job_id: job.id,
    submission_id: job.submissionId,
    attempt: job.attempt,
    execution_attempt_id: job.executionAttemptId!,
    compile_attempt_id: `${job.executionRequestId}:compile`,
    runtime_attempt_id: `${job.executionRequestId}:runtime`,
    result_generation: job.resultGeneration!,
    correlation_id: job.id,
    language_profile_id: 'cpp20-gcc-13-v1',
    source_sha256: job.sourceSha256!,
    pipeline_outcome: 'PIPELINE_COMPLETED',
    compile: {
      state: 'COMPILE_SUCCEEDED',
      outcome: 'COMPILE_SUCCEEDED',
      raw_facts: { process_exited: true, exit_code: 0 },
      clean: true,
    },
    artifact: {
      sha256: digest(`artifact:${job.executionAttemptId}`),
      compile_attempt_id: `${job.executionRequestId}:compile`,
    },
    runtime: {
      state: 'RAW_COMPLETED',
      outcome: 'EXECUTION_COMPLETED',
      stdout,
      stderr: '',
      raw_facts: {
        process_exited: true,
        exit_code: 0,
        cleanup_verified: true,
      },
      clean: true,
    },
    started_at: '2026-08-30T00:00:00.000Z',
    completed_at: '2026-08-30T00:00:01.000Z',
    clean: true,
  };
}

describe('Phase 2C.2 queue and result authority', () => {
  it('LIR-10/11 creates one job and a new explicit identity per retry', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const [first, duplicate] = await Promise.all([
      repository.enqueue(input('identity')),
      repository.enqueue(input('identity')),
    ]);
    expect(first.job.id).toBe(duplicate.job.id);
    const lease1 = await repository.claim('worker-1', 1);
    expect(lease1?.job).toMatchObject({
      executionRequestId: `${first.job.id}:1`,
      executionAttemptId: `${first.job.id}:1:attempt`,
      resultGeneration: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await repository.recoverStale()).toBe(1);
    const lease2 = await repository.claim('worker-2', 30_000);
    expect(lease2?.job).toMatchObject({
      executionRequestId: `${first.job.id}:2`,
      executionAttemptId: `${first.job.id}:2:attempt`,
      resultGeneration: 2,
    });
  });

  it('LIR-12/16 accepts an equivalent duplicate once and rejects conflict/stale results', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue(input('result'));
    const lease = (await repository.claim('worker', 30_000))!;
    const raw = result(lease.job);
    const completed = await repository.completeReal!(
      lease.job.id,
      lease.leaseToken,
      raw,
    );
    await expect(
      repository.completeReal!(lease.job.id, lease.leaseToken, raw),
    ).resolves.toMatchObject({ id: completed.id, status: 'COMPLETED' });
    await expect(
      repository.completeReal!(
        lease.job.id,
        lease.leaseToken,
        result(lease.job, 'conflict\n'),
      ),
    ).rejects.toBeInstanceOf(JudgeJobConflictError);
  });

  it('LIR-13..15 makes cancellation authoritative over a queued completion', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue(input('cancel'));
    const lease = (await repository.claim('worker', 30_000))!;
    const [cancelled, late] = await Promise.all([
      repository.cancel!(lease.job.id),
      repository.completeReal!(
        lease.job.id,
        lease.leaseToken,
        result(lease.job),
      ).then(
        () => 'accepted',
        () => 'rejected',
      ),
    ]);
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationGeneration: 1,
    });
    expect(late).toBe('rejected');
    await expect(repository.cancel!(lease.job.id)).resolves.toMatchObject({
      status: 'CANCELLED',
      cancellationGeneration: 1,
    });
  });

  it('LIR-25..27 keeps same-name sources and outputs isolated without verdict mapping', async () => {
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue(input('job-a', 'unique-A-marker'));
    await repository.enqueue(input('job-b', 'unique-B-marker'));
    const a = (await repository.claim('worker-a', 30_000))!;
    const b = (await repository.claim('worker-b', 30_000))!;
    const doneA = await repository.completeReal!(
      a.job.id,
      a.leaseToken,
      result(a.job, 'unique-A-marker\n'),
    );
    const doneB = await repository.completeReal!(
      b.job.id,
      b.leaseToken,
      result(b.job, 'unique-B-marker\n'),
    );
    expect(doneA.sourceSha256).not.toBe(doneB.sourceSha256);
    expect(JSON.stringify(doneA.rawExecutionResult)).not.toContain(
      'unique-B-marker',
    );
    expect(JSON.stringify(doneB.rawExecutionResult)).not.toContain(
      'unique-A-marker',
    );
    const publicResult = JSON.stringify(publicJudgeJob(doneA));
    expect(publicResult).not.toMatch(
      /"verdict"|"AC"|"WA"|"TLE"|"MLE"|"RE"|"CE"/,
    );
  });
});
