import { createCache, checkCache } from '@ojplatform/cache';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import {
  JUDGE_PROGRESS_EVENTS_CHANNEL,
  RedisJudgeJobRepository,
} from '@ojplatform/judge-runtime';
import { buildJudgeService } from './app.js';
import { loadJudgeServiceConfig } from './config.js';
import { PostgresJudgeServiceStateRepository } from './repository.js';
import { PostgresJudgeNodeRepository } from './node-repository.js';
import { createJudgeHostAgentHttpClient } from '@ojplatform/judge-host-agent';

const config = loadJudgeServiceConfig();
const database = createDatabase({ url: config.databaseUrl });
const redis = createCache({ url: config.redisUrl });
const queue = new RedisJudgeJobRepository(redis, config.redisPrefix);
const app = await buildJudgeService({
  queue,
  state: new PostgresJudgeServiceStateRepository(database.pool),
  serviceToken: config.serviceToken,
  nodeToken: config.nodeToken,
  progressEvents: async (event) => {
    try {
      await redis.publish(JUDGE_PROGRESS_EVENTS_CHANNEL, JSON.stringify(event));
    } catch {
      // Redis is best-effort transport; queue durability remains authoritative.
    }
  },
  nodes: new PostgresJudgeNodeRepository(
    database.pool,
    config.nodeUnhealthyTimeoutMs,
  ),
  ...(process.env.JUDGE_HOST_AGENT_URL && process.env.JUDGE_HOST_AGENT_TOKEN
    ? {
        hostAgent: createJudgeHostAgentHttpClient(
          process.env.JUDGE_HOST_AGENT_URL,
          process.env.JUDGE_HOST_AGENT_TOKEN,
        ),
      }
    : {}),
  ready: async () => {
    const [judgeDatabase, redisDependency] = await Promise.allSettled([
      checkDatabase(database.pool),
      (async () => {
        if (redis.status === 'wait' || redis.status === 'end')
          await redis.connect();
        await checkCache(redis);
      })(),
    ]);
    return {
      judgeDatabase: judgeDatabase.status === 'fulfilled',
      redis: redisDependency.status === 'fulfilled',
    };
  },
  autoscalerIntervalMs: Number(
    process.env.JUDGE_AUTOSCALER_INTERVAL_MS ?? 5000,
  ),
  autoscalerMetrics: () => queue.autoscalerMetrics(),
});

app.addHook('onClose', async () => {
  await database.pool.end();
  redis.disconnect();
});
await app.listen({ host: config.host, port: config.port });
