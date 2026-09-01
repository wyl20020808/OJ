import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hashPassword,
  sessionToken,
  tokenHash,
  verifyPassword,
} from './crypto.js';
import {
  publicAccount,
  publicUser,
  type AuthContext,
  type AuthRepository,
  type SessionMetadata,
} from './types.js';
import type { AuditHook } from '../authz/types.js';
import type { User } from '../user/model.js';
export * from './guest.js';
export * from './rate-limiter.js';
import {
  guestToken,
  guestTokenHash,
  type GuestAuthRateLimiter,
  type GuestAuthStore,
} from './guest.js';
export type AuthModuleOptions = {
  repository: AuthRepository;
  production?: boolean;
  sessionTtlMs?: number;
  auditHook?: AuditHook;
  guestStore?: GuestAuthStore;
  guestRateLimiter?: GuestAuthRateLimiter;
  guestResumeTtlMs?: number;
};
type AuthBody = {
  username?: unknown;
  email?: unknown;
  displayName?: unknown;
  password?: unknown;
  identity?: unknown;
};
const error = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) =>
  reply.status(statusCode).send({ code, message, requestId: reply.request.id });
const cookie = (request: FastifyRequest) => {
  const raw = request.headers.cookie?.match(/(?:^|; )oj_session=([^;]+)/)?.[1];
  return raw ? decodeURIComponent(raw) : undefined;
};
const guestCookie = (request: FastifyRequest) => {
  const raw = request.headers.cookie?.match(
    /(?:^|; )oj_guest_resume=([^;]+)/,
  )?.[1];
  return raw ? decodeURIComponent(raw) : undefined;
};
export async function registerAuthModule(
  app: FastifyInstance,
  options: AuthModuleOptions,
) {
  const ttl = options.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  const guestTtl = options.guestResumeTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  const guestAvailable = Boolean(
    options.guestStore && options.guestRateLimiter,
  );
  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.header(
      'set-cookie',
      `oj_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${options.production ? '; Secure' : ''}; Max-Age=${Math.floor(ttl / 1000)}`,
    );
  const setGuestResumeCookie = (reply: FastifyReply, token: string) =>
    reply.header(
      'set-cookie',
      `oj_guest_resume=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${options.production ? '; Secure' : ''}; Max-Age=${Math.floor(guestTtl / 1000)}`,
    );
  const clearGuestResumeCookie = (reply: FastifyReply) =>
    reply.header(
      'set-cookie',
      'oj_guest_resume=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  const isGuest = async (userId: string) =>
    Boolean(options.guestStore && (await options.guestStore.isGuest(userId)));
  const projectUser = async (user: User) =>
    publicUser(user, await isGuest(user.id));
  const resolveUser = async (userId: string) =>
    (await options.repository.findById(userId)) ??
    (options.guestStore ? await options.guestStore.findUser(userId) : null);
  const auditGuest = async (
    request: FastifyRequest,
    action: string,
    userId?: string,
  ) =>
    options.auditHook?.record({
      actorUserId: userId ?? 'anonymous',
      action,
      resource: 'guest_auth',
      ...(userId ? { resourceId: userId } : {}),
      outcome: 'allowed',
      requestId: request.id,
      occurredAt: new Date().toISOString(),
    });
  const consumeGuestLimit = async (request: FastifyRequest) => {
    if (!options.guestRateLimiter) throw new Error('GUEST_UNAVAILABLE');
    try {
      if (
        !(await options.guestRateLimiter.consume(`guest:${request.ip}`, 10, 60))
      )
        throw new Error('RATE_LIMITED');
    } catch (errorValue) {
      if (errorValue instanceof Error && errorValue.message === 'RATE_LIMITED')
        throw errorValue;
      throw new Error('RATE_LIMITED');
    }
  };
  const context = async (
    request: FastifyRequest,
  ): Promise<AuthContext | null> => {
    const token = cookie(request);
    if (!token) return null;
    const s = await options.repository.findSession(tokenHash(token));
    if (!s) return null;
    const user = await resolveUser(s.userId);
    if (!user || user.status !== 'active') {
      await options.repository.revokeSession(s.id);
      return null;
    }
    return {
      userId: user.id,
      sessionId: s.id,
      strength: (await isGuest(user.id)) ? 'guest' : 'password',
    };
  };
  app.get('/api/auth/capabilities', async (_request, reply) =>
    reply.send({ guestLogin: { available: guestAvailable } }),
  );
  app.get('/api/auth/methods', async (_request, reply) =>
    reply.send({
      registration: { email: true, phone: false },
      login: {
        emailPassword: true,
        phonePassword: false,
        emailCode: false,
        phoneCode: false,
      },
      providers: {
        wechat: 'not_configured',
        qq: 'not_configured',
        google: 'not_configured',
        github: 'not_configured',
      },
      passwordPolicy: { minLength: 8 },
    }),
  );
  app.post('/api/auth/guest/continue', async (request, reply) => {
    try {
      if (!guestAvailable || !options.guestStore)
        return error(
          reply,
          503,
          'GUEST_UNAVAILABLE',
          'Guest login is unavailable',
        );
      await consumeGuestLimit(request);
      const oldToken = guestCookie(request);
      const resume = guestToken();
      const session = guestToken();
      const input = {
        resumeTokenHash: guestTokenHash(resume),
        resumeExpiresAt: new Date(Date.now() + guestTtl),
        sessionTokenHash: guestTokenHash(session),
        sessionExpiresAt: new Date(Date.now() + ttl),
      };
      const result = oldToken
        ? await options.guestStore.resumeGuest({
            ...input,
            oldTokenHash: guestTokenHash(oldToken),
          })
        : await options.guestStore.createGuest(input);
      if (!result)
        return error(
          reply,
          401,
          'INVALID_GUEST_RESUME',
          'Guest resume credential is invalid or expired',
        );
      setSessionCookie(reply, session);
      setGuestResumeCookie(reply, resume);
      await auditGuest(
        request,
        oldToken ? 'GUEST_RESUMED' : 'GUEST_CREATED',
        result.user.id,
      );
      return reply.send({
        ...(await projectUser(result.user)),
        resumed: Boolean(oldToken),
      });
    } catch (errorValue) {
      if (errorValue instanceof Error && errorValue.message === 'RATE_LIMITED')
        return error(reply, 429, 'RATE_LIMITED', 'Request rate limited');
      throw errorValue;
    }
  });
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as AuthBody;
    if (
      !body ||
      typeof body.username !== 'string' ||
      typeof body.email !== 'string' ||
      typeof body.displayName !== 'string' ||
      typeof body.password !== 'string' ||
      body.username.length < 3 ||
      body.username.length > 32 ||
      !/^\S+@\S+\.\S+$/.test(body.email) ||
      body.password.length < 8 ||
      body.password.length > 200
    )
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid registration data');
    if (
      (await options.repository.findByIdentity(body.username)) ||
      (await options.repository.findByIdentity(body.email))
    )
      return error(
        reply,
        409,
        'DUPLICATE_IDENTITY',
        'Username or email is already registered',
      );
    const user = await options.repository.createUser({
      username: body.username,
      email: body.email,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
    });
    return reply.status(201).send(publicUser(user));
  });
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as AuthBody;
    if (
      !body ||
      typeof body.identity !== 'string' ||
      typeof body.password !== 'string'
    )
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid credentials');
    const found = await options.repository.findByIdentity(body.identity);
    if (
      !found ||
      found.status !== 'active' ||
      !(await verifyPassword(body.password, found.passwordHash))
    )
      return error(reply, 401, 'UNAUTHENTICATED', 'Invalid credentials');
    const token = sessionToken();
    await options.repository.createSession({
      userId: found.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + ttl),
    });
    setSessionCookie(reply, token);
    return projectUser(found);
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const token = cookie(request);
    if (token) {
      const s = await options.repository.findSession(tokenHash(token));
      if (s) await options.repository.revokeSession(s.id);
    }
    reply.header(
      'set-cookie',
      'oj_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
    return reply.status(204).send();
  });
  app.delete('/api/auth/guest/resume', async (request, reply) => {
    const token = guestCookie(request);
    if (token && options.guestStore) {
      await options.guestStore.revokeResume(guestTokenHash(token));
      await auditGuest(request, 'GUEST_RESUME_REVOKED');
    }
    clearGuestResumeCookie(reply);
    return reply.status(204).send();
  });
  app.get('/api/auth/me', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const user = await resolveUser(ctx.userId);
    if (!user || user.status !== 'active')
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    return projectUser(user);
  });
  const sessions = {
    listForUser: (userId: string): Promise<SessionMetadata[]> =>
      options.repository.listSessions(userId),
    revoke: async (sessionId: string, actor: AuthContext) => {
      if (actor.userId !== (await findSessionOwner(sessionId)))
        throw new Error('FORBIDDEN');
      await options.repository.revokeSession(sessionId);
    },
    revokeAllForUser: async (userId: string, actor: AuthContext) => {
      if (actor.userId !== userId) throw new Error('FORBIDDEN');
      await options.repository.revokeAllSessions(userId);
    },
  };
  const findSessionOwner = (sessionId: string) =>
    options.repository.findSessionOwner(sessionId);
  app.get('/api/auth/account', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const user = await resolveUser(ctx.userId);
    if (!user || user.status !== 'active')
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    return reply.send(publicAccount(user, await isGuest(user.id)));
  });
  app.get('/api/auth/sessions', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    return reply.send(await sessions.listForUser(ctx.userId));
  });
  app.delete('/api/auth/sessions/:id', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const id = (request.params as { id?: string }).id;
    if (!id) return error(reply, 400, 'VALIDATION_ERROR', 'Invalid session');
    try {
      await sessions.revoke(id, ctx);
      return reply.status(204).send();
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          403,
          'FORBIDDEN',
          'Session revocation is forbidden',
        );
      throw e;
    }
  });
  app.post('/api/auth/sessions/revoke-all', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    await sessions.revokeAllForUser(ctx.userId, ctx);
    return reply.status(204).send();
  });
  return {
    getAuthContext: context,
    getUser: (id: string) => options.repository.findById(id),
    sessions,
    setUserStatus: async (
      id: string,
      status: 'active' | 'disabled' | 'deactivated',
      actor: AuthContext,
      requestId = 'internal',
    ) => {
      if (actor.userId === id) {
        await options.auditHook?.record({
          actorUserId: actor.userId,
          action: `account:${status}`,
          resource: 'account',
          resourceId: id,
          outcome: 'denied',
          requestId,
          occurredAt: new Date().toISOString(),
        });
        throw new Error('FORBIDDEN');
      }
      const current = await options.repository.findById(id);
      const valid =
        current &&
        current.status !== 'deactivated' &&
        current.status !== status;
      if (!valid) {
        await options.auditHook?.record({
          actorUserId: actor.userId,
          action: `account:${status}`,
          resource: 'account',
          resourceId: id,
          outcome: 'denied',
          requestId,
          occurredAt: new Date().toISOString(),
        });
        throw new Error('FORBIDDEN');
      }
      const user = await options.repository.updateUserStatus(id, status);
      await options.auditHook?.record({
        actorUserId: actor.userId,
        action: `account:${status}`,
        resource: 'account',
        resourceId: id,
        outcome: user ? 'allowed' : 'denied',
        requestId,
        occurredAt: new Date().toISOString(),
      });
      return user;
    },
  };
}
export * from './types.js';
export * from './memory-repository.js';
export * from './postgres-repository.js';
