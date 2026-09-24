/**
 * The operator AI diagnostics surface.
 *
 * `GET /api/ai/capabilities` — the *only* HTTP route the AI module exposes in Stage 6. It
 * answers "is AI available, why not, and what would callers see" for an operator. It is
 * deliberately **not** an execution endpoint: there is no route that accepts a prompt from the
 * network, and there never will be one outside an approved capability design — the browser
 * never holds an AI credential and no public arbitrary raw-prompt proxy exists (stage
 * requirement). Consumers are server-side modules and plugins holding broker-minted clients.
 *
 * The gate follows the worker-control pattern: authenticated session + operator membership.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AiModuleHandle } from './index.js';

export type AiAuthContext = {
  readonly userId: string;
};

export type AiRoutesDeps = {
  readonly aiModule: AiModuleHandle;
  readonly getAuthContext: (
    request: FastifyRequest,
  ) => Promise<AiAuthContext | undefined>;
  readonly operatorUserIds?: ReadonlySet<string>;
};

export function registerAiRoutes(
  app: FastifyInstance,
  deps: AiRoutesDeps,
): void {
  app.get('/api/ai/capabilities', async (request, reply) => {
    const auth = await deps.getAuthContext(request);
    if (auth === undefined) {
      return reply.status(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: request.id,
      });
    }
    if (!(deps.operatorUserIds?.has(auth.userId) ?? false)) {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'AI diagnostics require an operator account',
        requestId: request.id,
      });
    }
    const broker = deps.aiModule.broker;
    return reply.send({
      module: deps.aiModule.status(),
      subjectTokens: { stability: deps.aiModule.subjectTokens.stability },
      broker: {
        providers: broker.listProviders(),
        killSwitch: broker.getKillSwitch(),
        capabilities: broker.listAvailableCapabilities(),
      },
      requestId: request.id,
    });
  });
}
