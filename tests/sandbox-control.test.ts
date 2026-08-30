import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';

const probeHash = 'a'.repeat(64);

async function protocolFixture() {
  let activeProbe: string | undefined;
  let cancelled = false;
  let cleanupFault = false;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const send = (status: number, value: unknown) => {
      response.statusCode = status;
      response.end(JSON.stringify(value));
    };
    if (request.method === 'GET' && request.url === '/v1/health') {
      send(200, { status: 'ok' });
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/probes') {
      send(200, {
        items: [
          {
            probe_id: 'SANDBOX_PROBE_QUALIFICATION',
            version: '1',
            sha256: probeHash,
            purpose: 'fixed qualification',
            timeout_ms: 15000,
          },
          {
            probe_id: 'SANDBOX_PROBE_CANCELLATION',
            version: '1',
            sha256: probeHash,
            purpose: 'fixed cancellation',
            timeout_ms: 15000,
          },
          {
            probe_id: 'SANDBOX_PROBE_CLEANUP_FAILURE',
            version: '1',
            sha256: probeHash,
            purpose: 'fixed cleanup fault',
            timeout_ms: 5000,
          },
        ],
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/probes/start') {
      let body = '';
      for await (const part of request) body += String(part);
      const input = JSON.parse(body) as {
        probe_id: string;
        version: string;
        hash: string;
      };
      if (input.version !== '1' || input.hash !== probeHash) {
        send(400, { code: 'INVALID_PROBE' });
        return;
      }
      activeProbe = input.probe_id;
      cancelled = false;
      send(202, { status: 'PROBE_ACTIVE' });
      return;
    }
    if (
      request.method === 'GET' &&
      request.url?.startsWith('/v1/probes/status')
    ) {
      if (activeProbe === 'SANDBOX_PROBE_CLEANUP_FAILURE') {
        cleanupFault = true;
        send(200, {
          trusted_probe_id: activeProbe,
          outcome: 'SANDBOX_CLEANUP_FAILURE',
          clean: false,
          qualification_pass: false,
          qualifies_sandbox: false,
          qualification_kind: 'CLEANUP_FAILURE',
          completed_at: new Date().toISOString(),
        });
        return;
      }
      if (activeProbe === 'SANDBOX_PROBE_CANCELLATION' && !cancelled) {
        send(200, {
          trusted_probe_id: activeProbe,
          outcome: 'SANDBOX_PROBE_RUNNING',
          clean: false,
        });
        return;
      }
      if (activeProbe === 'SANDBOX_PROBE_QUALIFICATION') {
        send(200, {
          trusted_probe_id: activeProbe,
          outcome: 'SANDBOX_PROBE_SUCCEEDED',
          clean: true,
          qualification_pass: true,
          qualifies_sandbox: true,
          qualification_kind: 'FULL_ISOLATION',
          completed_at: new Date().toISOString(),
        });
        return;
      }
      send(200, {
        trusted_probe_id: activeProbe,
        outcome: 'SANDBOX_CANCELLED',
        clean: true,
        qualification_pass: true,
        qualifies_sandbox: false,
        qualification_kind: 'CANCELLATION',
        completed_at: new Date().toISOString(),
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/probes/cancel') {
      cancelled = true;
      send(200, { status: 'CLEANUP_PENDING' });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/cleanup/verify') {
      send(200, {
        status: cleanupFault ? 'FAILED' : 'VERIFIED',
        clean: !cleanupFault,
        failure_category: cleanupFault ? 'QUALIFICATION_CLEANUP_FAILURE' : '',
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/cleanup/recover') {
      cleanupFault = false;
      activeProbe = undefined;
      send(200, { status: 'VERIFIED', clean: true });
      return;
    }
    send(404, { code: 'NOT_FOUND' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const listen = () =>
    new Promise<void>((resolve) =>
      server.listen(address.port, '127.0.0.1', resolve),
    );
  const close = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    url: `http://127.0.0.1:${address.port}`,
    close,
    restart: listen,
  };
}

async function operatorSession(app: Awaited<ReturnType<typeof buildApp>>) {
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
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { identity: 'operator', password: 'password-123' },
  });
  return {
    userId: (user.json() as { id: string }).id,
    cookie: login.headers['set-cookie'],
  };
}

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

  it('prevents cleanup false success, recovers to pending, and preserves cancellation truth', async () => {
    const fixture = await protocolFixture();
    const previous = process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL;
    process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL = fixture.url;
    const operatorIds = new Set<string>();
    const app = await buildApp({ logger: false, operatorUserIds: operatorIds });
    try {
      const operator = await operatorSession(app);
      operatorIds.add(operator.userId);
      const headers = { cookie: operator.cookie };
      const cleanupStart = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_CLEANUP_FAILURE',
        headers,
      });
      expect(cleanupStart.statusCode).toBe(202);
      const cleanupStatus = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_CLEANUP_FAILURE',
        headers,
      });
      expect(cleanupStatus.json()).toMatchObject({
        state: 'FAILED',
        qualificationStatus: 'FAIL',
        cleanupStatus: 'FAILED',
        lastProbePass: false,
      });
      const overview = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox',
        headers,
      });
      expect(overview.json()).toMatchObject({
        qualificationState: 'CLEANUP_FAILED',
        cleanupStatus: 'FAILED',
      });
      const verify = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/cleanup/verify',
        headers,
      });
      expect(verify.json()).toMatchObject({
        qualificationStatus: 'FAIL',
        cleanupStatus: 'FAILED',
      });
      const recover = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/cleanup/recover',
        headers,
      });
      expect(recover.json()).toMatchObject({
        state: 'READY',
        qualificationStatus: 'PENDING',
        cleanupStatus: 'VERIFIED',
      });
      const cancellationStart = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_CANCELLATION',
        headers,
      });
      expect(cancellationStart.statusCode).toBe(202);
      const cancel = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_CANCELLATION/cancel',
        headers,
      });
      expect(cancel.statusCode).toBe(200);
      const cancelled = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_CANCELLATION',
        headers,
      });
      expect(cancelled.json()).toMatchObject({
        state: 'READY',
        qualificationStatus: 'PENDING',
        cleanupStatus: 'VERIFIED',
        lastProbePass: true,
        lastProbeKind: 'CANCELLATION',
      });
    } finally {
      await app.close();
      await fixture.close();
      if (previous === undefined)
        delete process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL;
      else process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL = previous;
    }
  });

  it('degrades after idle Supervisor loss and reconnects without restoring qualification', async () => {
    const fixture = await protocolFixture();
    const previous = process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL;
    process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL = fixture.url;
    const operatorIds = new Set<string>();
    const app = await buildApp({ logger: false, operatorUserIds: operatorIds });
    let fixtureListening = true;
    try {
      const operator = await operatorSession(app);
      operatorIds.add(operator.userId);
      const headers = { cookie: operator.cookie };
      const start = await app.inject({
        method: 'POST',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_QUALIFICATION',
        headers,
      });
      expect(start.statusCode).toBe(202);
      const qualified = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox/probes/SANDBOX_PROBE_QUALIFICATION',
        headers,
      });
      expect(qualified.json()).toMatchObject({
        backendStatus: 'QUALIFIED',
        qualificationStatus: 'PASS',
      });

      await fixture.close();
      fixtureListening = false;
      const unavailable = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox',
        headers,
      });
      expect(unavailable.json()).toMatchObject({
        qualificationState: 'DEGRADED',
        failureCategory: 'SUPERVISOR_UNAVAILABLE',
      });
      const unavailableCapability = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox/capabilities',
        headers,
      });
      expect(unavailableCapability.json()).toMatchObject({
        backendStatus: 'DEGRADED',
        qualificationStatus: 'PENDING',
      });

      await fixture.restart();
      fixtureListening = true;
      const reconnected = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox',
        headers,
      });
      expect(reconnected.json()).toMatchObject({
        qualificationState: 'QUALIFICATION_PENDING',
        cleanupStatus: 'NOT_REQUIRED',
      });
      const reconnectedCapability = await app.inject({
        method: 'GET',
        url: '/api/operations/sandbox/capabilities',
        headers,
      });
      expect(reconnectedCapability.json()).toMatchObject({
        backendStatus: 'IMPLEMENTED',
        qualificationStatus: 'PENDING',
      });
    } finally {
      await app.close();
      if (fixtureListening) await fixture.close();
      if (previous === undefined)
        delete process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL;
      else process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL = previous;
    }
  });
});
