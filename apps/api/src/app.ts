import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { IncomingMessage } from 'node:http';
import swagger from '@fastify/swagger';
import { Type } from '@sinclair/typebox';

const HealthResponse = Type.Object({ status: Type.Literal('ok') });
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});

export type AppOptions = { logger?: boolean; exposeTestErrorRoute?: boolean };

const requestId = (request: IncomingMessage): string => {
  const incoming = request.headers['x-request-id'];
  return typeof incoming === 'string' &&
    /^[A-Za-z0-9._:-]{1,96}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
};

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: requestId,
  });
  await app.register(cors, { origin: true });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'OJPlatform API', version: '0.2.0' },
    },
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

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: request.id,
    });
  });

  app.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get(
    '/ready',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get('/openapi.json', async () => app.swagger());

  if (options.exposeTestErrorRoute) {
    app.get(
      '/__test__/error',
      { schema: { response: { 500: ErrorResponse } } },
      async () => {
        throw new Error('intentional test failure at D:\\private\\internal.ts');
      },
    );
  }

  return app;
}
