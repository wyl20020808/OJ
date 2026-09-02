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
import { registerAuthV2Routes } from './v2-routes.js';
import type {
  AuthProvider,
  AuthProviderAdapter,
  MessageProvider,
  RateLimiter,
} from './v2-types.js';
import type { User } from '../user/model.js';
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
  verificationTtlMs?: number;
  verificationResendMs?: number;
  verificationMaxAttempts?: number;
  oauthTtlMs?: number;
  callbackBaseUrl?: string;
  allowedReturnPaths?: readonly string[];
  emailProvider?: MessageProvider;
  smsProvider?: MessageProvider;
  socialProviders?: Partial<Record<AuthProvider, AuthProviderAdapter>>;
  rateLimiter?: RateLimiter;
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
type ProfileBody = { displayName?: unknown };
type PasswordBody = { currentPassword?: unknown; newPassword?: unknown };
const error = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) =>
  reply.status(statusCode).send({ code, message, requestId: reply.request.id });
const cookie = (request: FastifyRequest) => {
  const raw = request.headers.cookie?.match(/(?:^|; )oj_session=([^;]+)/)?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
};
const guestCookie = (request: FastifyRequest) => {
  const raw = request.headers.cookie?.match(
    /(?:^|; )oj_guest_resume=([^;]+)/,
  )?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
};
const normalizeIdentity = (value: string) =>
  value.normalize('NFKC').trim().toLowerCase();
const validPassword = (value: string) =>
  value.length >= 8 && value.length <= 200;
