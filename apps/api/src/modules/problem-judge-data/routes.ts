/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthContext } from '../problem/model.js';
import { JudgeDataError } from './model.js';
import type { ProblemJudgeDataService } from './service.js';
export async function registerProblemJudgeDataRoutes(
  app: FastifyInstance,
  options: {
    service: ProblemJudgeDataService;
    getAuth: (r: FastifyRequest) => Promise<AuthContext | undefined>;
  },
) {
  const auth = options.getAuth;
  const run = async (
    fn: () => Promise<unknown>,
    reply: any,
    request: FastifyRequest,
  ) => {
    try {
      return reply.send(await fn());
    } catch (e) {
      if (e instanceof JudgeDataError)
        return reply
          .status(e.status)
          .send({ code: e.code, message: e.message, requestId: request.id });
      const code = (e as { code?: unknown })?.code;
      if (
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        (typeof code === 'string' && code.startsWith('08'))
      )
        return reply.status(503).send({
          code: 'DB_UNAVAILABLE',
          message: 'Database unavailable',
          requestId: request.id,
        });
      throw e;
    }
  };
  const csrf = (r: FastifyRequest) => {
    const t = r.headers['x-csrf-token'];
    return (
      typeof t === 'string' &&
      r.headers.cookie
        ?.split(';')
        .some((cookie) => cookie.trim() === `oj_csrf=${t}`)
    );
  };
  const mutate = async (r: any, reply: any, fn: () => Promise<unknown>) =>
    csrf(r)
      ? run(fn, reply, r)
      : reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'CSRF validation failed',
          requestId: r.id,
        });
  app.get('/api/problems/:problemId/judge-data', async (r, reply) =>
    run(
      () => options.service.draft((r.params as any).problemId, auth(r)),
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/metadata', async (r, reply) =>
    run(
      () => options.service.metadata((r.params as any).problemId, auth(r)),
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/draft', async (r, reply) =>
    run(
      () => options.service.draft((r.params as any).problemId, auth(r)),
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/versions', async (r, reply) =>
    run(
      () => options.service.versions((r.params as any).problemId, auth(r)),
      reply,
      r,
    ),
  );
  app.get(
    '/api/problems/:problemId/judge-data/versions/:versionId',
    async (r, reply) =>
      run(
        () => {
          const x = r.params as any;
          return options.service.version(x.problemId, x.versionId, auth(r));
        },
        reply,
        r,
      ),
  );
  app.get(
    '/api/problems/:problemId/judge-data/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return run(
        () => options.service.testcase(x.problemId, x.testcaseId, auth(r)),
        reply,
        r,
      );
    },
  );
  app.put(
    '/api/problems/:problemId/judge-data/draft/config',
    async (r, reply) =>
      mutate(r, reply, () =>
        options.service.saveConfig(
          (r.params as any).problemId,
          r.body,
          auth(r),
        ),
      ),
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/testcases',
    async (r, reply) => {
      const p = (r.params as any).problemId;
      return mutate(r, reply, () =>
        options.service.addTestcase(p, r.body, auth(r)),
      );
    },
  );
  app.patch(
    '/api/problems/:problemId/judge-data/draft/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return mutate(r, reply, () =>
        options.service.updateTestcase(
          x.problemId,
          x.testcaseId,
          r.body,
          auth(r),
        ),
      );
    },
  );
  app.delete(
    '/api/problems/:problemId/judge-data/draft/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return mutate(r, reply, () =>
        options.service.deleteTestcase(x.problemId, x.testcaseId, auth(r)),
      );
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/upload',
    async (r, reply) => {
      const b = r.body as any;
      return mutate(r, reply, () =>
        options.service.addPair(
          (r.params as any).problemId,
          Buffer.from(String(b?.inputBase64 ?? ''), 'base64'),
          Buffer.from(String(b?.outputBase64 ?? ''), 'base64'),
          {
            input: String(b?.inputFileName ?? 'input.in'),
            output: String(b?.outputFileName ?? 'output.out'),
          },
          auth(r),
        ),
      );
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/upload-zip',
    async (r, reply) => {
      const b = r.body as any;
      return mutate(r, reply, () =>
        options.service.addZip(
          (r.params as any).problemId,
          Buffer.from(String(b?.zipBase64 ?? ''), 'base64'),
          auth(r),
        ),
      );
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/validate',
    async (r, reply) =>
      mutate(r, reply, () =>
        options.service.validate((r.params as any).problemId, auth(r)),
      ),
  );
  app.post('/api/problems/:problemId/judge-data/publish', async (r, reply) =>
    mutate(r, reply, () =>
      options.service.publish(
        (r.params as any).problemId,
        auth(r),
        (r.body as any)?.revision,
      ),
    ),
  );
}
