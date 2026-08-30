import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';

describe('integrated Sandbox control plane', () => {
  it('fails closed for anonymous and ordinary users without exposing runtime data', async () => {
    const operatorIds = new Set(['operator-id']);
    const app = await buildApp({ logger: false, operatorUserIds: operatorIds });
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/operations/sandbox',
    });
    expect(anonymous.statusCode).toBe(401);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'ordinary',
        email: 'ordinary@example.test',
        displayName: 'Ordinary',
        password: 'password-123',
      },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'ordinary', password: 'password-123' },
    });
    const cookie = login.headers['set-cookie'];
    expect(registration.statusCode).toBe(201);
    expect(login.statusCode).toBe(200);
    const ordinary = await app.inject({
      method: 'GET',
      url: '/api/operations/sandbox',
      headers: { cookie },
    });
    expect(ordinary.statusCode).toBe(403);
    expect(ordinary.body).not.toMatch(/runc|cgroup|token|secret|source/i);
    await app.close();
  });

  it('projects configured state only to the operator and rejects unknown probes', async () => {
    const operatorIds = new Set(['operator-id']);
    const app = await buildApp({ logger: false, operatorUserIds: operatorIds });
    const user = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'operator',
        email: 'operator@example.test',
        displayName: 'Operator',
        password: 'password-123',
      },
    });
    operatorIds.add((user.json() as { id: string }).id);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'operator', password: 'password-123' },
    });
    const cookie = login.headers['set-cookie'];
    const overview = await app.inject({
      method: 'GET',
      url: '/api/operations/sandbox',
      headers: { cookie },
    });
    const probes = await app.inject({
      method: 'GET',
      url: '/api/operations/sandbox/probes',
      headers: { cookie },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/operations/sandbox/probes/not-a-probe',
      headers: { cookie },
    });
    expect(user.statusCode).toBe(201);
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      realSubmissionExecution: 'DISABLED',
      qualificationState: 'DEGRADED',
    });
    expect(probes.statusCode).toBe(200);
    expect(probes.json()).toEqual({ items: [] });
    expect(unknown.statusCode).toBe(403);
    await app.close();
  });
});
