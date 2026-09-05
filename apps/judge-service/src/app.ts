import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  JudgeProgressEventBus,
  testcaseTerminalEvents,
  type JudgeJobRepository,
  type JudgeProgressEvent,
  type JudgeProgressSink,
  type JudgeArtifactReference,
  ARTIFACT_EXECUTION_CONTRACT,
  JUDGE_ARTIFACT_JOB_CONTRACT,
} from '@ojplatform/judge-runtime';
import { requestDigest, projectJudgeServiceResult } from './projection.js';
import type {
  JudgeServiceCapabilities,
  StoredJudgeServiceJob,
  SubmitJudgeJobRequest,
} from './model.js';
import { JUDGE_SERVICE_API_VERSION } from './model.js';
import type { JudgeServiceStateRepository } from './repository.js';
import type { JudgeNodeRepository } from './node-repository.js';
import type { RequiredNodeCapabilities } from './node-model.js';
import {
  assertJudgePoolPolicy,
  decideJudgePool,
  type JudgePoolAuditRecord,
  type JudgePoolPolicy,
  type JudgePoolSnapshot,
} from './pool-autoscaler.js';

export type JudgeServiceAppOptions = {
  queue: JudgeJobRepository;
  state: JudgeServiceStateRepository;
  serviceToken: string;
  nodeToken?: string;
  nodes?: JudgeNodeRepository;
  ready?: () => Promise<boolean>;
  logger?: boolean;
  /** Judge-side safe lifecycle events; transport ownership stays outside queue. */
  progressEvents?: JudgeProgressSink;
  /** Enables the in-process autoscaler loop when greater than zero. */
  autoscalerIntervalMs?: number;
  /** Optional queue metrics supplied by the concrete queue adapter. */
  autoscalerMetrics?: () => Promise<{
    pendingJobs?: number;
    averageQueueWaitMs?: number;
    p95QueueWaitMs?: number;
  }>;
  hostAgent?: {
    listTemplates(): Promise<unknown>;
    hostCapacity(templateId?: string): Promise<unknown>;
    listOwned(): Promise<unknown>;
    operationsHistory(): Promise<unknown>;
    start(input: {
      templateId: string;
      nodeId: string;
    }): Promise<{ operationId: string; incarnation?: string }>;
    stop(input: {
      nodeId: string;
      expectedIncarnation?: string;
      activeJobs?: number;
    }): Promise<{ operationId: string }>;
    restart(input: {
      templateId: string;
      nodeId: string;
      expectedIncarnation?: string;
      activeJobs?: number;
    }): Promise<{ operationId: string; incarnation?: string }>;
  };
};

const numericFrom = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const capabilities: JudgeServiceCapabilities = {
  apiVersion: JUDGE_SERVICE_API_VERSION,
  languages: ['cpp20'],
  languageProfiles: ['cpp20-gcc-13-v1'],
  checkers: ['EXACT_BYTES', 'TOKEN_WHITESPACE'],
  verdicts: ['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE'],
  multiNodeDynamicManagement: 'NOT_YET_QUALIFIED',
  advancedFeatures: {
    specialJudge: false,
    interactive: false,
    scoring: false,
    multiLanguage: false,
  },
};

const opaque = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  !/[\0\r\n]/.test(value);

const serviceToken = (request: FastifyRequest, expected: string) => {
  const supplied = request.headers['x-judge-service-token'];
  if (typeof supplied !== 'string') return false;
  const actual = Buffer.from(supplied);
  const expectedValue = Buffer.from(expected);
  return (
    actual.length === expectedValue.length &&
    timingSafeEqual(actual, expectedValue)
  );
};

const nodeToken = (request: FastifyRequest, expected: string) => {
  const supplied = request.headers['x-judge-node-token'];
  if (typeof supplied !== 'string') return false;
  const actual = Buffer.from(supplied);
  const expectedValue = Buffer.from(expected);
  return (
    actual.length === expectedValue.length &&
    timingSafeEqual(actual, expectedValue)
  );
};

function validSubmit(value: unknown): value is SubmitJudgeJobRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    opaque(item.clientRequestId) &&
    opaque(item.externalSubmissionId) &&
    opaque(item.problemId) &&
    opaque(item.problemRevisionId) &&
    opaque(item.testdataVersionRef) &&
    item.languageId === 'cpp20'
  );
}

const requiredCapabilities = (job: {
  judgeArtifact?: JudgeArtifactReference | undefined;
  languageProfileId?: string | undefined;
  executionMode: RequiredNodeCapabilities['executionMode'];
  testcaseSet?:
    { entries: readonly { checkerType?: string | undefined }[] } | undefined;
}): RequiredNodeCapabilities => ({
  ...(job.judgeArtifact
    ? {
        artifactContractVersion: ARTIFACT_EXECUTION_CONTRACT,
        checker: job.judgeArtifact.manifest.entries[0]!.checkerType,
      }
    : {}),
  languageProfile:
    job.languageProfileId === 'cpp20-gcc-13-v1'
      ? 'cpp20-gcc-13-v1'
      : 'cpp20-gcc-13-v1',
  executionMode: job.executionMode,
  ...(job.testcaseSet?.entries[0]?.checkerType === 'TOKEN_WHITESPACE' ||
  job.testcaseSet?.entries[0]?.checkerType === 'EXACT_BYTES'
    ? { checker: job.testcaseSet.entries[0].checkerType }
    : {}),
});

