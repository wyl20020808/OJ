import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import {
  createWorkerAuthorizationPolicy,
  type WorkerAuthContext,
  type WorkerAuthorizationAction,
  type WorkerCapabilityManifest,
  type WorkerJobLink,
  type WorkerStatusReference,
} from '../authz/worker.js';
import type { AuthContext } from '../submission/model.js';
import type {
  PublishEvaluationInput,
  SubmissionRepository,
} from '../submission/repository.js';
import type { JudgeJob, JudgeJobRepository } from './model.js';

type WorkerControlOptions = {
  cache?: Redis;
  heartbeatPrefix?: string;
  getAuthContext: (request: FastifyRequest) => Promise<AuthContext | undefined>;
  judgeRepository: JudgeJobRepository;
  /** Authoritative cancellation plane (Judge Service) when it is configured. */
  judgeJobCancellation?: JudgeJobCancellationPlane;
  resolveSubmission: (
    submissionId: string,
  ) => Promise<{ ownerUserId: string } | undefined>;
  submissionRepository?: SubmissionRepository;
  operatorUserIds?: ReadonlySet<string>;
};

/**
 * Product-facing view of one cancellable judge job. The Judge Service keeps its
 * own status vocabulary and generation counters, so the control plane maps them
 * here instead of leaking queue internals into the route.
 */
export type CancellableJudgeJob = {
  judgeJobId: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  terminal: boolean;
  /**
   * Judge Service publication for this job when the control plane produced one.
   * Publishing it keeps a single authoritative digest, so the progress bridge
   * and the read-side projection stay idempotent instead of conflicting.
   */
  publication?: PublishEvaluationInput;
};

export type JudgeJobCancellationPlane = {
  getBySubmissionId(
    submissionId: string,
  ): Promise<CancellableJudgeJob | undefined>;
  cancel(judgeJobId: string): Promise<CancellableJudgeJob>;
};

type HeartbeatRecord = {
  worker_id: string;
  worker_instance_id: string;
  protocol_version: string;
  build_version: string;
  state: WorkerStatusReference['lifecycleState'];
  max_concurrency: number;
  active_job_count: number;
  safe_fixture: boolean;
  real_sandboxed_execution: boolean;
  sandbox_qualified: boolean;
  language_capabilities: string[];
  execution_modes: string[];
  heartbeat_at: string;
  real_execution_protocol_version?: string;
};

const safeRef = (job: JudgeJob): WorkerJobLink => ({
  jobId: job.id,
  submissionId: job.submissionId,
  ownerUserId: job.ownerUserId,
  ...(job.leaseOwner ? { workerId: job.leaseOwner } : {}),
  state:
    job.status === 'LEASED_FAKE'
      ? 'LEASED'
      : job.status === 'LEASED'
        ? 'LEASED'
        : job.status === 'SUCCEEDED_FAKE'
          ? 'SAFE_FIXTURE_SUCCEEDED'
          : job.status === 'COMPLETED'
            ? 'EXECUTION_COMPLETED'
            : job.status === 'FAILED_RETRYABLE'
              ? 'SAFE_FIXTURE_FAILED_RETRYABLE'
              : job.status === 'FAILED_TERMINAL'
                ? 'SAFE_FIXTURE_FAILED_TERMINAL'
                : job.status === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'QUEUED',
});

const safeManifest = (record: HeartbeatRecord): WorkerCapabilityManifest => {
  const real =
    record.real_sandboxed_execution === true &&
    record.sandbox_qualified === true &&
    (record.real_execution_protocol_version === '2C.1' ||
      record.real_execution_protocol_version === '2C.3') &&
    record.execution_modes?.includes('REAL_SANDBOXED_EXECUTION') &&
    record.language_capabilities?.length === 1 &&
    record.language_capabilities[0] === 'cpp20-gcc-13-v1';
  return {
    protocolVersion: real ? '2C.3' : '2A.1',
    buildVersion: record.build_version,
    executionModes: real
      ? ['SAFE_FIXTURE_QUALIFICATION', 'REAL_SANDBOXED_EXECUTION']
      : ['SAFE_FIXTURE_QUALIFICATION'],
    safeFixture: true,
    realSandboxedExecution: real,
    sandboxCapability: real,
    maxConcurrency: record.max_concurrency,
    languageCapabilities: real ? ['cpp20-gcc-13-v1'] : [],
  };
};

