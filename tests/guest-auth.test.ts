import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  createMemoryAuthRepository,
  createMemoryGuestAuthStore,
  registerAuthModule,
} from '../apps/api/src/modules/auth/index.js';

const cookiesFrom = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(String).map((item) => item.split(';', 1)[0] ?? '');
};

const cookieHeader = (cookies: string[]) => cookies.join('; ');

async function makeApp(
  limiter: {
    consume: (
      key: string,
      limit: number,
      windowSeconds: number,
    ) => Promise<boolean>;
  } = { consume: async () => true },
) {
  const server = Fastify({ logger: false });
  const repository = createMemoryAuthRepository();
  const store = createMemoryGuestAuthStore(repository);
  await registerAuthModule(server, {
    repository,
    guestStore: store,
    guestRateLimiter: limiter,
    guestResumeTtlMs: 60_000,
  });
  return server;
}

describe('guest auth contract', () => {
  it('creates a real guest, resumes the same identity, and rotates the credential', async () => {
    const server = await makeApp();
    const first = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { 'x-forwarded-for': '198.51.100.10' },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ guest: true, resumed: false });
    expect(first.json().email).toBeNull();
    const firstCookies = cookiesFrom(first);
    expect(firstCookies.some((v) => v.startsWith('oj_session='))).toBe(true);
    const resumeCookie = firstCookies.find((v) =>
      v.startsWith('oj_guest_resume='),
    )!;
    expect(String(first.headers['set-cookie'])).toContain('HttpOnly');

    const second = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: cookieHeader([resumeCookie]) },
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      id: first.json().id,
      guest: true,
      resumed: true,
    });
    const rotated = cookiesFrom(second).find((v) =>
      v.startsWith('oj_guest_resume='),
    )!;
    expect(rotated).not.toBe(resumeCookie);

    const oldToken = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: cookieHeader([resumeCookie]) },
      payload: {},
    });
    expect(oldToken.statusCode).toBe(401);
    expect(oldToken.json().code).toBe('INVALID_GUEST_RESUME');
    await server.close();
  });

  it('keeps resume valid across normal logout and supports explicit revoke', async () => {
    const server = await makeApp();
    const first = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      payload: {},
    });
    const firstCookies = cookiesFrom(first);
    const session = firstCookies.find((v) => v.startsWith('oj_session='))!;
    const resume = firstCookies.find((v) => v.startsWith('oj_guest_resume='))!;
    const logout = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieHeader([session, resume]) },
      payload: {},
    });
    expect(logout.statusCode).toBe(204);
    const continued = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: resume },
      payload: {},
    });
    expect(continued.statusCode).toBe(200);
    const rotated = cookiesFrom(continued).find((v) =>
      v.startsWith('oj_guest_resume='),
    )!;
    const revoke = await server.inject({
      method: 'DELETE',
      url: '/api/auth/guest/resume',
      headers: { cookie: rotated },
    });
    expect(revoke.statusCode).toBe(204);
    const invalid = await server.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: rotated },
      payload: {},
    });
    expect(invalid.statusCode).toBe(401);
    await server.close();
  });

  it('fails closed when the limiter is unavailable or denies the request', async () => {
    const denied = await makeApp({ consume: async () => false });
    const response = await denied.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      payload: {},
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe('RATE_LIMITED');
    await denied.close();

    const unavailable = await makeApp({
      consume: async () => Promise.reject(new Error('redis unavailable')),
    });
    const failed = await unavailable.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      payload: {},
    });
    expect(failed.statusCode).toBe(429);
    await unavailable.close();
  });
});
