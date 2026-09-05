import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthContext,
  ProblemRevisionResolver,
  GlobalEvaluationListItem,
  GlobalSubmissionListQuery,
  SubmissionEvaluationStatus,
  SubmissionVerdict,
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
import {
  EvaluationEventHub,
  type EvaluationEvent,
  type EvaluationEventBus,
} from './events.js';

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
  retryDispatch?: (submission: Submission) => Promise<void>;
  onRejudge?: (submission: Submission) => Promise<void> | void;
  evaluationHistory?: (
    submissionId: string,
  ) => Promise<
    Awaited<
      ReturnType<NonNullable<SubmissionRepository['listEvaluationHistory']>>
    >
  >;
  projectGlobalListItem?: (
    submission: Submission,
  ) => Promise<Pick<GlobalEvaluationListItem, 'problem' | 'submitter'>>;
  eventHub?: EvaluationEventBus;
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
  const repository = context.repository ?? new InMemorySubmissionRepository();
  const eventHub = context.eventHub ?? new EvaluationEventHub();
  const service = new SubmissionService(
    repository,
    context.authorizationPolicy,
    context.problemResolver,
    context.judgeDataResolver,
    context.guardCreate,
  );
  const project = async (submission: Submission) => {
    const projected = context.projectJudge
      ? { ...submission, ...(await context.projectJudge(submission)) }
      : submission;
    const evaluation = await repository.getEvaluation?.(submission.id);
    if (evaluation) eventHub.publish(evaluation);
    return projected;
  };
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
    let createdSubmissionId: string | undefined;
    try {
      return reply.status(201).send(
        await project(
          await (async () => {
            const submission = await service.create(
              request.body,
              await auth(request),
              request.id,
            );
            createdSubmissionId = submission.id;
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
          createdSubmissionId
            ? { submissionId: createdSubmissionId }
            : undefined,
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
  app.post('/api/submissions/:id/retry-dispatch', async (request, reply) => {
    const contextAuth = await auth(request);
    if (!contextAuth)
      return error(
        reply,
        request,
        401,
        'UNAUTHENTICATED',
        'Authentication required',
      );
    const submission = await repository.get(
      (request.params as { id: string }).id,
    );
    if (!submission || submission.ownerUserId !== contextAuth.userId)
      return error(reply, request, 404, 'NOT_FOUND', 'Submission not found');
    if (!context.retryDispatch)
      return error(
        reply,
        request,
        503,
        'JUDGE_DISPATCH_UNAVAILABLE',
        'Dispatch unavailable',
      );
    await context.guardCreate?.(contextAuth);
    try {
      await context.retryDispatch(submission);
    } catch (cause) {
      const failure = cause as { code?: string; status?: number };
      return error(
        reply,
        request,
        failure.status ?? 503,
        failure.code ?? 'JUDGE_DISPATCH_UNAVAILABLE',
        'Dispatch retry failed',
      );
    }
    return project((await repository.get(submission.id))!);
  });
  app.get('/api/submissions', async (request, reply) =>
    listRoute(service, request, reply, await auth(request), project),
  );
  app.get('/api/evaluations', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const limit = Number(query.limit ?? 20);
    const status =
      typeof query.status === 'string' ? query.status.toUpperCase() : undefined;
    const verdict =
      typeof query.verdict === 'string'
        ? query.verdict.toUpperCase()
        : undefined;
    const allowedStatuses = new Set([
      'QUEUED',
      'RUNNING',
      'COMPLETED_WITH_VERDICT',
      'CANCELLED',
      'INFRA_FAILED',
      'NO_VERDICT',
      'INCOMPLETE',
      'REJUDGE_PENDING',
      'REJUDGING',
    ]);
    const allowedVerdicts = new Set(['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE']);
    const stringFilter = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (status && !allowedStatuses.has(status)) ||
      (verdict && !allowedVerdicts.has(verdict))
    )
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid query');
    try {
      const listQuery: GlobalSubmissionListQuery = { limit };
      const cursor = stringFilter(query.cursor);
      const problemId = stringFilter(query.problemId);
      const submitterId = stringFilter(query.submitterId);
      const languageId = stringFilter(query.language);
      if (cursor) listQuery.cursor = cursor;
      if (problemId) listQuery.problemId = problemId;
      if (submitterId) listQuery.ownerUserId = submitterId;
      if (languageId) listQuery.languageId = languageId;
      if (status)
        listQuery.evaluationStatus = status as SubmissionEvaluationStatus;
      if (verdict) listQuery.verdict = verdict as SubmissionVerdict;
      const result = await service.listGlobal(listQuery, await auth(request));
      const items = await Promise.all(
        result.items.map(async (submission) => {
          const [metadata, evaluation] = await Promise.all([
            context.projectGlobalListItem
              ? context.projectGlobalListItem(submission)
              : Promise.resolve({
                  problem: {
                    id: submission.problemId,
                    slug: submission.problemId,
                    title: 'Unavailable',
                  },
                  submitter: {
                    id: submission.ownerUserId,
                    displayName: 'User',
                  },
                }),
            repository.getEvaluation?.(submission.id),
          ]);
          return {
            submissionId: submission.id,
            ...(evaluation?.publicNumber !== undefined
              ? { publicNumber: evaluation.publicNumber }
              : {}),
            ...metadata,
            languageProfileId: submission.languageId,
            status: evaluation?.status ?? submission.status,
            ...(evaluation?.verdict ? { verdict: evaluation.verdict } : {}),
            createdAt: submission.createdAt,
            ...(evaluation?.completedAt
              ? { completedAt: evaluation.completedAt }
              : {}),
            ...(evaluation?.detail?.totalTimeMs !== undefined
              ? { totalTimeMs: evaluation.detail.totalTimeMs }
              : {}),
            ...(evaluation?.detail?.peakMemoryBytes !== undefined
              ? { peakMemoryBytes: evaluation.detail.peakMemoryBytes }
              : {}),
          } satisfies GlobalEvaluationListItem;
        }),
      );
      return reply.send({ items, nextCursor: result.nextCursor ?? null });
    } catch (e) {
      if (e instanceof Error && e.message === 'FORBIDDEN')
        return error(
          reply,
          request,
          403,
          'FORBIDDEN',
          'Evaluation list is forbidden',
        );
      if (e instanceof Error && e.message === 'VALIDATION_ERROR')
        return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid query');
      throw e;
    }
  });
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
    '/api/submissions/:id/evaluations/:generation/stream',
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
        const evaluation = await repository.getEvaluation?.(submission.id);
        if (!evaluation || evaluation.evaluationGeneration !== generation)
          return error(
            reply,
            request,
            404,
            'NOT_FOUND',
            'Evaluation not found',
          );
        const header = request.headers['last-event-id'];
        const afterId =
          typeof header === 'string' && /^\d+$/.test(header)
            ? Number(header)
            : undefined;
        reply.hijack();
        const raw = reply.raw;
        raw.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        const subscription: { unsubscribe: () => void; replayGap: boolean } = {
          unsubscribe: () => undefined,
          replayGap: false,
        };
        let closed = false;
        const cleanup = () => {
          closed = true;
          subscription.unsubscribe();
          if (!raw.destroyed) raw.end();
        };
        const write = (event: EvaluationEvent) => {
          if (event.evaluationGeneration !== generation) return;
          raw.write(
            `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
          if (event.type === 'evaluation.terminal') cleanup();
        };
        const registered = eventHub.subscribe(submission.id, afterId, write);
        subscription.replayGap = registered.replayGap;
        subscription.unsubscribe = registered.unsubscribe;
        if (closed) cleanup();
        else eventHub.publish(evaluation);
        if (subscription.replayGap)
          raw.write('event: replay-gap\ndata: {"refresh":true}\n\n');
        raw.once('close', cleanup);
        return reply;
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
            'Evaluation stream is forbidden',
          );
        throw e;
      }
    },
  );
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
