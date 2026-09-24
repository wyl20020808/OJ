/**
 * Redis-backed governance stores for the AI Bridge host runtime.
 *
 * Namespace: `oj:aibridge:v1:*` — versioned, separate from every other `oj:*` consumer, so a
 * future semantics change can roll keys without touching anything else.
 *
 * Atomicity lives in Lua (the repo's established pattern): rate limiting is an exact sliding
 * window over a sorted set; quota is reserve/settle/release over one hash per bucket; the
 * idempotency replay cache is one hash per identity with an encrypted payload (see
 * `store-crypto.ts`) and a hard TTL — the replay window is transient by design, never "forever".
 *
 * Failure posture: a store that cannot reach Redis throws, and the bridge fails the call closed
 * (governance-stage error) rather than skipping a cost/safety check.
 */
import { createHash, randomUUID } from 'node:crypto';
import { decryptPayload, encryptPayload } from './store-crypto.js';
import type {
  IdempotencyRecordLike,
  IdempotencyStorePortLike,
  QuotaStorePortLike,
  RateLimitStorePortLike,
} from './types.js';

/** The versioned key namespace every AI Bridge Redis key lives under. */
export const AI_REDIS_NAMESPACE = 'oj:aibridge:v1:';

/** The replay-cache retention ceiling, mirroring the AI Bridge in-memory reference (15 min). */
export const IDEMPOTENCY_RETENTION_MS = 15 * 60_000;
/** Quota buckets outlive their period by this much for diagnostics, then disappear. */
const QUOTA_BUCKET_TTL_MS = 35 * 24 * 60 * 60_000;

/** The ioredis-shaped seam these stores use (structural; no driver import). */
export type RedisEvalLike = {
  eval(
    script: string,
    numKeys: number,
    ...args: readonly (string | number)[]
  ): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  pttl(key: string): Promise<number>;
};

const digest = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/* ── Rate limiting: exact sliding window ────────────────────────────────────────────────── */

const RATE_CONSUME_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retryAfter = 0
  if oldest[1] then
    retryAfter = math.max(0, math.floor(oldest[2] + ARGV[2] - ARGV[1]))
  end
  return {0, retryAfter}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return {1, 0}
`;

/** Sliding-window rate-limit store, atomically maintained inside Redis. */
export function createRedisRateLimitStore(
  redis: RedisEvalLike,
): RateLimitStorePortLike {
  return {
    async tryConsume(bucket, atMs, limit, windowMs) {
      const key = `${AI_REDIS_NAMESPACE}rate:${digest(bucket)}`;
      const member = `${atMs}:${randomUUID()}`;
      const result = (await redis.eval(
        RATE_CONSUME_LUA,
        1,
        key,
        atMs,
        windowMs,
        limit,
        member,
      )) as readonly [number, number];
      return {
        allowed: result[0] === 1,
        retryAfterMs: Math.max(0, Math.trunc(result[1])),
      };
    },
  };
}

/* ── Quota: reserve / settle / release ──────────────────────────────────────────────────── */

const QUOTA_RESERVE_LUA = `
local settled = tonumber(redis.call('HGET', KEYS[1], 'settled') or '0')
local outstanding = 0
local fields = redis.call('HKEYS', KEYS[1])
for _, field in ipairs(fields) do
  if field ~= 'settled' then
    outstanding = outstanding + tonumber(redis.call('HGET', KEYS[1], field))
  end
end
if settled + outstanding + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
  return ''
