/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from 'fastify';
import { JudgeAdminUpstreamError } from './adapter.js';
import type { JudgeAdminRouteOptions, MutationInput } from './model.js';
const errorMap = (e: unknown) => {
  if (!(e instanceof JudgeAdminUpstreamError))
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  if (e.status === 404)
    return {
      status: 404,
      code: 'JUDGE_NODE_NOT_FOUND',
      message: 'Judge node not found',
    };
  if (e.status === 504)
    return {
      status: 504,
      code: 'JUDGE_SERVICE_TIMEOUT',
      message: 'Judge Service timed out',
    };
  if (e.status === 409 && e.upstreamCode === 'STALE_CONTROL_VERSION')
    return {
      status: 409,
      code: 'JUDGE_NODE_STALE_INCARNATION',
      message: 'Judge node state is stale',
    };
  if (e.status === 409 && e.upstreamCode === 'CONTROL_VERSION_CONFLICT')
    return {
      status: 409,
      code: 'JUDGE_NODE_CONTROL_CONFLICT',
      message: 'Judge node control version conflicts',
    };
  if (e.status === 409)
    return {
      status: 409,
      code: 'JUDGE_NODE_INVALID_TRANSITION',
      message: 'Invalid judge node transition',
    };
  return {
    status: 502,
    code: 'JUDGE_SERVICE_UNAVAILABLE',
    message: 'Judge Service unavailable',
  };
};
export async function registerJudgeAdminRoutes(
  app: FastifyInstance,
  o: JudgeAdminRouteOptions,
) {
  const idempotent = new Map<
    string,
    { fingerprint: string; result: unknown }
  >();
  const read = async (request: any, reply: any) => {
    const ctx = await o.getAuthContext(request);
    if (!(await o.can(ctx, 'judge.view')))
      return reply.status(ctx ? 403 : 401).send({
        code: ctx ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: request.id,
      });
    return ctx;
  };
  const query = (r: any) => ({
    limit: Math.min(100, Math.max(1, Number(r.query?.limit ?? 25) || 25)),
    ...(typeof r.query?.cursor === 'string' ? { cursor: r.query.cursor } : {}),
  });
  const routes: Array<[string, (a: any) => Promise<unknown>]> = [
    ['/summary', () => o.adapter.summary()],
    ['/nodes', (r) => o.adapter.nodes(query(r))],
    ['/metrics', () => o.adapter.metrics()],
  ];
  for (const [path, fn] of routes)
    app.get(`/api/admin/judge${path}`, async (r, reply) => {
      if (!(await read(r, reply))) return;
      try {
        return reply.send(await fn(r));
      } catch (e) {
        const x = errorMap(e);
        return reply
          .status(x.status)
          .send({ code: x.code, message: x.message, requestId: r.id });
      }
    });
  for (const suffix of ['', '/assignments', '/jobs', '/failures'])
    app.get(
      `/api/admin/judge/nodes/:nodeId${suffix}`,
      async (r: any, reply) => {
        if (!(await read(r, reply))) return;
        try {
          const id = r.params.nodeId;
          const value =
            suffix === ''
              ? await o.adapter.node(id)
              : await (o.adapter as any)[suffix.slice(1)](id, query(r));
          return reply.send(value);
        } catch (e) {
          const x = errorMap(e);
          return reply
            .status(x.status)
            .send({ code: x.code, message: x.message, requestId: r.id });
        }
      },
    );
  app.get(
    '/api/admin/judge/assignments/:assignmentId',
    async (r: any, reply) => {
      if (!(await read(r, reply))) return;
      try {
        return reply.send(await o.adapter.assignment(r.params.assignmentId));
      } catch (e) {
        const x = errorMap(e);
        return reply
          .status(x.status)
          .send({ code: x.code, message: x.message, requestId: r.id });
      }
    },
  );
  for (const action of ['drain', 'offline', 'enable'] as const)
    app.post(
      `/api/admin/judge/nodes/:nodeId/${action}`,
      async (r: any, reply) => {
        const ctx = await o.getAuthContext(r);
        const body = r.body as Partial<MutationInput>;
        const correlationId = String(
          r.headers['x-correlation-id'] ?? crypto.randomUUID(),
        );
        const base = {
          actorUserId: ctx?.userId ?? 'anonymous',
          permission: 'judge.manage',
          action,
          nodeId: r.params.nodeId,
          requestId: r.id,
          correlationId,
          occurredAt: new Date().toISOString(),
          outcome: 'denied' as const,
        };
        if (!ctx) {
          await o.audit.record(base);
          return reply.status(401).send({
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            requestId: r.id,
          });
        }
        if (!(await o.can(ctx, 'judge.manage'))) {
          await o.audit.record({ ...base, actorUserId: ctx.userId });
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'Judge management forbidden',
            requestId: r.id,
          });
        }
        const csrf = o.csrf
          ? o.csrf(r)
          : r.headers['x-csrf-token'] &&
            r.headers.cookie?.includes(`oj_csrf=${r.headers['x-csrf-token']}`);
        if (!csrf) {
          await o.audit.record({
            ...base,
            actorUserId: ctx.userId,
            outcome: 'denied',
            errorCode: 'CSRF_REQUIRED',
          });
          return reply.status(403).send({
            code: 'CSRF_REQUIRED',
            message: 'CSRF validation failed',
            requestId: r.id,
          });
        }
        if (
          typeof body?.reason !== 'string' ||
          !body.reason.trim() ||
          typeof body.expectedIncarnation !== 'string' ||
          typeof body.expectedControlVersion !== 'number' ||
          typeof body.idempotencyKey !== 'string' ||
          !body.idempotencyKey.trim()
        ) {
          await o.audit.record({
            ...base,
            actorUserId: ctx.userId,
            errorCode: 'VALIDATION_ERROR',
          });
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Invalid mutation request',
            requestId: r.id,
          });
        }
        const fingerprint = JSON.stringify([action, r.params.nodeId, body]);
        const prior = idempotent.get(body.idempotencyKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            return reply.status(409).send({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency key was already used',
              requestId: r.id,
            });
          return reply.send(prior.result);
        }
        try {
          const result = await o.adapter.mutate(
            action,
            r.params.nodeId,
            body as MutationInput,
            { requestId: r.id, correlationId },
          );
          idempotent.set(body.idempotencyKey, { fingerprint, result });
          await o.audit.record({
            ...base,
            actorUserId: ctx.userId,
            outcome: 'success',
            expectedIncarnation: body.expectedIncarnation,
            expectedControlVersion: body.expectedControlVersion,
            reason: body.reason,
            idempotencyKey: body.idempotencyKey,
            afterState: result,
          });
          return reply.send(result);
        } catch (e) {
          const x = errorMap(e);
          await o.audit.record({
            ...base,
            actorUserId: ctx.userId,
            outcome: 'failure',
            expectedIncarnation: body.expectedIncarnation,
            expectedControlVersion: body.expectedControlVersion,
            reason: body.reason,
            idempotencyKey: body.idempotencyKey,
            errorCode: x.code,
          });
          return reply
            .status(x.status)
            .send({ code: x.code, message: x.message, requestId: r.id });
        }
      },
    );
}
