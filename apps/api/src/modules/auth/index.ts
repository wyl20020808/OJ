import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hashPassword,
  sessionToken,
  tokenHash,
  verifyPassword,
} from './crypto.js';
import { publicUser, type AuthContext, type AuthRepository } from './types.js';
export type AuthModuleOptions = {
  repository: AuthRepository;
  production?: boolean;
  sessionTtlMs?: number;
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
export async function registerAuthModule(
  app: FastifyInstance,
  options: AuthModuleOptions,
) {
  const ttl = options.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  const context = async (
    request: FastifyRequest,
  ): Promise<AuthContext | null> => {
    const token = cookie(request);
    if (!token) return null;
    const s = await options.repository.findSession(tokenHash(token));
    if (!s) return null;
    const user = await options.repository.findById(s.userId);
    if (!user || user.status !== 'active') {
      await options.repository.revokeSession(s.id);
      return null;
    }
    return { userId: user.id, sessionId: s.id, strength: 'password' };
  };
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
    reply.header(
      'set-cookie',
      `oj_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${options.production ? '; Secure' : ''}; Max-Age=${Math.floor(ttl / 1000)}`,
    );
    return publicUser(found);
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
  app.get('/api/auth/me', async (request, reply) => {
    const ctx = await context(request);
    if (!ctx)
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    const user = await options.repository.findById(ctx.userId);
    if (!user || user.status !== 'active')
      return error(reply, 401, 'UNAUTHENTICATED', 'Authentication required');
    return publicUser(user);
  });
  return { getAuthContext: context };
}
export * from './types.js';
export * from './memory-repository.js';
export * from './postgres-repository.js';