end
redis.call('HSET', KEYS[1], 'res:' .. ARGV[3], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return ARGV[3]
`;

const QUOTA_SETTLE_LUA = `
if redis.call('HGET', KEYS[1], 'res:' .. ARGV[1]) then
  redis.call('HDEL', KEYS[1], 'res:' .. ARGV[1])
end
local settled = tonumber(redis.call('HGET', KEYS[1], 'settled') or '0')
redis.call('HSET', KEYS[1], 'settled', tostring(settled + tonumber(ARGV[2])))
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

const QUOTA_RELEASE_LUA = `
redis.call('HDEL', KEYS[1], 'res:' .. ARGV[1])
return 1
`;

const QUOTA_CONSUMED_LUA = `
local total = 0
local fields = redis.call('HGETALL', KEYS[1])
for index = 1, #fields, 2 do
  total = total + tonumber(fields[index + 1])
end
return tostring(total)
`;

/** Reserve/settle/release quota accounting, atomically maintained inside Redis. */
export function createRedisQuotaStore(
  redis: RedisEvalLike,
): QuotaStorePortLike {
  const keyFor = (bucket: string): string =>
    `${AI_REDIS_NAMESPACE}quota:${digest(bucket)}`;
  return {
    async reserve(bucket, amount, limit) {
      const reservationId = `qr-${randomUUID()}`;
      const result = await redis.eval(
        QUOTA_RESERVE_LUA,
        1,
        keyFor(bucket),
        amount,
        limit,
        reservationId,
        QUOTA_BUCKET_TTL_MS,
      );
      return typeof result === 'string' && result.length > 0 ? result : null;
    },
    async settle(bucket, reservationId, actual) {
      await redis.eval(
        QUOTA_SETTLE_LUA,
        1,
        keyFor(bucket),
        reservationId,
        actual,
        QUOTA_BUCKET_TTL_MS,
      );
    },
    async release(bucket, reservationId) {
      await redis.eval(QUOTA_RELEASE_LUA, 1, keyFor(bucket), reservationId);
    },
    async consumed(bucket) {
      const result = await redis.eval(QUOTA_CONSUMED_LUA, 1, keyFor(bucket));
      const value = Number(result);
      return Number.isFinite(value) ? value : 0;
    },
  };
}

/* ── Idempotency replay cache: one encrypted hash per identity, hard TTL ────────────────── */

const IDEM_CLAIM_LUA = `
local fp = redis.call('HGET', KEYS[1], 'fp')
if fp then
  if fp ~= ARGV[1] then
    return {'CONFLICT', redis.call('HGET', KEYS[1], 'payload')}
  end
  local status = redis.call('HGET', KEYS[1], 'status')
  if status == 'IN_FLIGHT' then
    return {'JOIN', redis.call('HGET', KEYS[1], 'payload')}
  end
  return {'REPLAY', redis.call('HGET', KEYS[1], 'payload')}
end
redis.call('HSET', KEYS[1], 'fp', ARGV[1], 'status', 'IN_FLIGHT', 'payload', ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {'PROCEED', ''}
`;

const IDEM_COMPLETE_LUA = `
if not redis.call('HGET', KEYS[1], 'fp') then
  return 0
end
redis.call('HSET', KEYS[1], 'status', ARGV[1], 'payload', ARGV[2])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
end
return 1
`;

export type RedisIdempotencyStoreOptions = {
  readonly retentionMs?: number;
};

/**
 * The durable-enough replay cache. `claim` is atomic inside Redis (one `PROCEED` per identity).
 * Payloads are AES-256-GCM encrypted with a host-derived key: Redis snapshots never hold
 * plaintext results, and an unreadable entry is treated as absent (fail closed into a fresh
 * `PROCEED`, never into a wrong replay).
 */
export function createRedisIdempotencyStore(
  redis: RedisEvalLike,
  encryptionKey: Buffer,
  options: RedisIdempotencyStoreOptions = {},
): IdempotencyStorePortLike {
  const retentionMs = Math.max(
    1,
    options.retentionMs ?? IDEMPOTENCY_RETENTION_MS,
  );
  const keyFor = (identity: string): string =>
    `${AI_REDIS_NAMESPACE}idem:${digest(identity)}`;

  const readRecord = (
    payload: string | false | undefined,
  ): IdempotencyRecordLike | null => {
    if (typeof payload !== 'string' || payload.length === 0) {
      return null;
    }
    const plaintext = decryptPayload(encryptionKey, payload);
    if (plaintext === null) {
      return null;
    }
    try {
      return JSON.parse(plaintext) as IdempotencyRecordLike;
    } catch {
      return null;
    }
  };

  return {
    async claim(record) {
      const nowMs = Date.now();
      const ttlMs = Math.max(
        1,
        Math.min(record.expiresAtMs, nowMs + retentionMs) - nowMs,
      );
      const stored: IdempotencyRecordLike = {
        ...record,
        expiresAtMs: nowMs + ttlMs,
      };
      const payload = encryptPayload(encryptionKey, JSON.stringify(stored));
      const result = (await redis.eval(
        IDEM_CLAIM_LUA,
        1,
        keyFor(record.identity),
        record.fingerprint,
        payload,
        ttlMs,
      )) as readonly [string, string | false];
      const kind = result[0];
      if (kind === 'PROCEED') {
        return { kind: 'PROCEED', record: stored };
      }
      const existing = readRecord(result[1]);
      if (existing === null) {
        // An undecryptable entry is no entry: overwrite by proceeding with our own record.
        return { kind: 'PROCEED', record: stored };
      }
      return { kind: kind as 'JOIN' | 'REPLAY' | 'CONFLICT', record: existing };
    },
    async complete(identity, status, result, nowMs) {
      const existing = await this.get(identity);
      if (existing === null) {
        return;
      }
      const updated: IdempotencyRecordLike = {
        ...existing,
        status,
        result,
        expiresAtMs: Math.max(existing.expiresAtMs, nowMs),
      };
      const payload = encryptPayload(encryptionKey, JSON.stringify(updated));
      const ttlMs = Math.max(1, updated.expiresAtMs - nowMs);
      await redis.eval(
        IDEM_COMPLETE_LUA,
        1,
        keyFor(identity),
        status,
        payload,
        ttlMs,
      );
    },
    async get(identity) {
      const key = keyFor(identity);
      const fields = await redis.hgetall(key);
      const payload = fields['payload'];
      const record = readRecord(payload === undefined ? false : payload);
      if (record === null) {
        return null;
      }
      const ttl = await redis.pttl(key);
      if (ttl === 0 || record.expiresAtMs <= Date.now()) {
        return null;
      }
      return record;
    },
  };
}
