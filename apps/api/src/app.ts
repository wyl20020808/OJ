import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import type { IncomingMessage } from 'node:http';
import { Type } from '@sinclair/typebox';
import { createDatabase, checkDatabase } from '@ojplatform/database';
import { createCache, checkCache } from '@ojplatform/cache';
import { createStorage, checkStorage } from '@ojplatform/storage';
import { loadConfig, type RuntimeConfig } from './config.js';

const HealthResponse = Type.Object({ status: Type.Literal('ok') });
const ReadyResponse = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('not_ready')]),
  dependencies: Type.Record(
    Type.String(),
    Type.Union([Type.Literal('ok'), Type.Literal('unavailable')]),
  ),
});
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});
export type AppOptions = {
  logger?: boolean;
  exposeTestErrorRoute?: boolean;
  withInfrastructure?: boolean;
  config?: RuntimeConfig;
};
type Owned = {
  close: () => Promise<void>;
  checks: Record<string, () => Promise<void>>;
};

const bounded = async (
  task: () => Promise<void>,
  timeoutMs = 1200,
): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('dependency timeout')),
          timeoutMs,
        );
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: (request: IncomingMessage) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' &&
        /^[A-Za-z0-9._:-]{1,96}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    },
  });
  await app.register(cors, { origin: true });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  await app.register(swagger, {
    openapi: { info: { title: 'OJPlatform API', version: '0.3.0' } },
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400
        ? error.statusCode
        : 500;
    return reply.status(statusCode).send({
      code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: statusCode === 404 ? 'Route not found' : 'Internal server error',
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: request.id,
    }),
  );

  let owned: Owned | undefined;
  if (options.withInfrastructure) {
    const config = options.config ?? loadConfig();
    const database = createDatabase({ url: config.databaseUrl });
    const cache = createCache({ url: config.redisUrl });
    const storage = createStorage({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      bucket: config.s3Bucket,
    });
    owned = {
      checks: {
        postgres: () => checkDatabase(database.pool),
        redis: async () => {
          if (cache.status !== 'ready') await cache.connect();
          return checkCache(cache);
        },
        storage: () => checkStorage(storage),
      },
      close: async () => {
        await database.pool.end();
        cache.disconnect();
        storage.client.destroy();
      },
    };
    app.addHook('onClose', async () => owned?.close());
  }
  app.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get(
    '/ready',
    { schema: { response: { 200: ReadyResponse, 503: ReadyResponse } } },
    async (_request, reply) => {
      if (!owned) return { status: 'ok' as const, dependencies: {} };
      const entries = await Promise.all(
        Object.entries(owned.checks).map(
          async ([name, check]) =>
            [name, (await bounded(check)) ? 'ok' : 'unavailable'] as const,
        ),
      );
      const dependencies = Object.fromEntries(entries);
      const ready = Object.values(dependencies).every(
        (value) => value === 'ok',
      );
      return reply.status(ready ? 200 : 503).send({
        status: ready ? ('ok' as const) : ('not_ready' as const),
        dependencies,
      });
    },
  );
  app.get('/openapi.json', async () => app.swagger());
  if (options.exposeTestErrorRoute)
    app.get(
      '/__test__/error',
      { schema: { response: { 500: ErrorResponse } } },
      async () => {
        throw new Error('intentional test failure at D:\\private\\internal.ts');
      },
    );
  return app;
}
