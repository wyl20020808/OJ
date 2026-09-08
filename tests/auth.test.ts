import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  createMemoryAuthRepository,
  registerAuthModule,
} from '../apps/api/src/modules/auth/index.js';

async function app() {
  const server = Fastify({ logger: false });
  await registerAuthModule(server, {
    repository: createMemoryAuthRepository(),
  });
  return server;
}

describe('auth foundation', () => {
  it('uses session cookies by default and finite persistent cookies only when remembered', async () => {
    const repository = createMemoryAuthRepository();
    const server = Fastify({ logger: false });
    await registerAuthModule(server, {
      repository,
      sessionTtlMs: 1_000,
      rememberedSessionTtlMs: 10_000,
    });
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'remember-user',
        email: 'remember@example.com',
        displayName: 'Remember User',
        password: 'correct-password',
      },
    });
    const normal = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'remember-user', password: 'correct-password' },
    });
    expect(String(normal.headers['set-cookie']).split(',')[0]).not.toContain(
      'Max-Age=',
    );
    const remembered = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identity: 'remember-user',
        password: 'correct-password',
        rememberMe: true,
      },
    });
    expect(String(remembered.headers['set-cookie']).split(',')[0]).toContain(
      'Max-Age=10',
    );
    const sessions = await repository.listSessions(
      (await repository.findByIdentity('remember-user'))!.id,
    );
    expect(new Date(sessions[1]!.expiresAt).getTime()).toBeGreaterThan(
      new Date(sessions[0]!.expiresAt).getTime(),
    );
    const rememberedCookie = String(remembered.headers['set-cookie'])
      .split(',')[0]!
      .split(';')[0]!;
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: rememberedCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie: rememberedCookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await server.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: rememberedCookie },
        })
      ).statusCode,
    ).toBe(401);
    const malformed = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identity: 'remember-user',
        password: 'correct-password',
        rememberMe: 'true',
      },
    });
    expect(malformed.statusCode).toBe(400);
    const v2Remembered = await server.inject({
      method: 'POST',
      url: '/api/auth/login/password',
      payload: {
        identifierType: 'EMAIL',
        identifier: 'remember@example.com',
        password: 'correct-password',
        rememberMe: true,
      },
    });
    expect(v2Remembered.statusCode).toBe(200);
    expect(String(v2Remembered.headers['set-cookie']).split(',')[0]).toContain(
      'Max-Age=10',
    );
    const malformedV2 = await server.inject({
      method: 'POST',
      url: '/api/auth/login/password',
      payload: {
        identifierType: 'EMAIL',
        identifier: 'remember@example.com',
        password: 'correct-password',
        rememberMe: 1,
      },
    });
    expect(malformedV2.statusCode).toBe(400);
    const wrong = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identity: 'remember-user',
        password: 'wrong-password',
        rememberMe: true,
      },
    });
    expect(wrong.statusCode).toBe(401);
    expect(
      (
        await repository.listSessions(
          (await repository.findByIdentity('remember-user'))!.id,
        )
      ).length,
    ).toBe(3);
    await server.close();
  });

  it('registers, logs in, reads me, and logs out without exposing password', async () => {
    const server = await app();
    const registration = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        password: 'correct horse battery staple',
      },
    });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).not.toHaveProperty('password');
    const duplicate = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'alice',
        email: 'other@example.com',
        displayName: 'A',
        password: 'password123',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('DUPLICATE_IDENTITY');
    const bad = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'alice', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'alice', password: 'correct horse battery staple' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['set-cookie'];
    expect(String(cookie)).toContain('HttpOnly');
    expect(login.json()).not.toHaveProperty('password');
    const me = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookie as string },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe('alice');
    const logout = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookie as string },
    });
    expect(logout.statusCode).toBe(204);
    const after = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookie as string },
    });
    expect(after.statusCode).toBe(401);
    await server.close();
  });
  it('rejects malformed registration and hides nonexistent identity', async () => {
    const server = await app();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { username: 'x' },
        })
      ).json().code,
    ).toBe('VALIDATION_ERROR');
    const missing = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'nobody', password: 'password123' },
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().message).toBe('Invalid credentials');
    const me = await server.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
    await server.close();
  });

  it('projects submission capability from server authorization resolver', async () => {
    const server = Fastify({ logger: false });
    await registerAuthModule(server, {
      repository: createMemoryAuthRepository(),
      canViewAnySubmission: () => true,
    });
    const registration = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'capability-user-id',
        email: 'capability@example.com',
        displayName: 'Capability User',
        password: 'correct-password',
      },
    });
    expect(registration.json().capabilities).toEqual({
      canViewAnySubmission: true,
    });
    await server.close();
  });

  it('serves a safe account view and manages sessions through the authenticated boundary', async () => {
    const server = await app();
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'account-user',
        email: 'account@example.com',
        displayName: 'Account User',
        password: 'correct-password',
      },
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'account-user', password: 'correct-password' },
    });
    const cookie = login.headers['set-cookie'] as string;
    const account = await server.inject({
      method: 'GET',
      url: '/api/auth/account',
      headers: { cookie },
    });
    expect(account.statusCode).toBe(200);
    expect(account.json()).toMatchObject({
      username: 'account-user',
      status: 'active',
      capabilities: { canManageSessions: true },
    });
    expect(account.json()).not.toHaveProperty('passwordHash');
    const sessions = await server.inject({
      method: 'GET',
      url: '/api/auth/sessions',
      headers: { cookie },
    });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json()).toHaveLength(1);
    expect(sessions.json()[0]).not.toHaveProperty('tokenHash');
    const revokeAll = await server.inject({
      method: 'POST',
      url: '/api/auth/sessions/revoke-all',
      headers: { cookie },
    });
    expect(revokeAll.statusCode).toBe(204);
    const after = await server.inject({
      method: 'GET',
      url: '/api/auth/account',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
    await server.close();
  });
});
