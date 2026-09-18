import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildJudgeService } from '../apps/judge-service/src/app.js';
import { loadJudgeServiceConfig } from '../apps/judge-service/src/config.js';
import { InMemoryJudgeServiceStateRepository } from '../apps/judge-service/src/repository.js';
import { InMemoryJudgeNodeRepository } from '../apps/judge-service/src/node-repository.js';
import { InMemoryJudgeJobRepository } from '@ojplatform/judge-runtime';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const environment = (): NodeJS.ProcessEnv => ({
  JUDGE_DATABASE_URL: 'postgres://judge-runtime@judge-db/judge',
  JUDGE_REDIS_URL: 'redis://judge-redis:6379',
  JUDGE_SERVICE_TOKEN: 'service-token-1234',
  JUDGE_NODE_TOKEN: 'node-token-1234567',
});

describe('Judge Service container contract', () => {
  it('separates Compose-internal and host-loopback endpoints', () => {
    const compose = readFileSync('compose.yaml', 'utf8');
    const development = readFileSync('compose.dev.yaml', 'utf8');
    const production = readFileSync('compose.prod.yaml', 'utf8');
    expect(compose).toContain(
      'JUDGE_SERVICE_URL: ${JUDGE_SERVICE_INTERNAL_URL:-http://judge-service:3100}',
    );
    expect(development).toContain(
      "'127.0.0.1:${OJPLATFORM_JUDGE_SERVICE_PORT:-3100}:3100'",
    );
    expect(development).toContain(
      "'127.0.0.1:${OJPLATFORM_REDIS_PORT:-56379}:6379'",
    );
    expect(development).toContain('networks: [infrastructure, judge-host]');
    expect(production).toContain(
      "'127.0.0.1:${OJPLATFORM_JUDGE_SERVICE_PORT:-3100}:3100'",
    );
    expect(development).not.toMatch(
      /(?:0\.0\.0\.0|\[?::\]?):\$\{OJPLATFORM_JUDGE_SERVICE_PORT/,
    );
    expect(production).not.toMatch(
      /(?:0\.0\.0\.0|\[?::\]?):\$\{OJPLATFORM_JUDGE_SERVICE_PORT/,
    );
  });

  it('uses only Judge database configuration', () => {
    const config = loadJudgeServiceConfig({
      ...environment(),
      DATABASE_URL: 'postgres://product-runtime@product-db/product',
    });
    expect(config.databaseUrl).toBe('postgres://judge-runtime@judge-db/judge');
    expect(config).not.toHaveProperty('productDatabaseUrl');
  });

  it('reads runtime secrets from files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'oj-judge-config-'));
    directories.push(directory);
    const values = {
      JUDGE_DATABASE_URL: 'postgres://judge-runtime@judge-db/judge',
      JUDGE_REDIS_URL: 'redis://judge-redis:6379',
      JUDGE_SERVICE_TOKEN: 'service-token-1234',
      JUDGE_NODE_TOKEN: 'node-token-1234567',
    };
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(values)) {
      const path = join(directory, name.toLowerCase());
      writeFileSync(path, `${value}\n`, { mode: 0o600 });
      env[`${name}_FILE`] = path;
    }
    expect(loadJudgeServiceConfig(env)).toMatchObject({
      databaseUrl: values.JUDGE_DATABASE_URL,
      redisUrl: values.JUDGE_REDIS_URL,
      serviceToken: values.JUDGE_SERVICE_TOKEN,
      nodeToken: values.JUDGE_NODE_TOKEN,
    });
  });

  it('rejects ambiguous direct and file secret sources', () => {
    const directory = mkdtempSync(join(tmpdir(), 'oj-judge-config-'));
    directories.push(directory);
    const path = join(directory, 'service-token');
    writeFileSync(path, 'different-service-token');
    expect(() =>
      loadJudgeServiceConfig({
        ...environment(),
        JUDGE_SERVICE_TOKEN_FILE: path,
      }),
    ).toThrow(
      'JUDGE_SERVICE_TOKEN and JUDGE_SERVICE_TOKEN_FILE must not both be set',
    );
  });

  it('reports dependency-specific readiness without affecting liveness', async () => {
    const app = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-token-1234',
      ready: async () => ({ judgeDatabase: true, redis: false }),
      logger: false,
    });
    expect((await app.inject('/health')).statusCode).toBe(200);
    const ready = await app.inject('/ready');
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      status: 'not_ready',
      dependencies: { judgeDatabase: 'ok', redis: 'unavailable' },
    });
    await app.close();
  });

  it('reports durable execution readiness separately from dependency readiness', async () => {
    const nodes = new InMemoryJudgeNodeRepository();
    const app = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-token-1234',
      nodes,
      ready: async () => ({ judgeDatabase: true, redis: true }),
      logger: false,
    });
    const headers = { 'x-judge-service-token': 'service-token-1234' };
    const online = await app.inject({
      url: '/v1/execution-readiness',
      headers,
    });
    expect(online.statusCode).toBe(503);
    expect(online.json()).toMatchObject({
      state: 'ONLINE',
      reason: 'NO_EXECUTION_NODE_REGISTERED',
      availableSlots: 0,
    });
    await nodes.register({
      nodeId: 'node-1',
      incarnation: 'incarnation-1',
      runtimeVersion: 'v1',
      maxConcurrentJobs: 2,
      capabilities: {
        languageProfiles: ['cpp20-gcc-13-v1'],
        checkers: ['EXACT_BYTES'],
        executionModes: ['REAL_SANDBOXED_EXECUTION'],
        sandboxContractVersion: '2C.3',
        architecture: 'amd64',
        resourceClass: 'standard-v1',
      },
    });
    const executionReady = await app.inject({
      url: '/v1/execution-readiness',
      headers,
    });
    expect(executionReady.statusCode).toBe(200);
    expect(executionReady.json()).toMatchObject({
      state: 'EXECUTION_READY',
      reason: 'QUALIFIED_CAPACITY_AVAILABLE',
      schedulableNodes: 1,
      availableSlots: 2,
    });
    await app.close();
  });

  it('fails execution readiness closed with unavailable dependencies', async () => {
    const app = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-token-1234',
      nodes: new InMemoryJudgeNodeRepository(),
      ready: async () => ({ judgeDatabase: true, redis: false }),
      logger: false,
    });
    const response = await app.inject({
      url: '/v1/execution-readiness',
      headers: { 'x-judge-service-token': 'service-token-1234' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      state: 'UNAVAILABLE',
      reason: 'CONTROL_PLANE_UNAVAILABLE',
      availableSlots: 0,
    });
    await app.close();
  });

  it('fails readiness closed when a dependency check throws', async () => {
    const app = await buildJudgeService({
      queue: new InMemoryJudgeJobRepository(),
      state: new InMemoryJudgeServiceStateRepository(),
      serviceToken: 'service-token-1234',
      ready: async () => {
        throw new Error('dependency unavailable');
      },
      logger: false,
    });
    const ready = await app.inject('/ready');
    expect(ready.statusCode).toBe(503);
    expect(ready.json().dependencies).toEqual({
      judgeDatabase: 'unavailable',
      redis: 'unavailable',
    });
    await app.close();
  });
});
