import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createRedisIdempotencyStore,
  createRedisQuotaStore,
  createRedisRateLimitStore,
} from '../apps/api/src/modules/ai/redis-stores.js';
import { deriveStoreEncryptionKey } from '../apps/api/src/modules/ai/store-crypto.js';
import type { IdempotencyRecordLike } from '../apps/api/src/modules/ai/types.js';

/**
 * Stage 6 Redis governance stores against a real Redis (the repo integration posture:
 * `redis://127.0.0.1:56379` or `$REDIS_URL`). Verifies atomicity and durability semantics that
 * the in-memory fakes cannot prove: one PROCEED per identity under concurrency, quota
 * reservation state shared across store instances, exact sliding-window rate limiting, and
 * replay-cache payloads that are never plaintext at rest.
 */

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
const run = randomUUID().slice(0, 8);
const encryptionKey = deriveStoreEncryptionKey(`test-operator-secret-${run}`);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  redis.disconnect();
});

describe('Redis rate-limit store (exact sliding window)', () => {
  it('admits up to the limit, then denies with a positive retryAfterMs, then recovers', async () => {
    const store = createRedisRateLimitStore(redis);
    const bucket = `test|rl|${run}|a`;
    const now = Date.now();
    for (let index = 0; index < 3; index += 1) {
      const decision = await store.tryConsume(bucket, now + index, 3, 400);
      expect(decision.allowed).toBe(true);
    }
    const denied = await store.tryConsume(bucket, now + 3, 3, 400);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    await sleep(500);
    const recovered = await store.tryConsume(bucket, Date.now(), 3, 400);
    expect(recovered.allowed).toBe(true);
  });

  it('keeps buckets isolated', async () => {
    const store = createRedisRateLimitStore(redis);
    const now = Date.now();
    await store.tryConsume(`test|rl|${run}|b1`, now, 1, 60_000);
    const other = await store.tryConsume(`test|rl|${run}|b2`, now, 1, 60_000);
    expect(other.allowed).toBe(true);
    const denied = await store.tryConsume(`test|rl|${run}|b1`, now, 1, 60_000);
    expect(denied.allowed).toBe(false);
  });
});

describe('Redis quota store (reserve/settle/release, durable)', () => {
  it('reserves up to the limit and rejects overflow', async () => {
    const store = createRedisQuotaStore(redis);
    const bucket = `test|quota|${run}|reserve`;
    const first = await store.reserve(bucket, 60, 100);
    const second = await store.reserve(bucket, 40, 100);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await store.reserve(bucket, 1, 100)).toBeNull();
    await store.release(bucket, first!);
    expect(await store.reserve(bucket, 1, 100)).not.toBeNull();
  });

  it('settle records actual usage (overspend recorded, not hidden) and survives a new instance', async () => {
    const store = createRedisQuotaStore(redis);
    const bucket = `test|quota|${run}|settle`;
    const reservation = await store.reserve(bucket, 50, 100);
    expect(reservation).not.toBeNull();
    await store.settle(bucket, reservation!, 70);
    // A *new* store instance over the same Redis sees the same accounting: durability.
    const fresh = createRedisQuotaStore(redis);
    expect(await fresh.consumed(bucket)).toBe(70);
    // 70 settled leaves 30: reserving 31 must fail, 30 must succeed.
    expect(await fresh.reserve(bucket, 31, 100)).toBeNull();
    expect(await fresh.reserve(bucket, 30, 100)).not.toBeNull();
    expect(await fresh.consumed(bucket)).toBe(100);
  });
});

describe('Redis idempotency replay cache (atomic claim, encrypted payloads)', () => {
  const record = (fingerprint: string, suffix: string): IdempotencyRecordLike => ({
    identity: `site.problem|ai.text.generate|1.0|test-${run}-${suffix}`,
    fingerprint,
    status: 'IN_FLIGHT',
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 60_000,
    logicalRequestId: `lr-${run}-${suffix}`,
  });

  it('exactly one PROCEED under concurrent duplicate claims', async () => {
    const store = createRedisIdempotencyStore(redis, encryptionKey);
    const candidate = record('fp-one', 'concurrent');
    const claims = await Promise.all(Array.from({ length: 6 }, () => store.claim(candidate)));
    expect(claims.filter((claim) => claim.kind === 'PROCEED')).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'JOIN')).toHaveLength(5);
  });

  it('complete → REPLAY returns the terminal result; fingerprint mismatch → CONFLICT', async () => {
    const store = createRedisIdempotencyStore(redis, encryptionKey);
    const candidate = record('fp-two', 'replay');
    const first = await store.claim(candidate);
    expect(first.kind).toBe('PROCEED');
    await store.complete(candidate.identity, 'SUCCEEDED', { status: 'SUCCEEDED', marker: `result-${run}` }, Date.now());
    const replay = await store.claim(candidate);
    expect(replay.kind).toBe('REPLAY');
    expect((replay.record.result as { marker: string }).marker).toBe(`result-${run}`);
    const conflict = await store.claim(record('fp-different', 'replay'));
    expect(conflict.kind).toBe('CONFLICT');
    const fetched = await store.get(candidate.identity);
    expect(fetched?.status).toBe('SUCCEEDED');
  });

  it('never stores a plaintext payload at rest', async () => {
    const store = createRedisIdempotencyStore(redis, encryptionKey);
    const candidate = record('fp-three', 'encrypted');
    await store.claim(candidate);
    await store.complete(candidate.identity, 'SUCCEEDED', { secretContent: `plaintext-marker-${run}` }, Date.now());
    const keys = await redis.keys(`oj:aibridge:v1:idem:*`);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const fields = await redis.hgetall(key);
      expect(JSON.stringify(fields)).not.toContain(`plaintext-marker-${run}`);
    }
  });

  it('treats undecryptable entries as absent (fail closed into a fresh PROCEED)', async () => {
    const wrongKey = deriveStoreEncryptionKey('a-different-secret');
    const writer = createRedisIdempotencyStore(redis, wrongKey);
    const candidate = record('fp-four', 'foreign');
    await writer.claim(candidate);
    const reader = createRedisIdempotencyStore(redis, encryptionKey);
    const claim = await reader.claim(candidate);
    // Undecryptable → never a replay of foreign state.
    expect(claim.kind).toBe('PROCEED');
  });
});
