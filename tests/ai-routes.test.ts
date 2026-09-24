import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { CapabilityBroker } from '@ojplatform/capability-broker';
import { buildApp } from '../apps/api/src/app.js';
import { registerAiRoutes } from '../apps/api/src/modules/ai/routes.js';
import { registerDefaultSiteAiCallers } from '../apps/api/src/modules/ai/index.js';
import { createSubjectTokenMinter } from '@ojplatform/capability-broker';

/**
 * Stage 6 AI diagnostics route: operator gating and response shape, plus the buildApp-level
 * guarantee that a deployment without any AI configuration or artifacts boots and serves.
 */

function makeRouteApp(
  auth: { userId: string } | undefined,
  operators: ReadonlySet<string>,
) {
  const app = Fastify({ logger: false });
  const broker = new CapabilityBroker();
  registerDefaultSiteAiCallers(broker);
  registerAiRoutes(app, {
    aiModule: {
      broker,
      subjectTokens: createSubjectTokenMinter({ secret: 'route-test-secret' }),
      status: () => ({ kind: 'NO_CONFIG' }),
      siteClient: () => null,
      reload: () => Promise.resolve(false),
      close: () => undefined,
    },
    getAuthContext: () => Promise.resolve(auth),
    operatorUserIds: operators,
  });
  return app;
}

describe('GET /api/ai/capabilities (operator diagnostics)', () => {
  it('requires authentication', async () => {
    const app = makeRouteApp(undefined, new Set(['op-1']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/ai/capabilities',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHENTICATED');
    await app.close();
  });

  it('forbids non-operator users', async () => {
    const app = makeRouteApp({ userId: 'user-9' }, new Set(['op-1']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/ai/capabilities',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FORBIDDEN');
    await app.close();
  });

  it('serves operators the module state and broker picture', async () => {
    const app = makeRouteApp({ userId: 'op-1' }, new Set(['op-1']));
    const response = await app.inject({
      method: 'GET',
      url: '/api/ai/capabilities',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.module).toEqual({ kind: 'NO_CONFIG' });
    expect(body.subjectTokens.stability).toBe('STABLE');
    expect(body.broker.killSwitch.global).toBe(false);
    expect(Array.isArray(body.broker.providers)).toBe(true);
    expect(Array.isArray(body.broker.capabilities)).toBe(true);
    await app.close();
  });

  it('exposes no mutating AI route at all', async () => {
    const app = makeRouteApp({ userId: 'op-1' }, new Set(['op-1']));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/ai/capabilities',
      });
      expect(response.statusCode).toBe(404);
    }
    const generate = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
    });
    expect(generate.statusCode).toBe(404);
    await app.close();
  });
});

describe('buildApp without AI configuration (fresh install posture)', () => {
  it('boots, serves health, and gates AI diagnostics behind authentication', async () => {
    const app = await buildApp({ logger: false });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const ai = await app.inject({ method: 'GET', url: '/api/ai/capabilities' });
    // No session → 401; the route exists but is never public.
    expect(ai.statusCode).toBe(401);
    await app.close();
  });
});
