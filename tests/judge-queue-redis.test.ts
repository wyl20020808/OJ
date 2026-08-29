import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  JudgeQueueService,
  RedisJudgeJobRepository,
} from '../apps/api/src/modules/judge/index.js';

const enabled = process.env.OJPLATFORM_QUEUE_REDIS_QUALIFICATION === 'true';
const describeRedis = enabled ? describe : describe.skip;
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const namespace = `queue-recovery-${randomUUID()}`;
const keyPrefix = `oj:judge:${namespace}`;
let client: Redis;

const input = (suffix: string) => ({
  submissionId: `${namespace}-submission-${suffix}`,
  ownerUserId: `${namespace}-owner`,
  problemId: `${namespace}-problem`,
  problemRevisionId: `${namespace}-revision`,
  testdataVersionRef: `${namespace}-testdata`,
  languageId: 'typescript',
  idempotencyKey: `${namespace}-idempotency-${suffix}`,
});

const create = (suffix: string) =>
  new JudgeQueueService(
    new RedisJudgeJobRepository(client, `${keyPrefix}:${suffix}`),
  );

describeRedis('real Redis judge queue recovery qualification', () => {
  beforeAll(async () => {
    client = new Redis(redisUrl, {
      connectTimeout: 1_500,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    await client.connect();
    expect(await client.ping()).toBe('PONG');
  });

  afterAll(async () => {
    if (client.status === 'ready') {
      const keys = await client.keys(`${keyPrefix}:*`);
      if (keys.length > 0) await client.del(...keys);
    }
    client.disconnect();
  });

  it('Q03/Q04/Q06 uses Redis to preserve concurrent enqueue and claim isolation', async () => {
    const queue = create('concurrency');
    const duplicate = await Promise.all(
      Array.from({ length: 20 }, () => queue.enqueue(input('duplicate'))),
    );
    expect(new Set(duplicate.map((result) => result.job.id)).size).toBe(1);
    const duplicateClaims = await Promise.all(
      Array.from({ length: 10 }, (_, index) => queue.claim(`worker-${index}`)),
    );
    expect(duplicateClaims.filter(Boolean)).toHaveLength(1);
    const distinct = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        queue.enqueue(input(`job-${index}`)),
      ),
    );
    expect(new Set(distinct.map((result) => result.job.id)).size).toBe(20);
  });

  it('Q10/Q18/Q19 serializes completion, expiry recovery, and stale retry', async () => {
    const queue = create('race');
    const { job } = await queue.enqueue(input('race'));
    const first = await queue.claim('first', 1);
    expect(first).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const [recovered, staleCompletion] = await Promise.all([
      queue.recoverStale(),
      queue.complete(job.id, first!.leaseToken).then(
        () => 'accepted',
        () => 'rejected',
      ),
    ]);
    expect(recovered).toBe(1);
    expect(staleCompletion).toBe('rejected');
    const second = await queue.claim('second');
    await expect(
      queue.retry(job.id, first!.leaseToken, 'stale'),
    ).rejects.toThrow('conflict');
    const completed = await Promise.all([
      queue.complete(job.id, second!.leaseToken, 'control-pass-v1'),
      queue.complete(job.id, second!.leaseToken, 'control-fail-v1'),
    ]);
    expect(completed.map((value) => value.syntheticFixtureId)).toEqual([
      'control-pass-v1',
      'control-pass-v1',
    ]);
  });

  it('R01/R02/R03/Q27 rejects an unavailable client and resumes without duplicate enqueue', async () => {
    const unavailable = new Redis('redis://127.0.0.1:1', {
      connectTimeout: 100,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    unavailable.on('error', () => undefined);
    const unavailableQueue = new JudgeQueueService(
      new RedisJudgeJobRepository(unavailable, `${keyPrefix}:unavailable`),
    );
    await expect(
      unavailableQueue.enqueue(input('unavailable')),
    ).rejects.toThrow();
    unavailable.disconnect();

    const queue = create('reconnect');
    const initial = await queue.enqueue(input('reconnect'));
    client.disconnect();
    await expect(queue.claim('disconnected')).rejects.toThrow();
    client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    const recoveredQueue = create('reconnect');
    const repeated = await recoveredQueue.enqueue(input('reconnect'));
    expect(repeated).toMatchObject({
      created: false,
      job: { id: initial.job.id },
    });
    expect(await recoveredQueue.claim('reconnected')).toMatchObject({
      job: { id: initial.job.id, status: 'LEASED_FAKE' },
    });
  });
});