const displayName = (value: string) => {
  const normalized = value.normalize('NFKC').trim();
  return normalized.length >= 1 && normalized.length <= 80 ? normalized : null;
};
const duplicateIdentity = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  value.code === '23505';
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
  const consumeGuestLimit = async (request: FastifyRequest) => {
    if (!options.guestRateLimiter) throw new Error('GUEST_UNAVAILABLE');
    try {
      if (
        !(await options.guestRateLimiter.consume(`guest:${request.ip}`, 10, 60))
      )
        throw new Error('RATE_LIMITED');
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'RATE_LIMITED')
        throw cause;
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
  const audit = async (
    user: AuthContext | undefined,
    action: string,
    outcome: 'allowed' | 'denied',
    requestId: string,
    resourceId?: string,
  ) => {
    await options.auditHook?.record({
      actorUserId: user?.userId ?? 'anonymous',
      action,
      resource: 'account',
      ...(resourceId ? { resourceId } : {}),
      outcome,
      requestId,
      occurredAt: new Date().toISOString(),
    });
  };
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
        sessionTokenHash: tokenHash(session),
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
      await audit(
        {
          userId: result.user.id,
          sessionId: result.sessionId,
          strength: 'guest',
        },
        oldToken ? 'guest:resume' : 'guest:create',
        'allowed',
        request.id,
        result.user.id,
      );
      return reply.send({
        ...(await projectUser(result.user)),
        resumed: Boolean(oldToken),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'RATE_LIMITED')
        return error(reply, 429, 'RATE_LIMITED', 'Request rate limited');
      throw cause;
    }
  });
  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as AuthBody;
    const username =
      typeof body?.username === 'string'
        ? normalizeIdentity(body.username)
        : '';
    const email =
      typeof body?.email === 'string' ? normalizeIdentity(body.email) : '';
    const name =
      typeof body?.displayName === 'string'
        ? displayName(body.displayName)
        : null;
    if (
      !body ||
      !username ||
      !email ||
      !name ||
      typeof body.password !== 'string' ||
      username.length < 3 ||
      username.length > 32 ||
      !/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(username) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validPassword(body.password)
    )
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid registration data');
    if (
      (await options.repository.findByIdentity(username)) ||
      (await options.repository.findByIdentity(email))
    )
      return error(
        reply,
        409,
        'DUPLICATE_IDENTITY',
        'Username or email is already registered',
      );
    let user;
    try {
      user = await options.repository.createUser({
        username,
        email,
        displayName: name,
        passwordHash: await hashPassword(body.password),
      });
    } catch (cause) {
      if (duplicateIdentity(cause))
        return error(
          reply,
          409,
          'DUPLICATE_IDENTITY',
          'Username or email is already registered',
        );
      throw cause;
    }
    await audit(undefined, 'account:register', 'allowed', request.id, user.id);
    return reply.status(201).send(await projectUser(user));
  });
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as AuthBody;
    if (
      !body ||
      typeof body.identity !== 'string' ||
      typeof body.password !== 'string'
    )
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid credentials');
    const found = await options.repository.findByIdentity(
      normalizeIdentity(body.identity),
    );
    if (
      !found ||
      found.status !== 'active' ||
      !(await verifyPassword(body.password, found.passwordHash))
    ) {
      await audit(undefined, 'account:login', 'denied', request.id);
      return error(reply, 401, 'UNAUTHENTICATED', 'Invalid credentials');
    }
    const token = sessionToken();
    await options.repository.createSession({
      userId: found.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + ttl),
    });
    await audit(
      { userId: found.id, sessionId: 'new', strength: 'password' },
      'account:login',
      'allowed',
      request.id,
      found.id,
    );
    setSessionCookie(reply, token);
    return projectUser(found);
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const token = cookie(request);
    if (token) {
      const s = await options.repository.findSession(tokenHash(token));
      if (s) {
        await options.repository.revokeSession(s.id);
        await audit(
          { userId: s.userId, sessionId: s.id, strength: 'password' },
          'account:logout',
          'allowed',
          request.id,
          s.userId,
        );
      }
    }
    reply.header(
      'set-cookie',
      `oj_session=; Path=/; HttpOnly; SameSite=Lax${options.production ? '; Secure' : ''}; Max-Age=0`,
    );
    return reply.status(204).send();
  });
  app.delete('/api/auth/guest/resume', async (request, reply) => {
    const resume = guestCookie(request);
    if (resume && options.guestStore) {
      await options.guestStore.revokeResume(guestTokenHash(resume));
      await audit(undefined, 'guest:resume_revoke', 'allowed', request.id);
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
  const currentUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = await context(request);
    if (!ctx) {
      error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
      return null;
    }
    const user = await resolveUser(ctx.userId);
    if (!user || user.status !== 'active') {
      error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
      return null;
    }
    return { ctx, user };
  };
  app.get('/api/auth/profile', async (request, reply) => {
    const current = await currentUser(request, reply);
    return current
      ? reply.send(publicAccount(current.user, await isGuest(current.user.id)))
      : undefined;
  });
  app.patch('/api/auth/profile', async (request, reply) => {
    const current = await currentUser(request, reply);
    if (!current) return;
    const body = request.body as ProfileBody;
    if (!body || Object.keys(body).some((key) => key !== 'displayName'))
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid profile data');
    const name =
      typeof body?.displayName === 'string'
        ? displayName(body.displayName)
        : null;
    if (!name)
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid profile data');
    const updated = await options.repository.updateProfile(current.user.id, {
      displayName: name,
    });
    if (!updated) return error(reply, 409, 'CONFLICT', 'Profile update failed');
    await audit(
      current.ctx,
      'account:profile_update',
      'allowed',
      request.id,
      current.user.id,
    );
    return reply.send(publicAccount(updated, await isGuest(updated.id)));
  });
  const passwordChange = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const current = await currentUser(request, reply);
    if (!current) return;
    const body = request.body as PasswordBody;
    if (
      !body ||
      Object.keys(body).some(
        (key) => key !== 'currentPassword' && key !== 'newPassword',
      ) ||
      typeof body.currentPassword !== 'string' ||
      typeof body.newPassword !== 'string' ||
      !validPassword(body.newPassword)
    )
      return error(reply, 400, 'VALIDATION_ERROR', 'Invalid password data');
    const credential = await options.repository.findByIdentity(
      current.user.username,
    );
    if (
      !credential ||
      !(await verifyPassword(body.currentPassword, credential.passwordHash))
    ) {
      await audit(
        current.ctx,
        'account:password_change',
        'denied',
        request.id,
        current.user.id,
      );
      return error(
        reply,
        401,
        'UNAUTHENTICATED',
        'Current password is invalid',
      );
    }
    if (await verifyPassword(body.newPassword, credential.passwordHash))
      return error(
        reply,
        400,
        'VALIDATION_ERROR',
        'New password must be different',
      );
    const changed = await options.repository.updatePasswordHash(
      current.user.id,
      await hashPassword(body.newPassword),
    );
    if (!changed)
      return error(reply, 409, 'CONFLICT', 'Password change failed');
    await options.repository.revokeOtherSessions(
      current.user.id,
      current.ctx.sessionId,
    );
    await audit(
      current.ctx,
      'account:password_change',
      'allowed',
      request.id,
      current.user.id,
    );
    return reply.status(204).send();
  };
  app.post('/api/auth/password/change', passwordChange);
  app.post('/api/auth/password', passwordChange);
  app.patch('/api/auth/password', passwordChange);
  app.get('/api/auth/sessions', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const now = Date.now();
    return reply.send(
      (await sessions.listForUser(ctx.userId))
        .filter(
          (session) =>
            !session.revokedAt && new Date(session.expiresAt).getTime() > now,
        )
        .map((session) => ({
          ...session,
          current: session.id === ctx.sessionId,
        })),
    );
  });
  app.delete('/api/auth/sessions/:id', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const id = (request.params as { id?: string }).id;
    if (!id) return error(reply, 400, 'VALIDATION_ERROR', 'Invalid session');
    try {
      await sessions.revoke(id, ctx);
      await audit(ctx, 'account:session_revoke', 'allowed', request.id, id);
      return reply.status(204).send();
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN')
        await audit(ctx, 'account:session_revoke', 'denied', request.id, id);
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
    await audit(
      ctx,
      'account:sessions_revoke_all',
      'allowed',
      request.id,
      ctx.userId,
    );
    return reply.status(204).send();
  });
  app.post('/api/auth/sessions/revoke-others', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    await options.repository.revokeOtherSessions(ctx.userId, ctx.sessionId);
    await audit(
      ctx,
      'account:sessions_revoke_others',
      'allowed',
      request.id,
      ctx.userId,
    );
    return reply.status(204).send();
  });
  await registerAuthV2Routes(app, {
    repository: options.repository,
    getAuthContext: context,
    ...(options.production === undefined
      ? {}
      : { production: options.production }),
    sessionTtlMs: ttl,
    guestLoginAvailable: guestAvailable,
    ...(options.verificationTtlMs === undefined
      ? {}
      : { verificationTtlMs: options.verificationTtlMs }),
    ...(options.verificationResendMs === undefined
      ? {}
      : { verificationResendMs: options.verificationResendMs }),
    ...(options.verificationMaxAttempts === undefined
      ? {}
      : { verificationMaxAttempts: options.verificationMaxAttempts }),
    ...(options.oauthTtlMs === undefined
      ? {}
      : { oauthTtlMs: options.oauthTtlMs }),
    ...(options.callbackBaseUrl === undefined
      ? {}
      : { callbackBaseUrl: options.callbackBaseUrl }),
    ...(options.allowedReturnPaths === undefined
      ? {}
      : { allowedReturnPaths: options.allowedReturnPaths }),
    ...(options.emailProvider === undefined
      ? {}
      : { emailProvider: options.emailProvider }),
    ...(options.smsProvider === undefined
      ? {}
      : { smsProvider: options.smsProvider }),
    ...(options.socialProviders === undefined
      ? {}
      : { socialProviders: options.socialProviders }),
    ...(options.rateLimiter === undefined
      ? {}
      : { rateLimiter: options.rateLimiter }),
    audit: audit,
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
export * from './v2-types.js';
export * from './guest.js';
export * from './rate-limiter.js';
export * from './memory-repository.js';
export * from './postgres-repository.js';
