import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '../auth/types.js';
import { EditorDraftConflictError, EditorDraftValidationError } from './model.js';
import { InMemoryEditorDraftRepository, type EditorDraftRepository } from './repository.js';

export type EditorDraftModuleContext = {
  repository?: EditorDraftRepository;
  getAuthContext?: (request: FastifyRequest) => AuthContext | undefined | Promise<AuthContext | undefined>;
  resolveProblemId?: (key: string) => string | undefined | Promise<string | undefined>;
};
const error = (reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string, details?: unknown) =>
  reply.status(status).send({ code, message, requestId: request.id, ...(details === undefined ? {} : { details }) });
const csrf = (request: FastifyRequest) => {
  const token = request.headers['x-csrf-token'];
  return typeof token === 'string' && request.headers.cookie?.split(';').some((item) => item.trim() === `oj_csrf=${token}`);
};
export async function registerEditorDraftModule(app: FastifyInstance, context: EditorDraftModuleContext) {
  const repository = context.repository ?? new InMemoryEditorDraftRepository();
  const auth = async (request: FastifyRequest) => context.getAuthContext ? await context.getAuthContext(request) : undefined;
  const resolve = async (key: string) => context.resolveProblemId ? await context.resolveProblemId(key) : key;
  const readParams = (request: FastifyRequest) => {
    const params = request.params as { problemId?: string; idOrSlug?: string; language?: string };
    const query = request.query as { language?: string };
    return { problemKey: params.problemId ?? params.idOrSlug ?? '', language: params.language ?? query.language ?? '' };
  };
  const get = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await auth(request);
    if (!actor) return error(reply, request, 401, 'UNAUTHENTICATED', 'Authentication required');
    const { problemKey, language } = readParams(request);
    const problemId = await resolve(problemKey);
    if (!problemId || !language) return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid draft identity');
    const draft = await repository.get(actor.userId, problemId, language);
    return reply.send(draft ?? null);
  };
  const save = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await auth(request);
    if (!actor) return error(reply, request, 401, 'UNAUTHENTICATED', 'Authentication required');
    if (!csrf(request)) return error(reply, request, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const { problemKey, language } = readParams(request);
    const problemId = await resolve(problemKey);
    if (!problemId) return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
    const body = request.body as { source?: unknown; version?: unknown };
    try {
      const draft = await repository.save({ userId: actor.userId, problemId: problemId ?? '', language, source: body?.source as string, expectedVersion: body?.version === null || body?.version === undefined ? null : Number(body.version) });
      return reply.send(draft);
    } catch (cause) {
      if (cause instanceof EditorDraftValidationError) return error(reply, request, 400, 'VALIDATION_ERROR', cause.message);
      if (cause instanceof EditorDraftConflictError) return error(reply, request, 409, 'DRAFT_CONFLICT', cause.message, cause.current ? { current: cause.current } : undefined);
      if (cause instanceof Error && cause.message === '23503') return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
      throw cause;
    }
  };
  app.get('/api/editor/drafts/:problemId/:language', get);
  app.put('/api/editor/drafts/:problemId/:language', save);
  app.get('/api/problems/:idOrSlug/draft', get);
  app.put('/api/problems/:idOrSlug/draft', save);
}
