import { createCache, checkCache } from '@ojplatform/cache';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { RedisJudgeJobRepository } from '@ojplatform/judge-runtime';
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
    if (redis.status !== 'ready') await redis.connect();
    await Promise.all([checkDatabase(database.pool), checkCache(redis)]);
    return true;
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
