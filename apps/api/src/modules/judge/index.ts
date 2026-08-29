export * from './model.js';
export * from './repository.js';
export * from './service.js';
export * from './safety.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthContext } from '../submission/model.js';
import type {
  JudgeAuthorizationPolicy,
  JudgeAuthorizationUser,
} from '../authz/judge.js';
import type { JudgeJobRepository } from './model.js';

export type JudgeModuleContext = {
  repository: JudgeJobRepository;
  authorizationPolicy: JudgeAuthorizationPolicy;
  getAuthContext?: (
    request: FastifyRequest,
  ) => AuthContext | undefined | Promise<AuthContext | undefined>;
};

export async function registerJudgeModule(
  app: FastifyInstance,
  context: JudgeModuleContext,
) {
  const authUser = async (
    request: FastifyRequest,
  ): Promise<JudgeAuthorizationUser | undefined> => {
    const value = context.getAuthContext
      ? await context.getAuthContext(request)
      : undefined;
    return value
      ? {
          userId: value.userId,
          status: 'active',
          ...(value.sessionId ? { sessionId: value.sessionId } : {}),
          strength: 'password',
        }
      : undefined;
  };
  app.get('/api/judge/jobs/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const job = await context.repository.getById(id);
    if (!job)
      return reply.status(404).send({
        code: 'NOT_FOUND',
        message: 'Judge job not found',
        requestId: request.id,
      });
    const allowed = await context.authorizationPolicy.canViewJudgeJob(
      await authUser(request),
      {
        id: job.id,
        submissionId: job.submissionId,
        ownerUserId: job.ownerUserId,
        state:
          job.status === 'LEASED'
            ? 'LEASED_FAKE'
            : job.status === 'COMPLETED'
              ? 'SUCCEEDED_FAKE'
              : job.status === 'RETRYABLE_FAILURE'
                ? 'FAILED_RETRYABLE'
                : job.status === 'TERMINAL_FAILURE'
                  ? 'FAILED_TERMINAL'
                  : job.status,
        attemptNumber: job.attempt,
      },
      request.id,
    );
    if (!allowed)
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Judge job access forbidden',
        requestId: request.id,
      });
    return reply.send(job);
  });
}
