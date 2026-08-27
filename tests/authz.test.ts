import { describe, expect, it } from 'vitest';
import {
  createMemoryAuthRepository,
  registerAuthModule,
} from '../apps/api/src/modules/auth/index.js';
import {
  createMemoryAuthorizationPolicy,
  createMemoryAuditHook,
} from '../apps/api/src/modules/authz/index.js';
import { createPostgresAuthRepository } from '../apps/api/src/modules/auth/postgres-repository.js';
import Fastify from 'fastify';

describe('authorization foundation', () => {
  it('denies malformed or missing contexts and allows assigned permissions', async () => {
    const policy = createMemoryAuthorizationPolicy();
    policy.defineRole({
      name: 'setter',
      permissions: new Set(['problem:create', 'problem:update']),
    });
    policy.assign('u1', 'setter');
    expect(await policy.can('create', 'problem', undefined)).toBe(false);
    const context = {
      userId: 'u1',
      sessionId: 's1',
      strength: 'password' as const,
    };
    expect(await policy.can('create', 'problem', context)).toBe(true);
    expect(await policy.can('publish', 'problem', context)).toBe(false);
    expect(
      await policy.can('update', 'problem', context, { ownerId: 'u2' }),
    ).toBe(false);
  });

  it('revokes individual and all sessions and blocks disabled accounts', async () => {
    const repository = createMemoryAuthRepository();
    const audit = createMemoryAuditHook();
    const server = Fastify({ logger: false });
    const auth = await registerAuthModule(server, {
      repository,
      auditHook: audit,
    });
    const user = await repository.createUser({
      username: 'authz-user',
      email: 'authz@example.com',
      displayName: 'Authz',
      passwordHash: 'hash',
    });
    const first = await repository.createSession({
      userId: user.id,
      tokenHash: 'h1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const second = await repository.createSession({
      userId: user.id,
      tokenHash: 'h2',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await auth.sessions.listForUser(user.id)).map((s) => s.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    const actor = {
      userId: user.id,
      sessionId: first.id,
      strength: 'password' as const,
    };
    await auth.sessions.revoke(second.id, actor);
    expect(await repository.findSession('h2')).toBeNull();
    await auth.sessions.revokeAllForUser(user.id, actor);
    expect(await repository.findSession('h1')).toBeNull();
    const changed = await auth.setUserStatus(user.id, 'disabled', {
      userId: 'admin',
      sessionId: 'admin-s',
      strength: 'password',
    });
    expect(changed?.status).toBe('disabled');
    expect(audit.events[0]?.action).toBe('account:disabled');
    await server.close();
  });

  it('rejects a disabled user session after lifecycle transition', async () => {
    const repository = createMemoryAuthRepository();
    const server = Fastify({ logger: false });
    const auth = await registerAuthModule(server, { repository });
    await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'disabled-user',
        email: 'disabled@example.com',
        displayName: 'Disabled',
        password: 'correct-password',
      },
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'disabled-user', password: 'correct-password' },
    });
    const user = await repository.findByIdentity('disabled-user');
    expect(user).not.toBeNull();
    await repository.updateUserStatus(user!.id, 'disabled');
    const me = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: login.headers['set-cookie'] as string },
    });
    expect(me.statusCode).toBe(401);
    const relogin = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: 'disabled-user', password: 'correct-password' },
    });
    expect(relogin.statusCode).toBe(401);
    await server.close();
    void auth;
  });

  it('maps persistent session metadata without exposing token hashes', async () => {
    const queries: string[] = [];
    const repository = createPostgresAuthRepository({
      async query(sql) {
        queries.push(sql);
        if (sql.startsWith('SELECT id,created_at'))
          return {
            rows: [
              {
                id: 's1',
                created_at: '2026-01-01T00:00:00Z',
                expires_at: '2026-01-02T00:00:00Z',
                revoked_at: null,
                token_hash: 'secret-hash',
              },
            ],
          };
        if (sql.startsWith('SELECT user_id'))
          return { rows: [{ user_id: 'u1' }] };
        return { rows: [] };
      },
    });
    const sessions = await repository.listSessions('u1');
    expect(sessions).toEqual([
      {
        id: 's1',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-02T00:00:00.000Z',
        revokedAt: null,
      },
    ]);
    expect(JSON.stringify(sessions)).not.toContain('secret-hash');
    expect(await repository.findSessionOwner('s1')).toBe('u1');
    expect(queries).toHaveLength(2);
  });
});
