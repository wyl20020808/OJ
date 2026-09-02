import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { LocalJudgeHostAgent } from './agent.js';

const authorized = (supplied: unknown, expected: string) => {
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Loopback/private HTTP boundary; the credential is distinct from Judge/Product tokens. */
export async function buildJudgeHostAgentServer(
  agent: LocalJudgeHostAgent,
  token: string,
  options: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
  });
  app.addHook('preHandler', async (request, reply) => {
    if (authorized(request.headers['x-judge-host-agent-token'], token)) return;
    return reply.code(401).send({ code: 'HOST_AGENT_UNAUTHORIZED' });
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/v1/templates', async () => ({
    items: await agent.listTemplates(),
  }));
  app.get('/v1/capacity', async () => agent.hostCapacity());
  app.get('/v1/owned', async () => ({ items: await agent.listOwned() }));
  app.get('/v1/operations', async () => ({
    items: await agent.operationsHistory(),
  }));
  app.post('/v1/nodes/start', async (request, reply) => {
    const body = request.body as {
      templateId?: unknown;
      nodeId?: unknown;
      expectedIncarnation?: unknown;
      activeJobs?: unknown;
    };
    if (typeof body?.templateId !== 'string' || typeof body.nodeId !== 'string')
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    try {
      return await agent.start({
        templateId: body.templateId,
        nodeId: body.nodeId,
      });
    } catch (error) {
      return reply.code(409).send({
        code: error instanceof Error ? error.message : 'PROCESS_START_FAILED',
      });
    }
  });
  app.post('/v1/nodes/stop', async (request, reply) => {
    const body = request.body as {
      nodeId?: unknown;
      expectedIncarnation?: unknown;
      activeJobs?: unknown;
    };
    if (typeof body?.nodeId !== 'string')
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    try {
      return await agent.stop({
        nodeId: body.nodeId,
        ...(typeof body.expectedIncarnation === 'string'
          ? { expectedIncarnation: body.expectedIncarnation }
          : {}),
        ...(typeof body.activeJobs === 'number'
          ? { activeJobs: body.activeJobs }
          : {}),
      });
    } catch (error) {
      return reply.code(409).send({
        code: error instanceof Error ? error.message : 'PROCESS_STOP_FAILED',
      });
    }
  });
  app.post('/v1/nodes/restart', async (request, reply) => {
    const body = request.body as {
      templateId?: unknown;
      nodeId?: unknown;
      expectedIncarnation?: unknown;
      activeJobs?: unknown;
    };
    if (typeof body?.templateId !== 'string' || typeof body.nodeId !== 'string')
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    try {
      return await agent.restart({
        templateId: body.templateId,
        nodeId: body.nodeId,
        ...(typeof body.expectedIncarnation === 'string'
          ? { expectedIncarnation: body.expectedIncarnation }
          : {}),
        ...(typeof body.activeJobs === 'number'
          ? { activeJobs: body.activeJobs }
          : {}),
      });
    } catch (error) {
      return reply.code(409).send({
        code: error instanceof Error ? error.message : 'PROCESS_START_FAILED',
      });
    }
  });
  return app;
}

export type JudgeHostAgentHttpClient = {
  listTemplates(): Promise<unknown>;
  hostCapacity(): Promise<unknown>;
  listOwned(): Promise<unknown>;
  operationsHistory(): Promise<unknown>;
  start(input: {
    templateId: string;
    nodeId: string;
  }): Promise<{ operationId: string; incarnation?: string }>;
  stop(input: {
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }): Promise<{ operationId: string }>;
  restart(input: {
    templateId: string;
    nodeId: string;
    expectedIncarnation?: string;
    activeJobs?: number;
  }): Promise<{ operationId: string; incarnation?: string }>;
};

export function createJudgeHostAgentHttpClient(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): JudgeHostAgentHttpClient {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'x-judge-host-agent-token': token,
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        body && typeof body === 'object' && 'code' in body
          ? String((body as { code: unknown }).code)
          : 'HOST_AGENT_UNAVAILABLE',
      );
    return body as T;
  }
  return {
    listTemplates: () => call<unknown>('/v1/templates'),
    hostCapacity: () => call<unknown>('/v1/capacity'),
    listOwned: () => call<unknown>('/v1/owned'),
    operationsHistory: () => call<unknown>('/v1/operations'),
    start: (input) =>
      call<{ operationId: string; incarnation?: string }>('/v1/nodes/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    stop: (input) =>
      call<{ operationId: string }>('/v1/nodes/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    restart: (input) =>
      call<{ operationId: string; incarnation?: string }>('/v1/nodes/restart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
  };
}
