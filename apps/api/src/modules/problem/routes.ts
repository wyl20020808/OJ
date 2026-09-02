import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ProblemConflictError,
  ProblemNotFoundError,
  ProblemValidationError,
  type AuthContext,
  type AuthorizationPolicy,
  type AuditHook,
} from './model.js';
import {
  InMemoryProblemRepository,
  type ProblemRepository,
} from './repository.js';
import { ProblemService } from './service.js';

export type ProblemModuleContext = {
  repository?: ProblemRepository;
  authorizationPolicy: AuthorizationPolicy;
  auditHook?: AuditHook;
  guardGuestMutation?: (
    action: 'create' | 'update' | 'transition',
    context: AuthContext,
  ) => Promise<void>;
  getAuthContext?: (
    request: FastifyRequest,
  ) => AuthContext | undefined | Promise<AuthContext | undefined>;
};
const error = (
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) =>
  reply.status(status).send({
    code,
    message,
    requestId: request.id,
    ...(details === undefined ? {} : { details }),
  });
const csrf = (request: FastifyRequest) => {
  const token = request.headers['x-csrf-token'];
  return (
    typeof token === 'string' &&
    request.headers.cookie
      ?.split(';')
      .some((cookie) => cookie.trim() === `oj_csrf=${token}`)
  );
};
export async function registerProblemModule(
  app: FastifyInstance,
  context: ProblemModuleContext,
): Promise<void> {
  const service = new ProblemService(
    context.repository ?? new InMemoryProblemRepository(),
    context.authorizationPolicy,
    context.auditHook,
    context.guardGuestMutation,
  );
  const auth = async (request: FastifyRequest) =>
    context.getAuthContext ? await context.getAuthContext(request) : undefined;
  app.get('/api/problems', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const limit = Number(q.limit ?? 20);
    const cursor = typeof q.cursor === 'string' ? q.cursor : undefined;
    const decodedOffset = cursor
      ? Number(Buffer.from(cursor, 'base64url').toString('utf8'))
      : Number(q.offset ?? 0);
    const offset =
      Number.isSafeInteger(decodedOffset) && decodedOffset >= 0
        ? decodedOffset
        : -1;
    const search =
      typeof q.search === 'string'
        ? q.search.trim()
        : typeof q.q === 'string'
          ? q.q.trim()
          : undefined;
    const status = typeof q.status === 'string' ? q.status : undefined;
    const visibility =
      typeof q.visibility === 'string' ? q.visibility : undefined;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    const contextValue = await auth(request);
    const result = await service.list(
      contextValue
        ? {
            limit,
            offset,
            context: contextValue,
            ...(search ? { search } : {}),
            ...(status === 'draft' ||
            status === 'published' ||
            status === 'archived'
              ? { status }
              : {}),
            ...(visibility === 'private' || visibility === 'public'
              ? { visibility }
              : {}),
          }
        : { limit, offset, ...(search ? { search } : {}) },
    );
    const nextCursor =
      result.items.length === limit
        ? Buffer.from(String(offset + result.items.length), 'utf8').toString(
            'base64url',
          )
        : undefined;
    return reply.send({
      items: result.items,
      page: {
        limit,
        offset,
        total: result.total,
        ...(nextCursor ? { nextCursor } : {}),
      },
    });
  });
  app.get('/api/home', async (_request, reply) =>
    reply.send(await service.home()),
  );
  app.get('/api/problems/:idOrSlug', async (request, reply) => {
    try {
      return reply.send(
        await service.detail(
          (request.params as { idOrSlug: string }).idOrSlug,
          await auth(request),
        ),
      );
    } catch (e) {
      if (e instanceof ProblemNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      throw e;
    }
  });
  app.post('/api/problems', async (request, reply) => {
    if (!csrf(request))
      return error(reply, request, 403, 'FORBIDDEN', 'CSRF validation failed');
    try {
      return reply
        .status(201)
        .send(await service.create(request.body, await auth(request)));
    } catch (e) {
      if (e instanceof ProblemValidationError)
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          e.message,
          e.details,
        );
      if (e instanceof ProblemConflictError)
        return error(reply, request, 409, 'CONFLICT', e.message);
      if (e instanceof Error && e.message === 'VALIDATION_ERROR')
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'Invalid problem state',
        );
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem authoring is forbidden',
        );
      if (e instanceof Error && e.message === 'RATE_LIMITED')
        return error(
          reply,
          request,
          429,
          'RATE_LIMITED',
          'Request rate limited',
        );
      throw e;
    }
  });
  app.patch('/api/problems/:idOrSlug', async (request, reply) => {
    const key = (request.params as { idOrSlug: string }).idOrSlug;
    if (!csrf(request))
      return error(reply, request, 403, 'FORBIDDEN', 'CSRF validation failed');
    try {
      return reply.send(
        await service.update(key, request.body, await auth(request)),
      );
    } catch (e) {
      if (e instanceof ProblemNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      if (e instanceof ProblemValidationError)
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          e.message,
          e.details,
        );
      if (e instanceof ProblemConflictError)
        return error(reply, request, 409, 'CONFLICT', e.message);
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem update is forbidden',
        );
      if (e instanceof Error && e.message === 'RATE_LIMITED')
        return error(
          reply,
          request,
          429,
          'RATE_LIMITED',
          'Request rate limited',
        );
      throw e;
    }
  });
  app.post('/api/problems/:idOrSlug/transition', async (request, reply) => {
    const key = (request.params as { idOrSlug: string }).idOrSlug;
    if (!csrf(request))
      return error(reply, request, 403, 'FORBIDDEN', 'CSRF validation failed');
    try {
      return reply.send(
        await service.transition(
          key,
          request.body as {
            visibility?: 'private' | 'public';
            status?: 'draft' | 'published' | 'archived';
          },
          await auth(request),
        ),
      );
    } catch (e) {
      if (e instanceof ProblemNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem transition is forbidden',
        );
      if (e instanceof Error && e.message === 'RATE_LIMITED')
        return error(
          reply,
          request,
          429,
          'RATE_LIMITED',
          'Request rate limited',
        );
      if (e instanceof Error && e.message === 'VALIDATION_ERROR')
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'Invalid transition',
        );
      if (e instanceof Error && e.message === 'INVALID_TRANSITION')
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'Invalid transition',
        );
      throw e;
    }
  });
  app.get('/api/problems/:idOrSlug/revisions', async (request, reply) => {
    try {
      return reply.send(
        await service.history(
          (request.params as { idOrSlug: string }).idOrSlug,
          await auth(request),
        ),
      );
    } catch (e) {
      if (e instanceof ProblemNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem history is forbidden',
        );
      throw e;
    }
  });
}
