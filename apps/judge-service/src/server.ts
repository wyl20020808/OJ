import { createCache, checkCache } from '@ojplatform/cache';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { RedisJudgeJobRepository } from '@ojplatform/judge-runtime';
import { buildJudgeService } from './app.js';
import { loadJudgeServiceConfig } from './config.js';
import { PostgresJudgeServiceStateRepository } from './repository.js';
import { PostgresJudgeNodeRepository } from './node-repository.js';

const config = loadJudgeServiceConfig();
const database = createDatabase({ url: config.databaseUrl });
const redis = createCache({ url: config.redisUrl });
const app = await buildJudgeService({
  queue: new RedisJudgeJobRepository(redis, config.redisPrefix),
  state: new PostgresJudgeServiceStateRepository(database.pool),
  serviceToken: config.serviceToken,
  nodeToken: config.nodeToken,
  nodes: new PostgresJudgeNodeRepository(
    database.pool,
    config.nodeUnhealthyTimeoutMs,
  ),
  ready: async () => {
    if (redis.status !== 'ready') await redis.connect();
    await Promise.all([checkDatabase(database.pool), checkCache(redis)]);
    return true;
  },
});

app.addHook('onClose', async () => {
  await database.pool.end();
  redis.disconnect();
});
await app.listen({ host: config.host, port: config.port });