export async function buildJudgeService(
  options: JudgeServiceAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const progressBus = new JudgeProgressEventBus();
  if (options.progressEvents) progressBus.on(options.progressEvents);
  const emitProgress = (
    job: Awaited<ReturnType<JudgeJobRepository['getById']>>,
    phase: Parameters<JudgeProgressEventBus['emit']>[0]['phase'],
    extra: Partial<Parameters<JudgeProgressEventBus['emit']>[0]> = {},
  ) => {
    if (!job) return;
    progressBus.emit({
      phase,
      judgeJobId: job.id,
      submissionId: job.submissionId,
      evaluationGeneration: job.evaluationGeneration ?? 1,
      attemptGeneration: job.resultGeneration ?? job.attempt,
      updatedAt: job.updatedAt,
      ...extra,
    });
  };
  const emitTerminal = (
    job: Awaited<ReturnType<JudgeJobRepository['getById']>>,
  ) => {
    if (
      !job ||
      !['COMPLETED', 'SUCCEEDED_FAKE', 'CANCELLED', 'FAILED_TERMINAL'].includes(
        job.status,
      )
    )
      return;
    const verdict =
      job.rawExecutionResult?.verdict_record?.overall_user_verdict;
    emitProgress(job, 'EVALUATION_TERMINAL', {
      state: job.status,
      ...(typeof verdict === 'string'
        ? {
            verdict: verdict as NonNullable<JudgeProgressEvent['verdict']>,
          }
        : {}),
    });
  };
  const emitQueued = (
    job: Awaited<ReturnType<JudgeJobRepository['getById']>>,
  ) => emitProgress(job, 'EVALUATION_QUEUED', { state: 'QUEUED' });
  const nodes = options.nodes;
  const deny = async (
    request: FastifyRequest,
    reply: { code: (value: number) => { send: (value: unknown) => unknown } },
  ) => {
    if (serviceToken(request, options.serviceToken)) return true;
    reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Service authentication required',
    });
    return false;
  };
  const denyNode = async (
    request: FastifyRequest,
    reply: { code: (value: number) => { send: (value: unknown) => unknown } },
  ) => {
    if (options.nodeToken && nodeToken(request, options.nodeToken)) return true;
    reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Node authentication required',
    });
    return false;
  };
  const sync = async (
    stored: StoredJudgeServiceJob,
    jobId = stored.result.judgeJobId,
  ) => {
    const queued = await options.queue.getById(jobId);
    if (!queued) return stored;
    return options.state.save({
      ...stored,
      result: projectJudgeServiceResult(queued, stored.result.acceptedAt),
    });
  };

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    const ready = (await options.ready?.()) ?? true;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'not_ready',
      dependencies: {
        judgeDatabase: ready ? 'ok' : 'unavailable',
        redis: ready ? 'ok' : 'unavailable',
      },
    });
  });
  const defaultPoolPolicy: JudgePoolPolicy = {
    mode: 'MANUAL' as const,
    templateId: 'cpp20-gcc-13-v1',
    minNodes: 1,
    maxNodes: 4,
    targetQueueWaitMs: 1000,
    fastScaleQueueWaitMs: 5000,
    pendingJobsScaleUpThreshold: 3,
    scaleUpStep: 1,
    fastScaleUpStep: 2,
    scaleDownStep: 1,
    scaleDownUtilizationThreshold: 0.2,
    scaleDownIdleWindowMs: 30000,
    scaleUpCooldownMs: 10000,
    scaleDownCooldownMs: 30000,
    hostCpuReserve: 0.1,
    hostMemoryReserve: 0.1,
    controlVersion: 1,
  };
  const storedPoolPolicy = await options.state.getPoolPolicy?.();
  if (storedPoolPolicy) assertJudgePoolPolicy(storedPoolPolicy);
  let poolPolicy: JudgePoolPolicy = structuredClone(
    storedPoolPolicy ?? defaultPoolPolicy,
  );
  const lifecycleHistory: unknown[] = [];
  const autoscalerHistory: JudgePoolAuditRecord[] =
    (await options.state.listAutoscalerDecisions?.(100)) ?? [];
  let lastScaleUpAt: Date | undefined;
  let lastScaleDownAt: Date | undefined;
  let idleSince: Date | undefined;
  let autoscalerRunning = false;
  let autoscalerTimer: ReturnType<typeof setInterval> | undefined;
  const waitForNodeIncarnation = async (
    nodeId: string,
    incarnation: string,
  ) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const registered = await nodes?.get(nodeId);
      if (registered?.incarnation === incarnation) return registered;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('NODE_REGISTRATION_TIMEOUT');
  };
  app.get('/v1/admin/pool/policy', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return poolPolicy;
  });
  app.get('/v1/admin/pool/templates', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return {
      items: options.hostAgent ? await options.hostAgent.listTemplates() : [],
      nextCursor: null,
    };
  });
  app.get('/v1/admin/pool/host-capacity', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return options.hostAgent
      ? await options.hostAgent.hostCapacity()
      : {
          available: false,
          reason: 'HOST_AGENT_NOT_AVAILABLE',
        };
  });
  app.get('/v1/admin/lifecycle/capabilities', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return {
      available: Boolean(options.hostAgent),
      actions: options.hostAgent ? ['start', 'stop', 'restart', 'add'] : [],
      reason: options.hostAgent ? undefined : 'HOST_AGENT_NOT_AVAILABLE',
    };
  });
  app.get('/v1/admin/lifecycle/operations', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return {
      items: options.hostAgent
        ? await options.hostAgent.operationsHistory()
        : lifecycleHistory.slice(-100),
      nextCursor: null,
    };
  });
  app.get('/v1/admin/autoscaler/decisions', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return { items: autoscalerHistory.slice(-100), nextCursor: null };
  });
  const reconcileAutoscaler = async (body: Record<string, unknown> = {}) => {
    if (!nodes) throw new Error('NODE_REGISTRY_UNAVAILABLE');
    const numeric = (key: string, fallback = 0) =>
      typeof body[key] === 'number' && Number.isFinite(body[key])
        ? Number(body[key])
        : fallback;
    const now = new Date();
    const currentNodes = await nodes.list(now);
    const ownedRaw = options.hostAgent
      ? await options.hostAgent.listOwned()
      : [];
    const ownedItems = Array.isArray(ownedRaw)
      ? ownedRaw
      : ownedRaw &&
          typeof ownedRaw === 'object' &&
          Array.isArray((ownedRaw as { items?: unknown }).items)
        ? (ownedRaw as { items: unknown[] }).items
        : [];
    const ownedCount = ownedItems.length;
    const hostRaw = options.hostAgent
      ? await options.hostAgent.hostCapacity(poolPolicy.templateId)
      : undefined;
    const host =
      hostRaw && typeof hostRaw === 'object'
        ? (hostRaw as Record<string, unknown>)
        : undefined;
    const configuredCpu = numericFrom(
      host?.configuredCpuUnits ?? host?.configuredCpu,
      0,
    );
    const remainingCpu = numericFrom(
      host?.availableCpuUnits ?? host?.remainingCpu,
      0,
    );
    const configuredMemory = numericFrom(
      host?.configuredMemoryMb ?? host?.configuredMemoryBytes,
      0,
    );
    const remainingMemory = numericFrom(
      host?.availableMemoryMb ?? host?.remainingMemoryBytes,
      0,
    );
    const queueMetrics = (await options.autoscalerMetrics?.()) ?? {};
    const running = currentNodes.filter((n) => n.desiredState !== 'OFFLINE');
    const active = running.reduce(
      (sum, n) => sum + Math.max(0, n.activeJobs),
      0,
    );
    const schedulable = running
      .filter(
        (n) =>
          (n.desiredState ?? 'ONLINE') === 'ONLINE' &&
          ['ONLINE', 'BUSY'].includes(n.observedState ?? n.state),
      )
      .reduce(
        (sum, n) => sum + Math.max(0, n.maxConcurrentJobs - n.activeJobs),
        0,
      );
    const maxCapacity = running.reduce(
      (sum, n) => sum + n.maxConcurrentJobs,
      0,
    );
    const pendingJobs = Math.max(
      0,
      Math.floor(
        numeric('pendingJobs', numericFrom(queueMetrics.pendingJobs, 0)),
      ),
    );
    const activeJobs = Math.max(0, Math.floor(numeric('activeJobs', active)));
    const schedulableCapacity = Math.max(
      0,
      Math.floor(numeric('schedulableCapacity', schedulable)),
    );
    const utilization = Math.max(
      0,
      Math.min(
        1,
        numeric('utilization', maxCapacity ? active / maxCapacity : 0),
      ),
    );
    const averageQueueWaitMs = Math.max(
      0,
      numeric(
        'averageQueueWaitMs',
        numericFrom(queueMetrics.averageQueueWaitMs, 0),
      ),
    );
    const p95QueueWaitMs = Math.max(
      0,
      numeric('p95QueueWaitMs', numericFrom(queueMetrics.p95QueueWaitMs, 0)),
    );
    if (
      pendingJobs === 0 &&
      utilization <= poolPolicy.scaleDownUtilizationThreshold
    )
      idleSince ??= now;
    else idleSince = undefined;
    const snapshot: JudgePoolSnapshot = {
      now,
      // Include Host Agent-owned processes that have not registered yet. This
      // prevents each interval tick from launching another copy while a
      // worker is still starting and registering its incarnation.
      runningNodes: Math.max(running.length, ownedCount),
      pendingJobs,
      activeJobs,
      schedulableCapacity,
      utilization,
      averageQueueWaitMs,
      p95QueueWaitMs,
      host: {
        configuredCpu,
        remainingCpu,
        configuredMemoryBytes: configuredMemory,
        remainingMemoryBytes: remainingMemory,
        maxAdditionalNodes: Math.max(
          0,
          Math.floor(numericFrom(host?.maxAdditionalNodes, 0)),
        ),
        nodeCpu: Math.max(
          1,
          numericFrom(host?.nodeCpuUnits ?? host?.nodeCpu, 1),
        ),
        nodeMemoryBytes: Math.max(
          1,
          numericFrom(host?.nodeMemoryMb ?? host?.nodeMemoryBytes, 1),
        ),
        available: Boolean(options.hostAgent && host && hostRaw),
      },
      ...(typeof body.idleSince === 'string' &&
      Number.isFinite(Date.parse(body.idleSince))
        ? { idleSince: new Date(body.idleSince) }
        : idleSince
          ? { idleSince }
          : {}),
      ...(lastScaleUpAt ? { lastScaleUpAt } : {}),
      ...(lastScaleDownAt ? { lastScaleDownAt } : {}),
      ...(typeof body.correlationId === 'string'
        ? { correlationId: body.correlationId }
        : {}),
    };
    const decision = decideJudgePool(snapshot, poolPolicy);
    autoscalerHistory.push(decision.audit);
    while (autoscalerHistory.length > 200) autoscalerHistory.shift();
    await options.state.appendAutoscalerDecision?.(decision.audit);
    const operations: unknown[] = [];
    try {
      if (decision.action === 'SCALE_UP' && options.hostAgent) {
        const count = Math.max(
          0,
          decision.resultingNodeCount - snapshot.runningNodes,
        );
        for (let i = 0; i < count; i++)
          operations.push(
            await options.hostAgent.start({
              templateId: poolPolicy.templateId,
              nodeId: `${poolPolicy.templateId}-${Date.now()}-${i + 1}`,
            }),
          );
      } else if (decision.action === 'SCALE_DOWN' && options.hostAgent) {
        const count = Math.max(
          0,
          snapshot.runningNodes - decision.requestedNodeCount,
        );
        const candidates = currentNodes
          .filter((n) => n.desiredState !== 'OFFLINE' && n.activeJobs === 0)
          .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
        for (const candidate of candidates.slice(0, count)) {
          const drained = await nodes.drain(
            candidate.nodeId,
            candidate.incarnation,
            candidate.controlVersion,
          );
          if (drained.activeJobs !== 0) continue;
          await nodes.offline(
            candidate.nodeId,
            drained.incarnation,
            drained.controlVersion,
          );
          operations.push(
            await options.hostAgent.stop({
              nodeId: candidate.nodeId,
              expectedIncarnation: candidate.incarnation,
              activeJobs: 0,
            }),
          );
        }
      }
      if (decision.action === 'SCALE_UP') lastScaleUpAt = now;
      if (decision.action === 'SCALE_DOWN') lastScaleDownAt = now;
    } catch (error) {
      throw Object.assign(
        new Error(
          error instanceof Error ? error.message : 'HOST_AGENT_UNAVAILABLE',
        ),
        { decision, operations },
      );
    }
    return { decision, operations };
  };
  app.post('/v1/admin/autoscaler/reconcile', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(503).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return await reconcileAutoscaler(
        (request.body ?? {}) as Record<string, unknown>,
      );
    } catch (error) {
      const value = error as { decision?: unknown; operations?: unknown[] };
      return reply.code(503).send({
        code: error instanceof Error ? error.message : 'HOST_AGENT_UNAVAILABLE',
        ...(value.decision ? { decision: value.decision } : {}),
        ...(value.operations ? { operations: value.operations } : {}),
      });
    }
  });
  const intervalMs = Math.max(0, Math.floor(options.autoscalerIntervalMs ?? 0));
  if (intervalMs > 0 && nodes) {
    autoscalerTimer = setInterval(() => {
      if (autoscalerRunning || poolPolicy.mode !== 'AUTOMATIC') return;
      autoscalerRunning = true;
      void reconcileAutoscaler({ correlationId: 'autoscaler-loop' })
        .catch(() => undefined)
        .finally(() => {
          autoscalerRunning = false;
        });
    }, intervalMs);
    autoscalerTimer.unref?.();
  }
  app.addHook('onClose', async () => {
    if (autoscalerTimer) clearInterval(autoscalerTimer);
  });
  app.post('/v1/admin/nodes', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!options.hostAgent)
      return reply.code(503).send({ code: 'HOST_AGENT_NOT_AVAILABLE' });
    const body = request.body as { templateId?: unknown; count?: unknown };
    if (
      typeof body?.templateId !== 'string' ||
      (body.count !== undefined &&
        (!Number.isInteger(body.count) ||
          Number(body.count) < 1 ||
          Number(body.count) > 16))
    )
      return reply.code(400).send({ code: 'INVALID_TRUSTED_TEMPLATE' });
    const count = Number(body.count ?? 1);
    const results = [];
    for (let i = 0; i < count; i++)
      results.push(
        await options.hostAgent.start({
          templateId: body.templateId,
          nodeId: `${body.templateId}-${Date.now()}-${i + 1}`,
        }),
      );
    return { operationId: crypto.randomUUID(), results };
  });
  for (const action of ['start', 'stop', 'restart'] as const)
    app.post(`/v1/admin/nodes/:nodeId/${action}`, async (request, reply) => {
      if (!(await deny(request, reply))) return;
      if (!options.hostAgent)
        return reply.code(503).send({ code: 'HOST_AGENT_NOT_AVAILABLE' });
      const body = request.body as { templateId?: unknown };
      if (action !== 'stop' && typeof body?.templateId !== 'string')
        return reply.code(400).send({ code: 'INVALID_TRUSTED_TEMPLATE' });
      const nodeId = (request.params as { nodeId: string }).nodeId;
      const current = nodes ? await nodes.get(nodeId) : undefined;
      if ((action === 'stop' || action === 'restart') && nodes) {
        if (!current) return reply.code(404).send({ code: 'SLOT_NOT_FOUND' });
        if (current.activeJobs > 0) {
          try {
            await nodes.drain(
              nodeId,
              current.incarnation,
              current.controlVersion,
            );
          } catch {
            return reply.code(409).send({ code: 'LIFECYCLE_CONFLICT' });
          }
          return reply.code(409).send({
            code: 'ACTIVE_JOBS',
            message: 'Node is draining; active jobs must finish before stop',
            activeJobs: current.activeJobs,
          });
        }
        try {
          await nodes.offline(
            nodeId,
            current.incarnation,
            current.controlVersion,
          );
        } catch {
          return reply.code(409).send({ code: 'LIFECYCLE_CONFLICT' });
        }
      }
      let result: { operationId: string; incarnation?: string };
      try {
        result =
          action === 'stop'
            ? await options.hostAgent.stop({
                nodeId,
                ...(current?.incarnation
                  ? { expectedIncarnation: current.incarnation }
                  : {}),
                activeJobs: 0,
              })
            : await options.hostAgent[action]({
                templateId: String(body.templateId),
                nodeId,
                ...(current?.incarnation
                  ? { expectedIncarnation: current.incarnation }
                  : {}),
                activeJobs: 0,
              });
        if (
          nodes &&
          (action === 'start' || action === 'restart') &&
          result.incarnation
        ) {
          const registered = await waitForNodeIncarnation(
            nodeId,
            result.incarnation,
          );
          if (registered.desiredState !== 'ONLINE')
            await nodes.enable(
              nodeId,
              registered.incarnation,
              registered.controlVersion,
            );
        }
      } catch (error) {
        return reply.code(409).send({
          code: error instanceof Error ? error.message : 'LIFECYCLE_FAILED',
        });
      }
      lifecycleHistory.push({
        operationId: result.operationId,
        action,
        nodeId,
        status: 'ACCEPTED',
        timestamp: new Date().toISOString(),
      });
      return result;
    });
  app.post('/v1/admin/pool/policy', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const body = request.body as Record<string, unknown>;
    const expectedVersion = body?.expectedControlVersion;
    if (
      expectedVersion !== undefined &&
      expectedVersion !== poolPolicy.controlVersion
    )
      return reply.code(409).send({ code: 'CONTROL_VERSION_CONFLICT' });
    const candidate = {
      ...poolPolicy,
      ...body,
      controlVersion: poolPolicy.controlVersion,
    };
    delete (candidate as Record<string, unknown>).reason;
    delete (candidate as Record<string, unknown>).idempotencyKey;
    delete (candidate as Record<string, unknown>).expectedControlVersion;
    try {
      assertJudgePoolPolicy(candidate);
    } catch {
      return reply.code(400).send({ code: 'INVALID_POOL_POLICY' });
    }
    const allowed = new Set([
      'mode',
      'templateId',
      'minNodes',
      'maxNodes',
      'targetQueueWaitMs',
      'fastScaleQueueWaitMs',
      'pendingJobsScaleUpThreshold',
      'scaleUpStep',
      'fastScaleUpStep',
      'scaleDownStep',
      'scaleDownUtilizationThreshold',
      'scaleDownIdleWindowMs',
      'scaleUpCooldownMs',
      'scaleDownCooldownMs',
      'hostCpuReserve',
      'hostMemoryReserve',
    ]);
    if (
      Object.keys(body ?? {}).some(
        (key) =>
          !allowed.has(key) &&
          !['reason', 'idempotencyKey', 'expectedControlVersion'].includes(key),
      )
    )
      return reply.code(400).send({ code: 'INVALID_POOL_POLICY' });
    const nextPolicy = {
      ...poolPolicy,
      ...body,
      controlVersion: poolPolicy.controlVersion + 1,
    } as JudgePoolPolicy;
    await options.state.savePoolPolicy?.(nextPolicy);
    poolPolicy = nextPolicy;
    return poolPolicy;
  });
  app.post('/v1/admin/pool/mode', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const body = request.body as {
      mode?: unknown;
      expectedControlVersion?: unknown;
    };
    if (body?.mode !== 'MANUAL' && body?.mode !== 'AUTOMATIC')
      return reply.code(400).send({ code: 'INVALID_POOL_POLICY' });
    if (
      body.expectedControlVersion !== undefined &&
      body.expectedControlVersion !== poolPolicy.controlVersion
    )
      return reply.code(409).send({ code: 'CONTROL_VERSION_CONFLICT' });
    const nextPolicy: JudgePoolPolicy = {
      ...poolPolicy,
      mode: body.mode,
      controlVersion: poolPolicy.controlVersion + 1,
    };
    await options.state.savePoolPolicy?.(nextPolicy);
    poolPolicy = nextPolicy;
    return poolPolicy;
  });
  app.get('/v1/capabilities', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    return capabilities;
  });
  app.post('/v1/nodes/register', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return reply.code(201).send(await nodes.register(request.body as never));
    } catch (error) {
      return reply.code(400).send({
        code: 'INVALID_NODE_REGISTRATION',
        message:
          error instanceof Error ? error.message : 'Invalid node registration',
      });
    }
  });
  app.post('/v1/nodes/:nodeId/heartbeat', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const body = request.body as {
      incarnation?: unknown;
      activeJobs?: unknown;
    };
    if (
      typeof body?.incarnation !== 'string' ||
      !Number.isInteger(body?.activeJobs)
    )
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    try {
      return await nodes.heartbeat(
        (request.params as { nodeId: string }).nodeId,
        body.incarnation,
        Number(body.activeJobs),
      );
    } catch (error) {
      return reply.code(409).send({
        code:
          error instanceof Error ? error.message : 'NODE_HEARTBEAT_REJECTED',
      });
    }
  });
  app.get('/v1/nodes', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    return { items: await nodes.list() };
  });
  const adminDto = (
    n: Awaited<ReturnType<NonNullable<JudgeServiceAppOptions['nodes']>['get']>>,
  ) =>
    n && {
      nodeId: n.nodeId,
      incarnation: n.incarnation,
      desiredState: n.desiredState ?? 'ONLINE',
      observedState: n.observedState ?? n.state,
      state: n.state,
      runtimeVersion: n.runtimeVersion,
      maxConcurrentJobs: n.maxConcurrentJobs,
      activeJobs: n.activeJobs,
      availableCapacity: Math.max(0, n.maxConcurrentJobs - n.activeJobs),
      lastHeartbeatAt: n.lastHeartbeatAt ?? null,
      heartbeatAgeMs: n.lastHeartbeatAt
        ? Math.max(0, Date.now() - Date.parse(n.lastHeartbeatAt))
        : null,
      capabilities: n.capabilities,
      controlVersion: n.controlVersion ?? 1,
    };
  app.get('/v1/admin/nodes', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const query = request.query as { limit?: string; state?: string };
    const limit = Math.min(
      100,
      Math.max(1, Number(query?.limit ?? 100) || 100),
    );
    const items = (await nodes.list())
      .filter(
        (n) => !query?.state || (n.observedState ?? n.state) === query.state,
      )
      .slice(0, limit)
      .map(adminDto);
    return { items, nextCursor: null };
  });
  app.get('/v1/admin/nodes/:nodeId', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const n = await nodes.get((request.params as { nodeId: string }).nodeId);
    return n ? adminDto(n) : reply.code(404).send({ code: 'NOT_FOUND' });
  });
  app.get('/v1/admin/nodes/:nodeId/assignments', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const { nodeId } = request.params as { nodeId: string };
    if (!(await nodes.get(nodeId)))
      return reply.code(404).send({ code: 'NOT_FOUND' });
    const limit = Math.min(
      100,
      Math.max(
        1,
        Number((request.query as { limit?: string })?.limit ?? 100) || 100,
      ),
    );
    return {
      items: await nodes.listAssignments(nodeId, limit),
      nextCursor: null,
    };
  });
  app.get('/v1/admin/nodes/:nodeId/jobs', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const { nodeId } = request.params as { nodeId: string };
    if (!(await nodes.get(nodeId)))
      return reply.code(404).send({ code: 'NOT_FOUND' });
    const assignments = await nodes.listAssignments(nodeId, 100);
    const jobs = (
      await Promise.all(
        assignments.map(async (a) => {
          const job = await options.queue.getById(a.judgeJobId);
          return job
            ? {
                judgeJobId: job.id,
                status: job.status,
                attempt: job.attempt,
                updatedAt: job.updatedAt,
              }
            : undefined;
        }),
      )
    ).filter(Boolean);
    return { items: jobs, nextCursor: null };
  });
  app.get('/v1/admin/nodes/:nodeId/failures', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const { nodeId } = request.params as { nodeId: string };
    if (!(await nodes.get(nodeId)))
      return reply.code(404).send({ code: 'NOT_FOUND' });
    const assignments = await nodes.listAssignments(nodeId, 100);
    const failures = (
      await Promise.all(
        assignments.map(async (a) => {
          const job = await options.queue.getById(a.judgeJobId);
          return job &&
            ['FAILED_RETRYABLE', 'FAILED_TERMINAL'].includes(job.status)
            ? {
                judgeJobId: job.id,
                status: job.status,
                attempt: job.attempt,
                updatedAt: job.updatedAt,
              }
            : undefined;
        }),
      )
    ).filter(Boolean);
    return { items: failures, nextCursor: null };
  });
  app.get('/v1/admin/assignments/:assignmentId', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const id = (request.params as { assignmentId: string }).assignmentId;
    const all = await nodes.list();
    for (const n of all) {
      const found = (await nodes.listAssignments(n.nodeId, 100)).find(
        (a) => a.assignmentId === id,
      );
      if (found) return found;
    }
    return reply.code(404).send({ code: 'NOT_FOUND' });
  });
  app.get('/v1/admin/cluster/summary', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const all = await nodes.list();
    const counts: Record<string, number> = {};
    for (const n of all) counts[n.state] = (counts[n.state] ?? 0) + 1;
    const totalCapacity = all.reduce((s, n) => s + n.maxConcurrentJobs, 0);
    const schedulableCapacity = all
      .filter(
        (n) =>
          (n.desiredState ?? 'ONLINE') === 'ONLINE' &&
          ['ONLINE', 'BUSY'].includes(n.observedState ?? n.state),
      )
      .reduce((s, n) => s + Math.max(0, n.maxConcurrentJobs - n.activeJobs), 0);
    return {
      totalNodes: all.length,
      countsByState: counts,
      activeJobs: all.reduce((s, n) => s + n.activeJobs, 0),
      totalCapacity,
      schedulableCapacity,
      staleNodeCount: all.filter(
        (n) => (n.observedState ?? n.state) === 'UNHEALTHY',
      ).length,
      generatedAt: new Date().toISOString(),
    };
  });
  app.get('/v1/admin/metrics', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const all = await nodes.list();
    return {
      nodesByState: Object.fromEntries(
        all.map((n) => [
          n.state,
          all.filter((x) => x.state === n.state).length,
        ]),
      ),
      activeJobs: all.reduce((s, n) => s + n.activeJobs, 0),
      totalCapacity: all.reduce((s, n) => s + n.maxConcurrentJobs, 0),
      generatedAt: new Date().toISOString(),
    };
  });
  for (const [action, method] of [
    ['drain', 'drain'],
    ['offline', 'offline'],
    ['enable', 'enable'],
  ] as const)
    app.post(`/v1/admin/nodes/:nodeId/${action}`, async (request, reply) => {
      if (!(await deny(request, reply))) return;
      if (!nodes)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const body = (request.body ?? {}) as {
        expectedIncarnation?: string;
        expectedControlVersion?: number;
      };
      try {
        const n =
          method === 'enable'
            ? await nodes.enable(
                (request.params as { nodeId: string }).nodeId,
                body.expectedIncarnation,
                body.expectedControlVersion,
              )
            : await nodes[method](
                (request.params as { nodeId: string }).nodeId,
                body.expectedIncarnation,
                body.expectedControlVersion,
              );
        return adminDto(n);
      } catch (e) {
        return reply
          .code(
            e instanceof Error && e.message === 'STALE_CONTROL_VERSION'
              ? 409
              : 404,
          )
          .send({ code: e instanceof Error ? e.message : 'CONTROL_REJECTED' });
      }
    });
  app.get('/v1/nodes/:nodeId', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const value = await nodes.get(
      (request.params as { nodeId: string }).nodeId,
    );
    return value ? value : reply.code(404).send({ code: 'NOT_FOUND' });
  });
  app.post('/v1/nodes/:nodeId/drain', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return await nodes.drain((request.params as { nodeId: string }).nodeId);
    } catch {
      return reply.code(404).send({ code: 'NOT_FOUND' });
    }
  });
  app.post('/v1/nodes/:nodeId/offline', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    try {
      return await nodes.offline((request.params as { nodeId: string }).nodeId);
    } catch {
      return reply.code(404).send({ code: 'NOT_FOUND' });
    }
  });
  app.post('/v1/nodes/:nodeId/assignments/claim', async (request, reply) => {
    if (!(await denyNode(request, reply))) return;
    if (!nodes)
      return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
    const nodeId = (request.params as { nodeId: string }).nodeId;
    const body = request.body as { incarnation?: unknown };
    if (typeof body?.incarnation !== 'string')
      return reply.code(400).send({ code: 'VALIDATION_ERROR' });
    const current = await nodes.get(nodeId);
    if (!current || current.incarnation !== body.incarnation)
      return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
    for (const stored of await options.state.listAll()) {
      const job = await options.queue.getById(stored.result.judgeJobId);
      if (!job || !['QUEUED', 'FAILED_RETRYABLE'].includes(job.status))
        continue;
      const selected = await nodes.choose(requiredCapabilities(job));
      if (!selected.node) continue;
      if (
        selected.node.nodeId !== nodeId ||
        selected.node.incarnation !== body.incarnation
      )
        continue;
      const claim = await options.queue.claimById(
        job.id,
        `${nodeId}:${body.incarnation}`,
        30_000,
      );
      if (!claim) continue;
      emitProgress(claim.job, 'EVALUATION_STARTED', { state: 'RUNNING' });
      const first = (claim.job.testcaseSet ?? claim.job.judgeArtifact?.manifest)
        ?.entries[0];
      if (first || claim.job.testcaseId)
        emitProgress(claim.job, 'TESTCASE_STARTED', {
          state: 'RUNNING',
          ...(first
            ? { testcaseOrdinal: first.index + 1, testcaseId: first.testcaseId }
            : { testcaseOrdinal: 1, testcaseId: claim.job.testcaseId! }),
        });
      let assignment;
      try {
        assignment = await nodes.assign(
          selected.node,
          claim.job.id,
          claim.job.attempt,
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== 'NODE_CAPACITY_UNAVAILABLE'
        )
          throw error;
        // Queue and node capacity are separate durable authorities. Compensate
        // with the current lease so a reservation race cannot strand a job.
        await options.queue.retry(
          claim.job.id,
          claim.leaseToken,
          'NODE_CAPACITY_UNAVAILABLE',
        );
        continue;
      }
      request.log.info(
        {
          requestId: claim.job.requestId,
          submissionId: claim.job.submissionId,
          evaluationGeneration: claim.job.evaluationGeneration,
          judgeJobId: claim.job.id,
          artifactId: claim.job.judgeArtifact?.id,
          controlBytes: Buffer.byteLength(
            JSON.stringify({
              assignment,
              job: claim.job,
              leaseToken: claim.leaseToken,
            }),
          ),
        },
        'worker claim',
      );
      return { assignment, job: claim.job, leaseToken: claim.leaseToken };
    }
    return { assignment: null, reason: 'NO_COMPATIBLE_JUDGE_NODE' };
  });
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/complete',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes || !options.queue.completeReal)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const nodeId = (
        request.params as { nodeId: string; assignmentId: string }
      ).nodeId;
      const assignmentId = (
        request.params as { nodeId: string; assignmentId: string }
      ).assignmentId;
      const body = request.body as {
        incarnation?: unknown;
        leaseToken?: unknown;
        result?: unknown;
      };
      if (
        typeof body?.incarnation !== 'string' ||
        typeof body.leaseToken !== 'string'
      )
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const nodeValue = await nodes.get(nodeId);
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (
        !nodeValue ||
        nodeValue.incarnation !== body.incarnation ||
        !assignment
      )
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      try {
        await options.queue.completeReal(
          assignment.judgeJobId,
          body.leaseToken,
          body.result as never,
        );
        const completed = await options.queue.getById(assignment.judgeJobId);
        if (completed) {
          for (const event of testcaseTerminalEvents(completed))
            progressBus.emit(event);
          emitTerminal(completed);
        }
        await nodes.completeAssignment(assignmentId);
        return { status: 'COMPLETED' };
      } catch {
        return reply.code(409).send({ code: 'ASSIGNMENT_COMPLETION_REJECTED' });
      }
    },
  );
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/resolve',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const { nodeId, assignmentId } = request.params as {
        nodeId: string;
        assignmentId: string;
      };
      const body = request.body as {
        incarnation?: unknown;
        leaseToken?: unknown;
        action?: unknown;
        reason?: unknown;
        fixtureId?: unknown;
      };
      if (
        typeof body?.incarnation !== 'string' ||
        typeof body.leaseToken !== 'string' ||
        ![
          'SUCCEEDED_FAKE',
          'FAILED_RETRYABLE',
          'FAILED_TERMINAL',
          'CANCELLED',
        ].includes(String(body.action))
      )
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (!assignment)
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      try {
        switch (body.action) {
          case 'SUCCEEDED_FAKE':
            await options.queue.complete(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.fixtureId === 'string'
                ? body.fixtureId
                : 'FX-SUCCESS',
            );
            break;
          case 'FAILED_RETRYABLE':
            await options.queue.retry(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.reason === 'string' ? body.reason : 'WORKER_FAILURE',
            );
            break;
          case 'FAILED_TERMINAL':
            await options.queue.failTerminal(
              assignment.judgeJobId,
              body.leaseToken,
              typeof body.reason === 'string' ? body.reason : 'WORKER_FAILURE',
            );
            break;
          case 'CANCELLED':
            if (!options.queue.cancelLease)
              return reply.code(501).send({ code: 'CANCELLATION_UNAVAILABLE' });
            await options.queue.cancelLease(
              assignment.judgeJobId,
              body.leaseToken,
            );
            break;
        }
        const resolved = await options.queue.getById(assignment.judgeJobId);
        emitTerminal(resolved);
        await nodes.completeAssignment(assignmentId);
        return { status: 'RESOLVED' };
      } catch {
        return reply.code(409).send({ code: 'ASSIGNMENT_RESOLUTION_REJECTED' });
      }
    },
  );
  app.post(
    '/v1/nodes/:nodeId/assignments/:assignmentId/cancellation-status',
    async (request, reply) => {
      if (!(await denyNode(request, reply))) return;
      if (!nodes)
        return reply.code(501).send({ code: 'NODE_REGISTRY_UNAVAILABLE' });
      const { nodeId, assignmentId } = request.params as {
        nodeId: string;
        assignmentId: string;
      };
      const body = request.body as { incarnation?: unknown };
      if (typeof body?.incarnation !== 'string')
        return reply.code(400).send({ code: 'VALIDATION_ERROR' });
      const nodeValue = await nodes.get(nodeId);
      const assignment = await nodes.currentAssignment(
        assignmentId,
        nodeId,
        body.incarnation,
      );
      if (
        !nodeValue ||
        nodeValue.incarnation !== body.incarnation ||
        !assignment
      )
        return reply.code(409).send({ code: 'STALE_NODE_INCARNATION' });
      const job = await options.queue.getById(assignment.judgeJobId);
      if (!job)
        return reply
          .code(409)
          .send({ code: 'ASSIGNMENT_CANCELLATION_STATUS_REJECTED' });
      return { cancelRequested: job.status === 'CANCELLED' };
    },
  );
  app.post('/v1/jobs', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    if (!validSubmit(request.body))
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid Judge job request',
      });
    const input = request.body;
    if (
      input.judgeArtifact &&
      input.jobContract !== JUDGE_ARTIFACT_JOB_CONTRACT
    )
      return reply.code(400).send({ code: 'INVALID_ARTIFACT_CONTRACT' });
    request.log.info(
      {
        requestId: input.requestId,
        submissionId: input.externalSubmissionId,
        evaluationGeneration: input.evaluationGeneration ?? 1,
        artifactId: input.judgeArtifact?.id,
        controlBytes: Buffer.byteLength(JSON.stringify(input)),
      },
      'judge intake',
    );
    const existing = await options.state.getByClientRequestId(
      input.clientRequestId,
    );
    if (existing) {
      if (requestDigest(existing.request) !== requestDigest(input))
        return reply
          .code(409)
          .send({ code: 'CONFLICT', message: 'Conflicting clientRequestId' });
      return reply.code(200).send(existing.result);
    }
    const { clientRequestId, externalSubmissionId, ...jobInput } = input;
    const { job, created } = await options.queue.enqueue({
      ...jobInput,
      submissionId: externalSubmissionId,
      ownerUserId: 'judge-service',
      idempotencyKey: clientRequestId,
    });
    const existingJob = await options.state.getByJobId(job.id);
    if (
      !created &&
      existingJob &&
      existingJob.clientRequestId !== clientRequestId
    )
      return reply
        .code(409)
        .send({ code: 'CONFLICT', message: 'Evaluation already exists' });
    const stored = await options.state.save({
      clientRequestId,
      request: input,
      result: projectJudgeServiceResult(job),
    });
    if (created) emitQueued(job);
    return reply.code(created ? 201 : 200).send(stored.result);
  });
  app.get('/v1/jobs/:id', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    return (await sync(stored)).result;
  });
  app.get('/v1/jobs/:id/history', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    const entries = await options.state.listByExternalSubmissionId(
      stored.result.externalSubmissionId,
    );
    return {
      items: await Promise.all(
        entries.map((entry) => sync(entry).then((value) => value.result)),
      ),
    };
  });
  app.post('/v1/jobs/:id/cancel', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    if (!options.queue.cancel)
      return reply
        .code(501)
        .send({ code: 'NOT_IMPLEMENTED', message: 'Cancellation unavailable' });
    const job = await options.queue.cancel(id);
    emitTerminal(job);
    return (
      await options.state.save({
        ...stored,
        result: projectJudgeServiceResult(job, stored.result.acceptedAt),
      })
    ).result;
  });
  app.post('/v1/jobs/:id/rejudge', async (request, reply) => {
    if (!(await deny(request, reply))) return;
    const id = (request.params as { id: string }).id;
    const stored = await options.state.getByJobId(id);
    const body = request.body as { clientRequestId?: unknown } | undefined;
    if (!stored)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Judge job not found' });
    const clientRequestId = body?.clientRequestId;
    if (!opaque(clientRequestId))
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'clientRequestId is required',
      });
    const existing = await options.state.getByClientRequestId(clientRequestId);
    if (existing) return reply.send(existing.result);
    const { clientRequestId: previousClientRequestId, ...jobInput } =
      stored.request;
    void previousClientRequestId;
    const { job } = await options.queue.enqueue({
      ...jobInput,
      submissionId: stored.result.externalSubmissionId,
      ownerUserId: 'judge-service',
      evaluationGeneration: stored.result.evaluationGeneration + 1,
      idempotencyKey: clientRequestId,
    });
    emitQueued(job);
    const next = await options.state.save({
      clientRequestId,
      request: { ...stored.request, clientRequestId },
      result: projectJudgeServiceResult(job),
    });
    return reply.code(201).send(next.result);
  });
  return app;
}
