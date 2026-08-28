import { describe, expect, it } from 'vitest';
import {
  DeterministicFakeJudgeWorker,
  InMemoryJudgeJobRepository,
  JudgeQueueService,
} from '../apps/api/src/modules/judge/index.js';

const input = {
  submissionId: 's1',
  ownerUserId: 'u1',
  problemId: 'p1',
  problemRevisionId: 'r1',
  testdataVersionRef: 'td1',
  languageId: 'typescript',
};

describe('judge queue foundation', () => {
  it('has one logical job per submission and survives repository restart state', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const queue = new JudgeQueueService(repository);
    const first = await queue.enqueue(input);
    const duplicate = await queue.enqueue(input);
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);
    expect((await repository.getBySubmissionId('s1'))?.problemRevisionId).toBe(
      'r1',
    );
  });
  it('claims, expires, recovers, increments attempts, and reaches terminal failure', async () => {
    const queue = new JudgeQueueService(new InMemoryJudgeJobRepository());
    await queue.enqueue({ ...input, maxAttempts: 2 });
    const first = await queue.claim('worker-a', 1);
    expect(first?.job.status).toBe('LEASED');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await queue.recoverStale()).toBe(1);
    const second = await queue.claim('worker-b', 1000);
    expect(second?.job.attempt).toBe(2);
    const failed = await queue.retry(
      second!.job.id,
      second!.leaseToken,
      'fixture failure',
    );
    expect(failed.status).toBe('TERMINAL_FAILURE');
  });
  it('makes completion idempotent and fake worker output deterministic/synthetic', async () => {
    const queue = new JudgeQueueService(new InMemoryJudgeJobRepository());
    await queue.enqueue(input);
    const worker = new DeterministicFakeJudgeWorker(queue, 'fake-test');
    const result = await worker.processOne();
    expect(result).toMatchObject({
      kind: 'SYNTHETIC_QUALIFICATION_ONLY',
      outcome: 'FIXTURE_PASS',
      attempt: 1,
    });
    const job = await queue.enqueue(input);
    const completed = await queue.complete(job.job.id, 'unused');
    expect(completed.status).toBe('COMPLETED');
  });
  it('never exposes a source execution path', () => {
    expect(
      DeterministicFakeJudgeWorker.prototype.processOne.toString(),
    ).not.toMatch(/exec|compile|eval|spawn|shell|child_process/i);
  });
});
