import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthContext,
  ProblemRevisionResolver,
  Submission,
  SubmissionAuthorizationPolicy,
  SubmissionJudgeDataResolver,
} from './model.js';
import { SubmissionNotFoundError, SubmissionValidationError } from './model.js';
import {
  InMemorySubmissionRepository,
  type SubmissionRepository,
} from './repository.js';
import { SubmissionService } from './service.js';
import { LANGUAGE_CATALOG } from './languages.js';
import { publicSubmissionEvaluation } from './outcome.js';

export type SubmissionModuleContext = {
  repository?: SubmissionRepository;
  authorizationPolicy: SubmissionAuthorizationPolicy;
  problemResolver: ProblemRevisionResolver;
  judgeDataResolver?: SubmissionJudgeDataResolver;
  guardCreate?: (context: AuthContext) => Promise<void>;
  getAuthContext?: (
    request: FastifyRequest,
  ) => AuthContext | undefined | Promise<AuthContext | undefined>;
  projectJudge?: (submission: Submission) => Promise<Partial<Submission>>;
  onCreated?: (submission: Submission) => Promise<void> | void;
  onRejudge?: (submission: Submission) => Promise<void> | void;
  evaluationHistory?: (
    submissionId: string,
  ) => Promise<
    Awaited<
      ReturnType<NonNullable<SubmissionRepository['listEvaluationHistory']>>
    >
  >;
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
    context.judgeDataResolver,
    context.guardCreate,
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
      if (e instanceof Error && e.message === 'RATE_LIMITED')
        return error(
          reply,
          request,
          429,
          'RATE_LIMITED',
          'Submission rate limit exceeded',
        );
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        typeof e.code === 'string' &&
        'status' in e &&
        typeof e.status === 'number' &&
        e.status >= 400 &&
        e.status < 600
      )
        return error(
          reply,
          request,
          e.status,
          e.code,
          e instanceof Error ? e.message : 'Judge Data unavailable',
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
  app.post('/api/submissions/:id/rejudge', async (request, reply) => {
    try {
      const submission = await service.detail(
        (request.params as { id: string }).id,
        await auth(request),
      );
      if (!context.onRejudge)
        return error(
          reply,
          request,
          501,
          'NOT_IMPLEMENTED',
          'Rejudge is unavailable',
        );
      await context.onRejudge(submission);
      return reply.send(await project(submission));
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
        return error(reply, request, 403, 'FORBIDDEN', 'Rejudge is forbidden');
      if (
        e instanceof Error &&
        /EVALUATION_ALREADY_EXISTS|CONFLICT/.test(e.message)
      )
        return error(
          reply,
          request,
          409,
          'CONFLICT',
          'Rejudge conflicts with current evaluation',
        );
      throw e;
    }
  });
  app.get('/api/submissions/:id/evaluations', async (request, reply) => {
    try {
      const submission = await service.detail(
        (request.params as { id: string }).id,
        await auth(request),
      );
      const history = context.evaluationHistory
        ? await context.evaluationHistory(submission.id)
        : [];
      return reply.send({
        items: history.map((evaluation) =>
          publicSubmissionEvaluation(evaluation),
        ),
      });
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
          'Submission history is forbidden',
        );
      throw e;
    }
  });
  app.get(
    '/api/submissions/:id/evaluations/:generation',
    async (request, reply) => {
      try {
        const submission = await service.detail(
          (request.params as { id: string }).id,
          await auth(request),
        );
        const generation = Number(
          (request.params as { generation: string }).generation,
        );
        if (!Number.isSafeInteger(generation) || generation < 1)
          return error(
            reply,
            request,
            400,
            'VALIDATION_ERROR',
            'Invalid generation',
          );
        const history = context.evaluationHistory
          ? await context.evaluationHistory(submission.id)
          : [];
        const evaluation = history.find(
          (item) => item.evaluationGeneration === generation,
        );
        if (!evaluation)
          return error(
            reply,
            request,
            404,
            'NOT_FOUND',
            'Evaluation not found',
          );
        return reply.send({
          submission: {
            id: submission.id,
            languageId: submission.languageId,
            createdAt: submission.createdAt,
          },
          evaluation: publicSubmissionEvaluation(evaluation, true),
        });
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
            'Submission detail is forbidden',
          );
        throw e;
      }
    },
  );
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
