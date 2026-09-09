/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AssignmentService } from './service.js';

export async function registerAssignmentModule(
  app: FastifyInstance,
  options: {
    service: AssignmentService;
    getAuth: (
      request: FastifyRequest,
    ) => Promise<{ userId: string } | undefined>;
  },
) {
  const project = (value: any): any => {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    const copy = { ...value };
    const problems = copy.problems;
    delete copy.id;
    delete copy.teamId;
    delete copy.createdBy;
    delete copy.problemId;
    delete copy.problems;
    return {
      ...copy,
      ...(problems ? { problems: problems.map(project) } : {}),
    };
  };
  const auth = async (request: FastifyRequest) => {
    const value = await options.getAuth(request);
    if (!value)
      throw Object.assign(new Error('UNAUTHENTICATED'), {
        code: 'UNAUTHENTICATED',
        status: 401,
      });
    return value;
  };
  const params = (request: FastifyRequest) =>
    request.params as { slug?: string; publicId?: string };
  const body = (request: FastifyRequest) =>
    request.body as Record<string, unknown>;
  const csrf = (request: FastifyRequest) => {
    const token = request.headers['x-csrf-token'];
    if (
      typeof token !== 'string' ||
      !request.headers.cookie
        ?.split(';')
        .some((item) => item.trim() === `oj_csrf=${token}`)
    )
      throw Object.assign(new Error('CSRF_INVALID'), {
        code: 'CSRF_INVALID',
        status: 403,
      });
  };
  const run = async (
    request: FastifyRequest,
    reply: any,
    action: () => Promise<unknown>,
  ) => {
    try {
      return reply.send(await action());
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'ASSIGNMENT_ERROR',
        message: (e as Error).message,
        requestId: request.id,
      });
    }
  };
  app.post('/api/teams/:slug/assignments', async (request, reply) => {
    try {
      csrf(request);
      const actor = await auth(request);
      const b = body(request);
      return reply.status(201).send(
        project(
          await options.service.create(params(request).slug!, actor, {
            title: String(b.title ?? ''),
            description: b.description == null ? '' : String(b.description),
            startsAt: b.startsAt == null ? null : String(b.startsAt),
            dueAt: b.dueAt == null ? null : String(b.dueAt),
            problemIds: Array.isArray(b.problemIds)
              ? b.problemIds.map(String)
              : [],
            status: b.status as any,
          }),
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'ASSIGNMENT_ERROR',
        message: (e as Error).message,
        requestId: request.id,
      });
    }
  });
  app.get('/api/teams/:slug/assignments', async (request, reply) =>
    run(request, reply, async () =>
      project(
        await options.service.listTeam(
          params(request).slug!,
          (await auth(request)).userId,
        ),
      ),
    ),
  );
  app.get('/api/assignments/mine', async (request, reply) =>
    run(request, reply, async () => ({
      items: project(
        await options.service.listMine((await auth(request)).userId),
      ),
    })),
  );
  app.get('/api/assignments/:publicId', async (request, reply) =>
    run(request, reply, async () =>
      project(
        await options.service.get(
          params(request).publicId!,
          (await auth(request)).userId,
        ),
      ),
    ),
  );
  app.patch('/api/assignments/:publicId', async (request, reply) => {
    try {
      csrf(request);
      const actor = await auth(request);
      const b = body(request);
      return reply.send(
        project(
          await options.service.update(
            params(request).publicId!,
            actor.userId,
            {
              ...(b.title === undefined ? {} : { title: String(b.title) }),
              ...(b.description === undefined
                ? {}
                : { description: String(b.description) }),
              ...(b.startsAt === undefined
                ? {}
                : { startsAt: b.startsAt == null ? null : String(b.startsAt) }),
              ...(b.dueAt === undefined
                ? {}
                : { dueAt: b.dueAt == null ? null : String(b.dueAt) }),
              ...(Array.isArray(b.problemIds)
                ? { problemIds: b.problemIds.map(String) }
                : {}),
            },
          ),
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'ASSIGNMENT_ERROR',
        message: (e as Error).message,
        requestId: request.id,
      });
    }
  });
  for (const [path, status] of [
    ['publish', 'PUBLISHED'],
    ['close', 'CLOSED'],
  ] as const)
    app.post(`/api/assignments/:publicId/${path}`, async (request, reply) => {
      try {
        csrf(request);
        return reply.send(
          project(
            await options.service.setStatus(
              params(request).publicId!,
              (await auth(request)).userId,
              status,
            ),
          ),
        );
      } catch (e) {
        return reply.status((e as any).status ?? 409).send({
          code: (e as any).code ?? 'ASSIGNMENT_ERROR',
          message: (e as Error).message,
          requestId: request.id,
        });
      }
    });
}
