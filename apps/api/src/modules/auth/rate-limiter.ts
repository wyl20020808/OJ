import { createHash } from 'node:crypto';
import type { RateLimiter } from './v2-types.js';

const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async check({ scope, subject, limit, windowMs }) {
      const key = `${scope}:${digest(subject)}`;
      const now = Date.now();
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      }
      current.count += 1;
      return {
        allowed: current.count <= limit,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetAt - now) / 1000),
        ),
      };
    },
  };
}

type RedisLike = {
  incr: (key: string) => Promise<number>;
  pexpire: (key: string, milliseconds: number) => Promise<unknown>;
  pttl: (key: string) => Promise<number>;
};

export function createRedisRateLimiter(redis: RedisLike): RateLimiter {
  return {
    async check({ scope, subject, limit, windowMs }) {
      const key = `oj:auth:limit:${scope}:${digest(subject)}`;
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.pexpire(key, windowMs);
        const pttl = await redis.pttl(key);
        return {
          allowed: count <= limit,
          retryAfterSeconds: Math.max(1, Math.ceil(Math.max(pttl, 0) / 1000)),
        };
      } catch {
        return { allowed: false, retryAfterSeconds: 30 };
      }
    },
  };
}

type RedisScriptClient = {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    windowSeconds: string,
  ): Promise<unknown>;
};

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export class RedisGuestRateLimiter {
  constructor(
    private readonly client: RedisScriptClient,
    private readonly prefix = 'ojplatform:auth:guest:rate',
  ) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const count = Number(
      await this.client.eval(
        consumeScript,
        1,
        `${this.prefix}:${key}`,
        String(windowSeconds),
      ),
    );
    if (!Number.isInteger(count) || count < 1)
      throw new Error('Invalid Redis rate-limit response');
    return count <= limit;
  }
}
