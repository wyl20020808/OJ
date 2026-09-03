/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from 'fastify';
import { JudgeAdminUpstreamError } from './adapter.js';
import type {
  AddNodeInput,
  JudgeAdminRouteOptions,
  LifecycleInput,
  ModeMutationInput,
  MutationInput,
  PolicyMutationInput,
} from './model.js';
const errorMap = (e: unknown) => {
  if (!(e instanceof JudgeAdminUpstreamError))
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  const code = e.upstreamCode;
  const known: Record<string, { status: number; message: string }> = {
    HOST_AGENT_UNAVAILABLE: { status: 503, message: 'Host Agent unavailable' },
    HOST_AGENT_UNAUTHORIZED: {
      status: 502,
      message: 'Host Agent authorization failed',
    },
    PROCESS_START_FAILED: {
      status: 502,
      message: 'Judge process failed to start',
    },
    PROCESS_STOP_FAILED: {
      status: 502,
      message: 'Judge process failed to stop',
    },
    PROCESS_IDENTITY_MISMATCH: {
      status: 409,
      message: 'Judge process identity mismatch',
    },
    TEMPLATE_NOT_FOUND: {
      status: 404,
      message: 'Judge node template not found',
    },
    TEMPLATE_DISABLED: {
      status: 409,
      message: 'Judge node template is disabled',
    },
    SLOT_NOT_FOUND: { status: 404, message: 'Judge node slot not found' },
    ACTIVE_JOBS: { status: 409, message: 'Judge node has active jobs' },
    DRAIN_TIMEOUT: { status: 504, message: 'Judge node drain timed out' },
    INVALID_POOL_POLICY: { status: 400, message: 'Invalid judge pool policy' },
    MIN_MAX_INVALID: { status: 400, message: 'Invalid judge pool node bounds' },
    HOST_CAPACITY_EXHAUSTED: {
      status: 409,
      message: 'Judge host capacity exhausted',
    },
    COOLDOWN_ACTIVE: { status: 409, message: 'Judge pool cooldown is active' },
    HOST_AGENT_TIMEOUT: { status: 504, message: 'Host Agent timed out' },
  };
  if (code && known[code])
    return { status: known[code].status, code, message: known[code].message };
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
const stateCount = (counts: unknown, state: string) =>
  counts && typeof counts === 'object' && !Array.isArray(counts)
    ? Number((counts as Record<string, unknown>)[state] ?? 0)
    : 0;
const productSummary = (value: any) => {
  if (!value || typeof value !== 'object') return value;
  const counts = value.countsByState;
  return {
    ...value,
    onlineCount: Number(value.onlineCount ?? stateCount(counts, 'ONLINE')),
    busyCount: Number(value.busyCount ?? stateCount(counts, 'BUSY')),
    drainingCount: Number(
      value.drainingCount ?? stateCount(counts, 'DRAINING'),
    ),
    offlineCount: Number(value.offlineCount ?? stateCount(counts, 'OFFLINE')),
    unhealthyCount: Number(
      value.unhealthyCount ?? stateCount(counts, 'UNHEALTHY'),
    ),
  };
};
const unsafeLifecycleKeys = new Set([
  'executablePath',
  'executable',
  'command',
  'commandArguments',
  'args',
  'shell',
  'env',
  'environment',
]);
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
    if (!request.headers.cookie?.match(/(?:^|; )oj_csrf=([^;]+)/)) {
      reply.header(
        'set-cookie',
        `oj_csrf=${encodeURIComponent(crypto.randomUUID())}; Path=/; SameSite=Lax`,
      );
    }
    return ctx;
  };
  app.get('/api/admin/judge/capabilities', async (request: any, reply: any) => {
    const ctx = await o.getAuthContext(request);
    return reply.send({ canView: Boolean(await o.can(ctx, 'judge.view')) });
  });
  const query = (r: any) => ({
    limit: Math.min(100, Math.max(1, Number(r.query?.limit ?? 25) || 25)),
    ...(typeof r.query?.cursor === 'string' ? { cursor: r.query.cursor } : {}),
  });
  const routes: Array<[string, (a: any) => Promise<unknown>]> = [
    ['/summary', async () => productSummary(await o.adapter.summary())],
    ['/nodes', (r) => o.adapter.nodes(query(r))],
    ['/metrics', () => o.adapter.metrics()],
    ['/pool/policy', () => o.adapter.policy?.() ?? unsupported()],
    ['/pool/templates', () => o.adapter.templates?.() ?? unsupported()],
    ['/pool/host-capacity', () => o.adapter.hostCapacity?.() ?? unsupported()],
    [
      '/lifecycle/capabilities',
      () => o.adapter.lifecycleCapabilities?.() ?? unsupported(),
    ],
    [
      '/lifecycle/operations',
      (r) => o.adapter.lifecycleHistory?.(query(r)) ?? unsupported(),
    ],
    [
      '/autoscaling/decisions',
      (r) => o.adapter.autoscalerHistory?.(query(r)) ?? unsupported(),
    ],
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
          await o.audit.record({
            ...base,
            actorUserId: ctx.userId,
            outcome: 'success',
            expectedIncarnation: body.expectedIncarnation,
            expectedControlVersion: body.expectedControlVersion,
            reason: body.reason,
            idempotencyKey: body.idempotencyKey,
            afterState: prior.result,
          });
          return reply.send(prior.result);
        }
        try {
          const node = await o.adapter.mutate(
            action,
            r.params.nodeId,
            body as MutationInput,
            { requestId: r.id, correlationId },
          );
          const result = {
            operationId: crypto.randomUUID(),
            correlationId,
            node,
          };
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

  const lifecycleMutation = async (
    r: any,
    reply: any,
    action: string,
    nodeId: string,
    body: Record<string, unknown>,
    invoke: () => Promise<unknown>,
    expected?: { incarnation?: unknown; controlVersion?: unknown },
  ) => {
    const ctx = await o.getAuthContext(r);
    const correlationId = String(
      r.headers['x-correlation-id'] ?? crypto.randomUUID(),
    );
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
    const base = {
      actorUserId: ctx?.userId ?? 'anonymous',
      permission: 'judge.lifecycle',
      action,
      nodeId,
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
    if (!(await o.can(ctx, 'judge.lifecycle'))) {
      await o.audit.record({ ...base, actorUserId: ctx.userId });
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Judge lifecycle forbidden',
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
        errorCode: 'CSRF_REQUIRED',
      });
      return reply.status(403).send({
        code: 'CSRF_REQUIRED',
        message: 'CSRF validation failed',
        requestId: r.id,
      });
    }
    if (
      !idempotencyKey?.trim() ||
      typeof body.reason !== 'string' ||
      !body.reason.trim()
    ) {
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        errorCode: 'VALIDATION_ERROR',
      });
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid lifecycle request',
        requestId: r.id,
      });
    }
    if (Object.keys(body).some((key) => unsafeLifecycleKeys.has(key))) {
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        errorCode: 'VALIDATION_ERROR',
      });
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Unsupported lifecycle fields',
        requestId: r.id,
      });
    }
    if (
      expected &&
      (typeof expected.controlVersion !== 'number' ||
        ('incarnation' in expected && typeof expected.incarnation !== 'string'))
    ) {
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        errorCode: 'VALIDATION_ERROR',
      });
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid lifecycle concurrency guard',
        requestId: r.id,
      });
    }
    const fingerprint = JSON.stringify([action, nodeId, body]);
    const prior = idempotent.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        return reply.status(409).send({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key was already used',
          requestId: r.id,
        });
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        outcome: 'success',
        idempotencyKey,
        afterState: prior.result,
      });
      return reply.send(prior.result);
    }
    try {
      const value = await invoke();
      const result = {
        operationId: crypto.randomUUID(),
        correlationId,
        node: value,
      };
      idempotent.set(idempotencyKey, { fingerprint, result });
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        outcome: 'success',
        idempotencyKey,
        reason: body.reason,
        ...(typeof expected?.incarnation === 'string'
          ? { expectedIncarnation: expected.incarnation }
          : {}),
        ...(typeof expected?.controlVersion === 'number'
          ? { expectedControlVersion: expected.controlVersion }
          : {}),
        afterState: result,
      });
      return reply.send(result);
    } catch (e) {
      const x = errorMap(e);
      await o.audit.record({
        ...base,
        actorUserId: ctx.userId,
        outcome: 'failure',
        idempotencyKey,
        reason: body.reason,
        errorCode: x.code,
      });
      return reply
        .status(x.status)
        .send({ code: x.code, message: x.message, requestId: r.id });
    }
  };

  for (const action of ['start', 'stop', 'restart'] as const)
    app.post(
      `/api/admin/judge/nodes/:nodeId/${action}`,
      async (r: any, reply) => {
        const body = (r.body ?? {}) as Partial<LifecycleInput>;
        const expected = {
          incarnation: body.expectedIncarnation,
          controlVersion: body.expectedControlVersion,
        };
        if (!o.adapter.lifecycle)
          return reply.status(501).send({
            code: 'JUDGE_LIFECYCLE_UNAVAILABLE',
            message: 'Judge lifecycle unavailable',
            requestId: r.id,
          });
        return lifecycleMutation(
          r,
          reply,
          action,
          r.params.nodeId,
          body as Record<string, unknown>,
          () =>
            o.adapter.lifecycle!(
              action,
              r.params.nodeId,
              body as LifecycleInput,
              {
                requestId: r.id,
                correlationId: String(
                  r.headers['x-correlation-id'] ?? crypto.randomUUID(),
                ),
              },
            ),
          expected,
        );
      },
    );

  app.post('/api/admin/judge/nodes', async (r: any, reply) => {
    const body = (r.body ?? {}) as Partial<AddNodeInput>;
    if (!o.adapter.addNode)
      return reply.status(501).send({
        code: 'JUDGE_LIFECYCLE_UNAVAILABLE',
        message: 'Judge lifecycle unavailable',
        requestId: r.id,
      });
    if (
      typeof body.templateId !== 'string' ||
      !body.templateId.trim() ||
      (body.count !== undefined &&
        (!Number.isInteger(body.count) || body.count < 1 || body.count > 16))
    )
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid trusted template request',
        requestId: r.id,
      });
    return lifecycleMutation(
      r,
      reply,
      'add',
      'pool',
      body as Record<string, unknown>,
      () =>
        o.adapter.addNode!(body as AddNodeInput, {
          requestId: r.id,
          correlationId: String(
            r.headers['x-correlation-id'] ?? crypto.randomUUID(),
          ),
        }),
    );
  });

  const policyMutation =
    (action: 'update_policy' | 'set_mode') => async (r: any, reply: any) => {
      const body = (r.body ?? {}) as Record<string, unknown>;
      const invoke =
        action === 'update_policy' ? o.adapter.updatePolicy : o.adapter.setMode;
      if (!invoke)
        return reply.status(501).send({
          code: 'JUDGE_LIFECYCLE_UNAVAILABLE',
          message: 'Judge lifecycle unavailable',
          requestId: r.id,
        });
      if (
        action === 'set_mode' &&
        body.mode !== 'MANUAL' &&
        body.mode !== 'AUTOMATIC'
      )
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid pool mode',
          requestId: r.id,
        });
      return lifecycleMutation(
        r,
        reply,
        action,
        'pool',
        body,
        () =>
          action === 'update_policy'
            ? o.adapter.updatePolicy!(body as PolicyMutationInput, {
                requestId: r.id,
                correlationId: String(
                  r.headers['x-correlation-id'] ?? crypto.randomUUID(),
                ),
              })
            : o.adapter.setMode!(body as ModeMutationInput, {
                requestId: r.id,
                correlationId: String(
                  r.headers['x-correlation-id'] ?? crypto.randomUUID(),
                ),
              }),
        { controlVersion: body.expectedControlVersion as number },
      );
    };
  app.post('/api/admin/judge/pool/policy', policyMutation('update_policy'));
  app.put('/api/admin/judge/pool/policy', policyMutation('update_policy'));
  app.post('/api/admin/judge/pool/mode', policyMutation('set_mode'));
  app.put('/api/admin/judge/pool/mode', policyMutation('set_mode'));
}

const unsupported = () =>
  Promise.reject(new JudgeAdminUpstreamError(501, 'UNSUPPORTED'));
