import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ProblemConflictError,
  ProblemNotFoundError,
  ProblemValidationError,
  ProblemDeleteConflictError,
  type AuthContext,
  type AuthorizationPolicy,
  type AuditHook,
  type Problem,
  problemDifficulties,
  problemListSorts,
  problemSourceTypes,
} from './model.js';
import {
  InMemoryTagCatalogRepository,
  type TagCatalogRepository,
} from './catalog.js';
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
  projectMetadata?: (
    problem: Problem,
  ) => Promise<Partial<Problem>> | Partial<Problem>;
  tagCatalog?: TagCatalogRepository;
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
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505';
export async function registerProblemModule(
  app: FastifyInstance,
  context: ProblemModuleContext,
): Promise<void> {
  const service = new ProblemService(
    context.repository ?? new InMemoryProblemRepository(),
    context.authorizationPolicy,
    context.auditHook,
    context.guardGuestMutation,
    context.projectMetadata,
    context.tagCatalog ?? new InMemoryTagCatalogRepository(),
  );
  const auth = async (request: FastifyRequest) =>
    context.getAuthContext ? await context.getAuthContext(request) : undefined;
  app.get('/api/tags', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const search = typeof q.q === 'string' ? q.q.trim() : undefined;
    return reply.send(
      await (context.tagCatalog ?? new InMemoryTagCatalogRepository()).list({
        ...(search ? { search } : {}),
        activeOnly: true,
      }),
    );
  });
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
    const difficulty =
      typeof q.difficulty === 'string' ? q.difficulty : undefined;
    const sourceType =
      typeof q.sourceType === 'string' ? q.sourceType : undefined;
    const tagIdsValue = typeof q.tagIds === 'string' ? q.tagIds : undefined;
    const tagId = tagIdsValue === undefined ? undefined : Number(tagIdsValue);
    const sort = typeof q.sort === 'string' ? q.sort : undefined;
    const order = typeof q.order === 'string' ? q.order : undefined;
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
    if (difficulty && !problemDifficulties.includes(difficulty as never))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid difficulty',
      );
    if (sourceType && !problemSourceTypes.includes(sourceType as never))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid source type',
      );
    if (sort && !problemListSorts.includes(sort as never))
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid sort');
    if (order && order !== 'asc' && order !== 'desc')
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid order');
    if (
      tagIdsValue !== undefined &&
      (!Number.isSafeInteger(tagId) ||
        (tagId ?? 0) < 1 ||
        !/^\d+$/.test(tagIdsValue))
    )
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid tag ID');
    const tagIds = tagIdsValue === undefined ? undefined : [tagId as number];
    const contextValue = await auth(request);
    try {
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
              ...(difficulty
                ? {
                    difficulty:
                      difficulty as (typeof problemDifficulties)[number],
                  }
                : {}),
              ...(tagIds ? { tagIds } : {}),
              ...(sourceType
                ? {
                    sourceType:
                      sourceType as (typeof problemSourceTypes)[number],
                  }
                : {}),
              ...(sort
                ? { sort: sort as (typeof problemListSorts)[number] }
                : {}),
              ...(order ? { order: order as 'asc' | 'desc' } : {}),
            }
          : {
              limit,
              offset,
              ...(search ? { search } : {}),
              ...(difficulty
                ? {
                    difficulty:
                      difficulty as (typeof problemDifficulties)[number],
                  }
                : {}),
              ...(tagIds ? { tagIds } : {}),
              ...(sourceType
                ? {
                    sourceType:
                      sourceType as (typeof problemSourceTypes)[number],
                  }
                : {}),
              ...(sort
                ? { sort: sort as (typeof problemListSorts)[number] }
                : {}),
              ...(order ? { order: order as 'asc' | 'desc' } : {}),
            },
      );
      const nextCursor =
        result.items.length === limit
          ? Buffer.from(String(offset + result.items.length), 'utf8').toString(
              'base64url',
            )
          : undefined;
      return reply.send({
        items: result.items,
        facets: result.facets,
        page: {
          limit,
          offset,
          total: result.total,
          ...(nextCursor ? { nextCursor } : {}),
        },
      });
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message === 'INVALID_TAGS' ||
          e.message === 'TAG_CATALOG_UNAVAILABLE')
      )
        return error(
          reply,
          request,
          400,
          'INVALID_TAG',
          'Selected tag is unavailable or inactive',
        );
      throw e;
    }
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
      if (e instanceof ProblemConflictError || isUniqueViolation(e))
        return error(
          reply,
          request,
          409,
          'CONFLICT',
          e instanceof ProblemConflictError
            ? e.message
            : 'Problem identifier or slug already exists',
        );
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
      if (
        e instanceof Error &&
        (e.message === 'INVALID_TAGS' ||
          e.message === 'TAG_CATALOG_UNAVAILABLE')
      )
        return error(
          reply,
          request,
          400,
          'INVALID_TAG',
          'Selected tags are unavailable or inactive',
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
      if (e instanceof ProblemConflictError || isUniqueViolation(e))
        return error(
          reply,
          request,
          409,
          'CONFLICT',
          e instanceof ProblemConflictError
            ? e.message
            : 'Problem identifier or slug already exists',
        );
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem update is forbidden',
        );
      if (
        e instanceof Error &&
        (e.message === 'INVALID_TAGS' ||
          e.message === 'TAG_CATALOG_UNAVAILABLE')
      )
        return error(
          reply,
          request,
          400,
          'INVALID_TAG',
          'Selected tags are unavailable or inactive',
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
  app.delete('/api/problems/:idOrSlug', async (request, reply) => {
    if (!csrf(request))
      return error(reply, request, 403, 'FORBIDDEN', 'CSRF validation failed');
    try {
      const key = (request.params as { idOrSlug: string }).idOrSlug;
      return reply.send(
        await service.delete(
          key,
          request.body,
          await auth(request),
          request.id,
        ),
      );
    } catch (e) {
      if (e instanceof ProblemNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      if (e instanceof ProblemDeleteConflictError)
        return error(reply, request, 409, 'CONFLICT', e.message);
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Problem deletion is forbidden',
        );
      if (e instanceof Error && e.message === 'VALIDATION_ERROR')
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'Delete reason and expectedUpdatedAt required',
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
