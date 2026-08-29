import { describe, expect, it } from 'vitest';
import {
  DeterministicFakeJudgeWorker,
  InMemoryJudgeJobRepository,
  JudgeJobPayloadError,
  JudgeQueueService,
  NoSourceExecutionGuard,
  safeJudgeLog,
  assertPayload,
} from '../apps/api/src/modules/judge/index.js';

const input = {
  submissionId: 's1',
  ownerUserId: 'u1',
  problemId: 'p1',
  problemRevisionId: 'r1',
  testdataVersionRef: 'td1',
  languageId: 'typescript',
};
const create = () => new JudgeQueueService(new InMemoryJudgeJobRepository());

describe('judge queue recovery matrix', () => {
  it('Q01/Q02/Q03 one logical job under >=20 concurrent duplicate enqueue', async () => {
    const q = create();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => q.enqueue(input)),
    );
    expect(new Set(results.map((x) => x.job.id)).size).toBe(1);
    expect(results.filter((x) => x.created)).toHaveLength(1);
  });
  it('Q04 distinct submissions remain isolated under concurrent enqueue', async () => {
    const q = create();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        q.enqueue({
          ...input,
          submissionId: `s-${i}`,
          idempotencyKey: `submission:s-${i}`,
        }),
      ),
    );
    expect(new Set(results.map((x) => x.job.id)).size).toBe(20);
    expect(new Set(results.map((x) => x.job.submissionId)).size).toBe(20);
  });
  it('Q05/Q06 one lease winner in concurrent claim race', async () => {
    const q = create();
    await q.enqueue(input);
    const claims = await Promise.all([q.claim('a'), q.claim('b')]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('Q07/Q08 expiry invalidates stale token and creates new attempt', async () => {
    const q = create();
    await q.enqueue(input);
    const a = await q.claim('a', 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await q.recoverStale()).toBe(1);
    await expect(q.complete(a!.job.id, a!.leaseToken)).rejects.toThrow(
      'conflict',
    );
    const b = await q.claim('b');
    expect(b!.job.attempt).toBe(2);
    await expect(q.complete(b!.job.id, b!.leaseToken)).resolves.toMatchObject({
      status: 'SUCCEEDED_FAKE',
    });
  });
  it('Q09/Q10 duplicate completion has one terminal effect', async () => {
    const q = create();
    await q.enqueue(input);
    const c = await q.claim('a');
    const done = await Promise.all([
      q.complete(c!.job.id, c!.leaseToken),
      q.complete(c!.job.id, c!.leaseToken),
    ]);
    expect(done[0].status).toBe('SUCCEEDED_FAKE');
    expect(done[1].status).toBe('SUCCEEDED_FAKE');
  });
  it('Q11/Q12/Q17 rejects wrong and late stale completion', async () => {
    const q = create();
    await q.enqueue(input);
    const a = await q.claim('a', 1);
    await new Promise((r) => setTimeout(r, 5));
    await q.recoverStale();
    const b = await q.claim('b');
    await expect(q.complete(a!.job.id, a!.leaseToken)).rejects.toThrow(
      'conflict',
    );
    expect((await q.complete(b!.job.id, b!.leaseToken)).status).toBe(
      'SUCCEEDED_FAKE',
    );
  });
  it('Q13-Q16 retry increments and terminalizes at cap', async () => {
    const q = create();
    await q.enqueue({ ...input, maxAttempts: 2 });
    const a = await q.claim('a');
    const retry = await q.retry(a!.job.id, a!.leaseToken, 'fixture');
    expect(retry.status).toBe('FAILED_RETRYABLE');
    const b = await q.claim('b');
    const terminal = await q.retry(b!.job.id, b!.leaseToken, 'fixture');
    expect(terminal.status).toBe('FAILED_TERMINAL');
    await expect(q.claim('c')).resolves.toBeUndefined();
  });
  it('Q18/Q19 races converge without stale worker mutation', async () => {
    const q = create();
    await q.enqueue(input);
    const a = await q.claim('a', 1);
    await new Promise((r) => setTimeout(r, 5));
    const [recovered, late] = await Promise.all([
      q.recoverStale(),
      q.complete(a!.job.id, a!.leaseToken).then(
        () => 'accepted',
        () => 'rejected',
      ),
    ]);
    expect(recovered).toBe(1);
    expect(late).toBe('rejected');
    const b = await q.claim('b');
    await expect(q.retry(a!.job.id, a!.leaseToken, 'stale')).rejects.toThrow(
      'conflict',
    );
    expect(b!.job.attempt).toBe(2);
  });
  it('Q20-Q23 attempt monotonicity, terminal non-claim, repeated recovery idempotency', async () => {
    const repository = new InMemoryJudgeJobRepository();
    const q = new JudgeQueueService(repository);
    await q.enqueue({ ...input, maxAttempts: 1 });
    const a = await q.claim('a', 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await q.recoverStale()).toBe(1);
    expect(await q.recoverStale()).toBe(0);
    const job = await repository.getById(a!.job.id);
    expect(job!.attempt).toBe(1);
    expect(job!.status).toBe('FAILED_TERMINAL');
    await expect(q.claim('x')).resolves.toBeUndefined();
  });
  it('Q24-Q30 lease/job isolation and malformed payload safety', async () => {
    const q = create();
    await q.enqueue({ ...input, submissionId: 'a' });
    await q.enqueue({ ...input, submissionId: 'b' });
    const a = await q.claim('a');
    const b = await q.claim('b');
    await expect(q.complete(a!.job.id, b!.leaseToken)).rejects.toThrow(
      'conflict',
    );
    expect(
      (await q.failTerminal(b!.job.id, b!.leaseToken, 'x')).submissionId,
    ).toBe('b');
    expect(() => assertPayload({ id: 'bad', status: 'NOPE' })).toThrow(
      JudgeJobPayloadError,
    );
  });
  it('R07/R08 recovers a fake worker abort after result generation and before acknowledgement', async () => {
    const q = create();
    await q.enqueue(input);
    const guard = new NoSourceExecutionGuard();
    const crashed = new DeterministicFakeJudgeWorker(
      q,
      'crashed-fake',
      guard,
      () => {
        throw new Error('simulated fake-worker crash before acknowledgement');
      },
      1,
    );
    await expect(crashed.processOne('control-pass-v1')).rejects.toThrow(
      'simulated fake-worker crash',
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(await q.recoverStale()).toBe(1);
    const worker = new DeterministicFakeJudgeWorker(q, 'recovered-fake', guard);
    const result = await worker.processOne('control-pass-v1');
    expect(result).toMatchObject({
      kind: 'SYNTHETIC_QUALIFICATION_ONLY',
      outcome: 'FIXTURE_PASS',
      fixtureId: 'control-pass-v1',
    });
    expect(guard.attempts).toEqual([]);
    await expect(worker.processOne('control-pass-v1')).resolves.toBeUndefined();
  });
  it('S01-S10 has no source execution primitive or real verdict', () => {
    expect(
      DeterministicFakeJudgeWorker.prototype.processOne.toString(),
    ).not.toMatch(
      /child_process|\bspawn\s*\(|\bexec\s*\(|\bcompile\s*\(|\beval\s*\(|\bshell\s*\(|\bsystem\s*\(/i,
    );
  });
  it('S01-S10 reject execution, retain no source body, and log safe metadata only', async () => {
    const guard = new NoSourceExecutionGuard();
    expect(() => guard.forbid('execute')).toThrow('Forbidden source operation');
    const q = create();
    const marker = 'QUEUE_SOURCE_MUST_NOT_BE_LOGGED_unique';
    const sourceShapedInput = {
      ...input,
      idempotencyKey: 'marker',
      source: `system('x'); eval('x'); os.system('x'); <script>${marker}</script>`,
    };
    const created = await q.enqueue(sourceShapedInput);
    const claim = await q.claim('worker');
    const log = JSON.stringify(safeJudgeLog('claim', claim!.job));
    await q.retry(claim!.job.id, claim!.leaseToken, 'qualification');
    const retry = await q.claim('worker-retry');
    await q.complete(retry!.job.id, retry!.leaseToken);
    expect(log).not.toContain(marker);
    expect(JSON.stringify(created.job)).not.toContain(marker);
    expect(log).not.toContain(claim!.leaseToken);
    expect(guard.attempts).toEqual(['execute']);
  });
});
