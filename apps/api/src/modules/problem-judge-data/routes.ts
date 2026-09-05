/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import type { AuthContext } from '../problem/model.js';
import { JudgeDataError } from './model.js';
import type { ProblemJudgeDataService } from './service.js';
import { MAX_UPLOAD_BODY_BYTES, MAX_TESTCASE_PAYLOAD_BYTES } from './limits.js';

const decodedBase64Length = (value: string) => {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
};
const isBase64 = (value: string) => {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 61) {
      padding += 1;
      if (index < value.length - 2 || padding > 2) return false;
      continue;
    }
    if (
      padding > 0 ||
      !(
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        (code >= 48 && code <= 57) ||
        code === 43 ||
        code === 47
      )
    )
      return false;
  }
  return true;
};
const decodeBase64 = (value: unknown, limit: number, message: string) => {
  if (
    typeof value !== 'string' ||
    !isBase64(value) ||
    decodedBase64Length(value) > limit
  )
    throw new JudgeDataError('UPLOAD_TOO_LARGE', message, 413);
  return Buffer.from(value, 'base64');
};
export async function registerProblemJudgeDataRoutes(
  app: FastifyInstance,
  options: {
    service: ProblemJudgeDataService;
    getAuth: (r: FastifyRequest) => Promise<AuthContext | undefined>;
    resolveProblemId?: (key: string) => Promise<string | undefined>;
  },
) {
  app.addContentTypeParser(
    ['application/zip', 'application/octet-stream'],
    {},
    (_request, payload, done) => done(null, payload),
  );
  const auth = options.getAuth;
  const problemId = async (request: FastifyRequest) => {
    const key = String((request.params as { problemId?: unknown }).problemId);
    return (await options.resolveProblemId?.(key)) ?? key;
  };
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
      async () =>
        (await options.service.draft(await problemId(r), await auth(r))) ??
        null,
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/metadata', async (r, reply) =>
    run(
      async () => options.service.metadata(await problemId(r), await auth(r)),
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/draft', async (r, reply) =>
    run(
      async () =>
        (await options.service.draft(await problemId(r), await auth(r))) ??
        null,
      reply,
      r,
    ),
  );
  app.get('/api/problems/:problemId/judge-data/versions', async (r, reply) =>
    run(
      async () => options.service.versions(await problemId(r), await auth(r)),
      reply,
      r,
    ),
  );
  app.get(
    '/api/problems/:problemId/judge-data/versions/:versionId',
    async (r, reply) =>
      run(
        async () => {
          const x = r.params as any;
          return options.service.version(
            await problemId(r),
            x.versionId,
            await auth(r),
          );
        },
        reply,
        r,
      ),
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/from-latest',
    async (r, reply) =>
      mutate(r, reply, async () =>
        options.service.createDraftFromLatestVersion(
          await problemId(r),
          await auth(r),
        ),
      ),
  );
  app.get(
    '/api/problems/:problemId/judge-data/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return run(
        async () =>
          options.service.testcase(
            await problemId(r),
            x.testcaseId,
            await auth(r),
          ),
        reply,
        r,
      );
    },
  );
  app.put(
    '/api/problems/:problemId/judge-data/draft/config',
    async (r, reply) =>
      mutate(r, reply, async () =>
        options.service.saveConfig(await problemId(r), r.body, await auth(r)),
      ),
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/testcases',
    async (r, reply) => {
      const p = await problemId(r);
      return mutate(r, reply, async () =>
        options.service.addTestcase(p, r.body, await auth(r)),
      );
    },
  );
  app.patch(
    '/api/problems/:problemId/judge-data/draft/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return mutate(r, reply, async () =>
        options.service.updateTestcase(
          await problemId(r),
          x.testcaseId,
          r.body,
          await auth(r),
        ),
      );
    },
  );
  app.delete(
    '/api/problems/:problemId/judge-data/draft/testcases/:testcaseId',
    async (r, reply) => {
      const x = r.params as any;
      return mutate(r, reply, async () =>
        options.service.deleteTestcase(
          await problemId(r),
          x.testcaseId,
          await auth(r),
        ),
      );
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/upload',
    { bodyLimit: MAX_UPLOAD_BODY_BYTES },
    async (r, reply) => {
      const b = r.body as any;
      return mutate(r, reply, async () =>
        options.service.addPair(
          await problemId(r),
          decodeBase64(
            b?.inputBase64,
            MAX_TESTCASE_PAYLOAD_BYTES,
            'Input upload too large',
          ),
          decodeBase64(
            b?.outputBase64,
            MAX_TESTCASE_PAYLOAD_BYTES,
            'Output upload too large',
          ),
          {
            input: String(b?.inputFileName ?? 'input.in'),
            output: String(b?.outputFileName ?? 'output.out'),
          },
          await auth(r),
        ),
      );
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/upload-zip',
    { bodyLimit: 1024 * 1024 },
    async (r, reply) => {
      const contentType = (
        String(r.headers['content-type'] ?? '').split(';', 1)[0] ?? ''
      )
        .trim()
        .toLowerCase();
      const b = r.body as any;
      return mutate(r, reply, async () => {
        const id = await problemId(r);
        const user = await auth(r);
        if (
          contentType !== 'application/zip' &&
          contentType !== 'application/octet-stream'
        )
          return options.service.addZip(
            id,
            decodeBase64(b?.zipBase64, 1024 * 1024, 'Use raw ZIP upload'),
            user,
          );
        const controller = new AbortController();
        const aborted = () => controller.abort();
        r.raw.once('aborted', aborted);
        try {
          if (!(r.body instanceof Readable))
            throw new JudgeDataError('UNSAFE_ARCHIVE', 'Invalid ZIP stream');
          return await options.service.addZipStream(
            id,
            r.body,
            user,
            controller.signal,
          );
        } finally {
          r.raw.off('aborted', aborted);
        }
      });
    },
  );
  app.post(
    '/api/problems/:problemId/judge-data/draft/validate',
    async (r, reply) =>
      mutate(r, reply, async () =>
        options.service.validate(await problemId(r), await auth(r)),
      ),
  );
  app.post('/api/problems/:problemId/judge-data/publish', async (r, reply) =>
    mutate(r, reply, async () =>
      options.service.publish(
        await problemId(r),
        await auth(r),
        (r.body as any)?.revision,
      ),
    ),
  );
}
