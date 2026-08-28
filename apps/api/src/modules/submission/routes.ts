import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthContext,
  ProblemRevisionResolver,
  Submission,
  SubmissionAuthorizationPolicy,
} from './model.js';
import { SubmissionNotFoundError, SubmissionValidationError } from './model.js';
import {
  InMemorySubmissionRepository,
  type SubmissionRepository,
} from './repository.js';
import { SubmissionService } from './service.js';
import { LANGUAGE_CATALOG } from './languages.js';

export type SubmissionModuleContext = {
  repository?: SubmissionRepository;
  authorizationPolicy: SubmissionAuthorizationPolicy;
  problemResolver: ProblemRevisionResolver;
  getAuthContext?: (
    request: FastifyRequest,
  ) => AuthContext | undefined | Promise<AuthContext | undefined>;
  projectJudge?: (submission: Submission) => Promise<Partial<Submission>>;
  onCreated?: (submission: Submission) => Promise<void> | void;
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

export async function registerSubmissionModule(
  app: FastifyInstance,
  context: SubmissionModuleContext,
) {
  const service = new SubmissionService(
    context.repository ?? new InMemorySubmissionRepository(),
    context.authorizationPolicy,
    context.problemResolver,
  );
  const project = async (submission: Submission) =>
    context.projectJudge
      ? { ...submission, ...(await context.projectJudge(submission)) }
      : submission;
  const auth = async (request: FastifyRequest) =>
    context.getAuthContext ? await context.getAuthContext(request) : undefined;
  app.get('/api/submissions/languages', async (_request, reply) =>
    reply.send(
      [...LANGUAGE_CATALOG.values()].map(
        ({ id, displayName, maxSourceBytes }) => ({
          id,
          name: displayName,
          extension: id,
          maxSourceBytes,
        }),
      ),
    ),
  );
  app.post('/api/submissions', async (request, reply) => {
    try {
      return reply.status(201).send(
        await project(
          await (async () => {
            const submission = await service.create(
              request.body,
              await auth(request),
            );
            await context.onCreated?.(submission);
            return submission;
          })(),
        ),
      );
    } catch (e) {
      if (e instanceof SubmissionValidationError)
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          e.message,
          e.details,
        );
      if (e instanceof Error && e.message === 'UNAUTHENTICATED')
        return error(
          reply,
          request,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Submission is forbidden',
        );
      if (e instanceof Error && e.message === 'VALIDATION_ERROR')
        return error(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'Invalid problem revision or testdata reference',
        );
      throw e;
    }
  });
  app.get('/api/submissions', async (request, reply) =>
    listRoute(service, request, reply, await auth(request), project),
  );
  app.get('/api/submissions/:id', async (request, reply) => {
    try {
      return reply.send(
        await project(
          await service.detail(
            (request.params as { id: string }).id,
            await auth(request),
          ),
        ),
      );
    } catch (e) {
      if (e instanceof SubmissionNotFoundError)
        return error(reply, request, 404, 'NOT_FOUND', e.message);
      if (e instanceof Error && e.message === 'UNAUTHENTICATED')
        return error(
          reply,
          request,
          401,
          'UNAUTHENTICATED',
          'Authentication required',
        );
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Submission is forbidden',
        );
      throw e;
    }
  });
  app.get('/api/problems/:problemId/submissions', async (request, reply) =>
    listRoute(
      service,
      request,
      reply,
      await auth(request),
      project,
      (request.params as { problemId: string }).problemId,
    ),
  );
}
async function listRoute(
  service: SubmissionService,
  request: FastifyRequest,
  reply: FastifyReply,
  context: AuthContext | undefined,
  project: (submission: Submission) => Promise<Submission>,
  problemId?: string,
) {
  const query = request.query as Record<string, unknown>;
  const limit = Number(query.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid pagination');
  try {
    const listQuery = {
      limit,
      ...(typeof query.cursor === 'string' ? { cursor: query.cursor } : {}),
      ...(problemId ? { problemId } : {}),
    };
    const result = await service.list(listQuery, context);
    return reply.send({
      items: await Promise.all(result.items.map(project)),
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHENTICATED')
      return error(
        reply,
        request,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    if (e instanceof Error && e.message === 'FORBIDDEN')
      return error(
        reply,
        request,
        403,
        'FORBIDDEN',
        'Submission list is forbidden',
      );
    if (e instanceof Error && e.message === 'VALIDATION_ERROR')
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    throw e;
  }
}
