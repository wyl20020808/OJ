import { Redis } from 'ioredis';

export type CacheConfig = { url: string; connectTimeoutMs?: number };

export function createCache(config: CacheConfig) {
  const client = new Redis(config.url, {
    connectTimeout: config.connectTimeoutMs ?? 1500,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  return client;
}

export async function checkCache(client: Redis): Promise<void> {
  if ((await client.ping()) !== 'PONG') throw new Error('Redis ping failed');
}
