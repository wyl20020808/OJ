import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  JudgeAdminAdapterClient,
  JudgeAdminUpstreamError,
  MemoryJudgeAdminAuditRepository,
  registerJudgeAdminRoutes,
} from '../apps/api/src/modules/judge-admin/index.js';

const ctx = {
  userId: 'admin-1',
  sessionId: 'session-1',
  strength: 'password' as const,
};
const node = {
  nodeId: 'judge-a',
  desiredState: 'ONLINE',
  observedState: 'ONLINE',
  incarnation: 'inc-1',
  controlVersion: 2,
};

describe('judge admin adapter and product boundary', () => {
  it('sends only server credential and strips sensitive response fields', async () => {
    let seen: RequestInit | undefined;
    const client = new JudgeAdminAdapterClient(
      'http://judge',
      'service-secret',
      1000,
      async (_url, init) => {
        seen = init;
        return new Response(
          JSON.stringify({ node, leaseToken: 'hidden', source: 'hidden' }),
          { status: 200 },
        );
      },
    );
    const result = await client.node('judge-a');
    expect(result).toEqual({ node });
    expect(
      (seen?.headers as Record<string, string>)['x-judge-service-token'],
    ).toBe('service-secret');
  });

  it('maps upstream timeout and status errors without leaking details', async () => {
    const timeout = new JudgeAdminAdapterClient(
      'http://judge',
      'secret',
      1,
      async () => {
        throw new DOMException('late', 'AbortError');
      },
    );
    await expect(timeout.summary()).rejects.toMatchObject({ status: 504 });
    const missing = new JudgeAdminAdapterClient(
      'http://judge',
      'secret',
      1000,
      async () =>
        new Response(JSON.stringify({ code: 'db stack' }), { status: 404 }),
    );
    await expect(missing.node('x')).rejects.toBeInstanceOf(
      JudgeAdminUpstreamError,
    );
  });

  it('enforces RBAC, CSRF, idempotency and durable audit calls', async () => {
    const app = Fastify();
    const audit = new MemoryJudgeAdminAuditRepository();
    let calls = 0;
    const adapter = {
      summary: async () => ({ totalNodes: 1 }),
      nodes: async () => ({ items: [node] }),
      node: async () => node,
      assignments: async () => ({ items: [] }),
      jobs: async () => ({ items: [] }),
      failures: async () => ({ items: [] }),
      assignment: async () => ({}),
      metrics: async () => ({}),
      mutate: async () => {
        calls++;
        return { operationId: 'op-1', node };
      },
    };
    await registerJudgeAdminRoutes(app, {
      adapter,
      audit,
      getAuthContext: async () => ctx,
      can: async (_ctx, permission) =>
        permission === 'judge.manage' || permission === 'judge.view',
      csrf: (request) =>
        request.headers['x-csrf-token'] === 'csrf' &&
        request.headers.cookie === 'oj_csrf=csrf',
    });
    const capabilities = await app.inject({
      method: 'GET',
      url: '/api/admin/judge/capabilities',
    });
    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json()).toEqual({ canView: true, canManage: true });
    const denied = await app.inject({
      method: 'POST',
      url: '/api/admin/judge/nodes/judge-a/drain',
      payload: {
        reason: 'maintenance',
        expectedIncarnation: 'inc-1',
        expectedControlVersion: 2,
        idempotencyKey: 'k',
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(audit.events.at(-1)?.errorCode).toBe('CSRF_REQUIRED');
    const body = {
      reason: 'maintenance',
      expectedIncarnation: 'inc-1',
      expectedControlVersion: 2,
      idempotencyKey: 'k',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/admin/judge/nodes/judge-a/drain',
      headers: { 'x-csrf-token': 'csrf', cookie: 'oj_csrf=csrf' },
      payload: body,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/admin/judge/nodes/judge-a/drain',
      headers: { 'x-csrf-token': 'csrf', cookie: 'oj_csrf=csrf' },
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(calls).toBe(1);
    expect(
      audit.events.filter((event) => event.outcome === 'success'),
    ).toHaveLength(2);
    await app.close();
  });

  it('keeps view-only Judge access distinct from mutation permission', async () => {
    const app = Fastify();
    let authenticated = true;
    await registerJudgeAdminRoutes(app, {
      adapter: {
        summary: async () => ({ totalNodes: 0 }),
        nodes: async () => ({ items: [] }),
        node: async () => node,
        assignments: async () => ({ items: [] }),
        jobs: async () => ({ items: [] }),
        failures: async () => ({ items: [] }),
        assignment: async () => ({}),
        metrics: async () => ({}),
        mutate: async () => ({ operationId: 'unexpected', node }),
      },
      audit: new MemoryJudgeAdminAuditRepository(),
      getAuthContext: async () => (authenticated ? ctx : undefined),
      can: async (context, permission) =>
        Boolean(context) && permission === 'judge.view',
    });

    const capabilities = await app.inject({
      method: 'GET',
      url: '/api/admin/judge/capabilities',
    });
    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json()).toEqual({ canView: true, canManage: false });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/judge/summary',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/judge/nodes/judge-a/drain',
          payload: {
            reason: 'maintenance',
            expectedIncarnation: 'inc-1',
            expectedControlVersion: 2,
            idempotencyKey: 'read-only-user',
          },
        })
      ).statusCode,
    ).toBe(403);

    authenticated = false;
    const unauthenticatedCapabilities = await app.inject({
      method: 'GET',
      url: '/api/admin/judge/capabilities',
    });
    expect(unauthenticatedCapabilities.statusCode).toBe(200);
    expect(unauthenticatedCapabilities.json()).toEqual({
      canView: false,
      canManage: false,
    });
    await app.close();
  });

  it('normalizes Judge summary and wraps Product mutation metadata', async () => {
    const app = Fastify();
    await registerJudgeAdminRoutes(app, {
      adapter: {
        summary: async () => ({
          totalNodes: 2,
          countsByState: { ONLINE: 1, DRAINING: 1 },
          activeJobs: 1,
          totalCapacity: 4,
          schedulableCapacity: 2,
          staleNodeCount: 0,
          generatedAt: '2026-09-02T10:00:00.000Z',
        }),
        nodes: async () => ({ items: [] }),
        node: async () => node,
        assignments: async () => ({ items: [] }),
        jobs: async () => ({ items: [] }),
        failures: async () => ({ items: [] }),
        assignment: async () => ({}),
        metrics: async () => ({}),
        mutate: async () => node,
      },
      getAuthContext: async () => ctx,
      can: async () => true,
      audit: new MemoryJudgeAdminAuditRepository(),
      csrf: () => true,
    });
    const summary = await app.inject({
      method: 'GET',
      url: '/api/admin/judge/summary',
    });
    expect(summary.json()).toMatchObject({
      onlineCount: 1,
      busyCount: 0,
      drainingCount: 1,
      offlineCount: 0,
      unhealthyCount: 0,
    });
    const mutation = await app.inject({
      method: 'POST',
      url: '/api/admin/judge/nodes/judge-a/enable',
      payload: {
        reason: 'maintenance complete',
        expectedIncarnation: 'inc-1',
        expectedControlVersion: 2,
        idempotencyKey: 'normalize-1',
      },
    });
    expect(mutation.json()).toMatchObject({
      correlationId: expect.any(String),
      operationId: expect.any(String),
      node,
    });
    await app.close();
  });

  it('accepts a pool mode change with its control-version guard', async () => {
    const app = Fastify();
    let input: unknown;
    await registerJudgeAdminRoutes(app, {
      adapter: {
        summary: async () => ({}),
        nodes: async () => ({ items: [] }),
        node: async () => node,
        assignments: async () => ({ items: [] }),
        jobs: async () => ({ items: [] }),
        failures: async () => ({ items: [] }),
        assignment: async () => ({}),
        metrics: async () => ({}),
        mutate: async () => node,
        setMode: async (value) => {
          input = value;
          return { mode: value.mode, controlVersion: 3 };
        },
      },
      getAuthContext: async () => ctx,
      can: async (_ctx, permission) => permission === 'judge.lifecycle',
      audit: new MemoryJudgeAdminAuditRepository(),
      csrf: () => true,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/judge/pool/mode',
      payload: {
        mode: 'MANUAL',
        reason: 'browser control',
        expectedControlVersion: 2,
        idempotencyKey: 'mode-1',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(input).toMatchObject({ mode: 'MANUAL' });
    await app.close();
  });
});