function parseHeartbeat(raw: string): WorkerStatusReference | undefined {
  try {
    const record = JSON.parse(raw) as HeartbeatRecord;
    if (
      !record.worker_id ||
      !record.worker_instance_id ||
      record.protocol_version !== '2A.1' ||
      !record.build_version ||
      !record.heartbeat_at ||
      !Number.isInteger(record.max_concurrency) ||
      record.max_concurrency < 1 ||
      !Number.isInteger(record.active_job_count) ||
      record.active_job_count < 0
    )
      return undefined;
    const degraded = record.state === 'DEGRADED';
    return {
      workerId: record.worker_id,
      workerInstanceId: record.worker_instance_id,
      lifecycleState: record.state,
      lastHeartbeatAt: record.heartbeat_at,
      protocolVersion: record.protocol_version,
      buildVersion: record.build_version,
      capabilityManifest: safeManifest(record),
      maxConcurrency: record.max_concurrency,
      activeJobCount: record.active_job_count,
      degraded,
      offline: false,
      ...(degraded ? { diagnosticCode: 'REDIS_OR_CONTROL_DEGRADED' } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function registerWorkerControlRoutes(
  app: FastifyInstance,
  options: WorkerControlOptions,
) {
  const prefix = options.heartbeatPrefix ?? 'oj:judge:workers';
  const roleActions = new Map<string, ReadonlySet<WorkerAuthorizationAction>>([
    [
      'operator',
      new Set<WorkerAuthorizationAction>([
        'worker:status:view',
        'worker:diagnostics:inspect',
        'worker:capabilities:view',
        'judge:job:cancel',
      ]),
    ],
  ]);
  const workers = async () => {
    if (!options.cache) return [] as WorkerStatusReference[];
    const keys = await options.cache.keys(`${prefix}:*`);
    const records = await Promise.all(
      keys.map(async (key) =>
        parseHeartbeat((await options.cache!.get(key)) ?? ''),
      ),
    );
    return records.filter((record): record is WorkerStatusReference =>
      Boolean(record),
    );
  };
  const authUser = async (
    request: FastifyRequest,
  ): Promise<WorkerAuthContext | undefined> => {
    const context = await options.getAuthContext(request);
    if (!context) return undefined;
    const isOperator = options.operatorUserIds?.has(context.userId) ?? false;
    return {
      userId: context.userId,
      status: 'active',
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      strength: 'password',
      roles: isOperator ? ['operator'] : [],
    };
  };
  const policy = createWorkerAuthorizationPolicy({
    roles: roleActions,
    resolveWorker: async (workerId) =>
      (await workers()).some((worker) => worker.workerId === workerId),
    resolveSubmissionOwner: async (submissionId) =>
      (await options.resolveSubmission(submissionId))?.ownerUserId ?? null,
    resolveJudgeJob: async (jobId) => {
      const job = await options.judgeRepository.getById(jobId);
      return job ? safeRef(job) : null;
    },
  });
  app.get('/api/operations/judge-workers', async (request, reply) => {
    const user = await authUser(request);
    const result = [];
    for (const worker of await workers()) {
      if (!(await policy.canInspectWorkerDiagnostics(user, worker, request.id)))
        continue;
      result.push({
        workerId: worker.workerId,
        workerInstanceId: worker.workerInstanceId,
        lifecycleState: worker.lifecycleState,
        lastHeartbeatAt: worker.lastHeartbeatAt,
        heartbeatAgeMs: worker.lastHeartbeatAt
          ? Math.max(0, Date.now() - Date.parse(worker.lastHeartbeatAt))
          : null,
        protocolVersion: worker.protocolVersion,
        buildVersion: worker.buildVersion,
        maxConcurrency: worker.maxConcurrency,
        activeJobCount: worker.activeJobCount,
        degraded: worker.degraded,
        offline: worker.offline,
        diagnosticCode: worker.diagnosticCode,
        capabilityManifest: worker.capabilityManifest,
      });
    }
    if (
      result.length === 0 &&
      !(options.operatorUserIds?.has(user?.userId ?? '') ?? false)
    )
      return reply.status(user ? 403 : 401).send({
        code: user ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        message: user
          ? 'Worker diagnostics forbidden'
          : 'Authentication required',
        requestId: request.id,
      });
    return reply.send({ items: result });
  });
  app.get('/api/judge/capabilities', async (request, reply) => {
    const user = await authUser(request);
    const worker = (await workers())[0];
    if (
      !worker ||
      !(await policy.canViewWorkerCapabilities(user, worker, request.id))
    )
      return reply.status(user ? 403 : 401).send({
        code: user ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        message: user
          ? 'Worker capabilities forbidden'
          : 'Authentication required',
        requestId: request.id,
      });
    return reply.send(worker.capabilityManifest);
  });
  app.post('/api/submissions/:id/judge/cancel', async (request, reply) => {
    const user = await authUser(request);
    if (!user)
      return reply.status(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: request.id,
      });
    const id = (request.params as { id: string }).id;
    const submission = await options.resolveSubmission(id);
    const plane = options.judgeJobCancellation;
    const target = plane
      ? await plane.getBySubmissionId(id)
      : await legacyCancellationTarget(options.judgeRepository, id);
    if (!submission || !target)
      return reply.status(404).send({
        code: 'NOT_FOUND',
        message: 'Submission not found',
        requestId: request.id,
      });
    const ownerAllowed = submission.ownerUserId === user.userId;
    const operatorAllowed = options.operatorUserIds?.has(user.userId) ?? false;
    if (!ownerAllowed && !operatorAllowed)
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: 'Cancellation forbidden',
        requestId: request.id,
      });
    if (target.terminal)
      return reply.status(409).send({
        code: 'TERMINAL',
        message: 'Judge job is already terminal',
        requestId: request.id,
      });
    if (!plane && !options.judgeRepository.cancel)
      return reply.status(501).send({
        code: 'NOT_IMPLEMENTED',
        message: 'Cancellation is not available',
        requestId: request.id,
      });
    const cancelled = plane
      ? await plane.cancel(target.judgeJobId)
      : await legacyCancel(options.judgeRepository, target.judgeJobId);
    if (cancelled.publication)
      await options.submissionRepository?.publishEvaluation?.(
        cancelled.publication,
      );
    else
      await options.submissionRepository?.cancelEvaluation?.(
        id,
        cancelled.judgeJobId,
      );
    return reply.send({
      judgeJobId: cancelled.judgeJobId,
      status: cancelled.status,
      attempt: cancelled.attempt,
      maxAttempts: cancelled.maxAttempts,
      synthetic: false,
    });
  });
}

/** Legacy API-local queue statuses that reject cancellation as already final. */
const legacyTerminalStatuses = [
  'SUCCEEDED_FAKE',
  'COMPLETED',
  'FAILED_TERMINAL',
];

function legacyView(job: JudgeJob): CancellableJudgeJob {
  return {
    judgeJobId: job.id,
    status: job.status,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    terminal: legacyTerminalStatuses.includes(job.status),
  };
}

async function legacyCancellationTarget(
  repository: JudgeJobRepository,
  submissionId: string,
): Promise<CancellableJudgeJob | undefined> {
  const job = await repository.getBySubmissionId(submissionId);
  return job ? legacyView(job) : undefined;
}

async function legacyCancel(
  repository: JudgeJobRepository,
  judgeJobId: string,
): Promise<CancellableJudgeJob> {
  return legacyView(await repository.cancel!(judgeJobId));
}
