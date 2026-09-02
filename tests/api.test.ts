import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';

describe('API platform contract', () => {
  it('serves health, readiness, request IDs, and controlled errors', async () => {
    const app = await buildApp({ logger: false, exposeTestErrorRoute: true });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(health.headers['x-request-id']).toBeTruthy();
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    const missing = await app.inject({ method: 'GET', url: '/missing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      code: 'NOT_FOUND',
      requestId: expect.any(String),
    });
    await app.close();
  });

  it('bounds incoming request IDs and hides internal errors', async () => {
    const app = await buildApp({ logger: false, exposeTestErrorRoute: true });
    const response = await app.inject({
      method: 'GET',
      url: '/__test__/error',
      headers: { 'x-request-id': `${'x'.repeat(200)}\nforged` },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain('internal.ts');
    await app.close();
  });

  it('publishes required OpenAPI paths', async () => {
    const app = await buildApp({ logger: false });
    await app.ready();
    const spec = app.swagger();
    expect(spec.paths).toHaveProperty('/health');
    expect(spec.paths).toHaveProperty('/ready');
    const document = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(document.statusCode).toBe(200);
    expect(document.json().paths).toHaveProperty('/health');
    await app.close();
  });

  it('allows credentialed CORS only for configured origins', async () => {
    const app = await buildApp({
      logger: false,
      config: loadConfig({
        OJPLATFORM_CORS_ORIGINS: 'http://127.0.0.1:5177',
      }),
    });
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin,
          'access-control-request-method': 'GET',
        },
      });
    const trusted = await preflight('http://127.0.0.1:5177');
    expect(trusted.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5177',
    );
    expect(trusted.headers['access-control-allow-credentials']).toBe('true');

    const untrusted = await preflight('https://untrusted.example.test');
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
    expect((await app.inject('/health')).statusCode).toBe(200);
    await app.close();
  });
});
