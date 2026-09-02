import { createHash } from 'node:crypto';

/** Scaling mode is deliberately owned by the Judge Service. */
export type JudgePoolMode = 'MANUAL' | 'AUTOMATIC';

export type JudgePoolPolicy = {
  mode: JudgePoolMode;
  templateId: string;
  minNodes: number;
  maxNodes: number;
  targetQueueWaitMs: number;
  fastScaleQueueWaitMs: number;
  pendingJobsScaleUpThreshold: number;
  scaleUpStep: number;
  fastScaleUpStep: number;
  scaleDownStep: number;
  scaleDownUtilizationThreshold: number;
  scaleDownIdleWindowMs: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  hostCpuReserve: number;
  hostMemoryReserve: number;
  controlVersion: number;
};

export type JudgePoolHostCapacity = {
  configuredCpu: number;
  remainingCpu: number;
  configuredMemoryBytes: number;
  remainingMemoryBytes: number;
  /** Maximum additional nodes reported by the trusted Host Agent. */
  maxAdditionalNodes: number;
  nodeCpu: number;
  nodeMemoryBytes: number;
  available: boolean;
};

export type JudgePoolSnapshot = {
  now: Date;
  runningNodes: number;
  pendingJobs: number;
  activeJobs: number;
  schedulableCapacity: number;
  utilization: number;
  averageQueueWaitMs: number;
  p95QueueWaitMs: number;
  /** Time since the pool first remained below the scale-down load threshold. */
  idleSince?: Date;
  lastScaleUpAt?: Date;
  lastScaleDownAt?: Date;
  host: JudgePoolHostCapacity;
  correlationId?: string;
};

export type JudgePoolScaleAction =
  'NOOP' | 'SCALE_UP' | 'SCALE_DOWN' | 'BLOCKED';

export type JudgePoolReason =
  | 'MANUAL_MODE'
  | 'NO_SCALE_PRESSURE'
  | 'QUEUE_WAIT_TARGET_EXCEEDED'
  | 'P95_QUEUE_WAIT_TARGET_EXCEEDED'
  | 'PENDING_QUEUE_THRESHOLD_EXCEEDED'
  | 'FAST_SCALE_BACKLOG'
  | 'MAX_NODES_REACHED'
  | 'MIN_NODES_REACHED'
  | 'HOST_CAPACITY_EXHAUSTED'
  | 'HOST_AGENT_UNAVAILABLE'
  | 'SCALE_UP_COOLDOWN'
  | 'SCALE_DOWN_COOLDOWN'
  | 'LOW_UTILIZATION_IDLE_WINDOW'
  | 'IDLE_WINDOW_NOT_SUSTAINED'
  | 'HYSTERESIS_ACTIVE';

export type JudgePoolAuditRecord = {
  decisionId: string;
  timestamp: string;
  mode: JudgePoolMode;
  action: JudgePoolScaleAction;
  previousNodeCount: number;
  requestedNodeCount: number;
  resultingNodeCount: number;
  pendingJobs: number;
  averageQueueWaitMs: number;
  p95QueueWaitMs: number;
  utilization: number;
  schedulableCapacity: number;
  host: {
    configuredCpu: number;
    remainingCpu: number;
    configuredMemoryBytes: number;
    remainingMemoryBytes: number;
    maxAdditionalNodes: number;
  };
  reason: JudgePoolReason;
  correlationId?: string;
};

export type JudgePoolDecision = {
  action: JudgePoolScaleAction;
  requestedNodeCount: number;
  resultingNodeCount: number;
  reason: JudgePoolReason;
  audit: JudgePoolAuditRecord;
};

const finiteNonNegative = (value: number) =>
  Number.isFinite(value) && value >= 0;

/** Validate policy at the boundary so an invalid admin update fails closed. */
export function assertJudgePoolPolicy(
  value: unknown,
): asserts value is JudgePoolPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Judge pool policy');
  const policy = value as Record<string, unknown>;
  if (policy.mode !== 'MANUAL' && policy.mode !== 'AUTOMATIC')
    throw new Error('Invalid Judge pool mode');
  const integerFields = [
    'minNodes',
    'maxNodes',
    'pendingJobsScaleUpThreshold',
    'scaleUpStep',
    'fastScaleUpStep',
    'scaleDownStep',
    'scaleDownIdleWindowMs',
    'scaleUpCooldownMs',
    'scaleDownCooldownMs',
    'controlVersion',
  ];
  for (const field of integerFields) {
    const valueAtField = policy[field];
    if (
      typeof valueAtField !== 'number' ||
      !Number.isInteger(valueAtField) ||
      valueAtField < 0
    )
      throw new Error(`Invalid Judge pool policy field: ${field}`);
  }
  if (
    typeof policy.templateId !== 'string' ||
    policy.templateId.length === 0 ||
    (policy.minNodes as number) > (policy.maxNodes as number) ||
    (policy.maxNodes as number) < 1 ||
    (policy.scaleUpStep as number) < 1 ||
    (policy.fastScaleUpStep as number) < 1 ||
    (policy.scaleDownStep as number) < 1
  )
    throw new Error('Invalid Judge pool node bounds');
  for (const field of [
    'targetQueueWaitMs',
    'fastScaleQueueWaitMs',
    'scaleDownUtilizationThreshold',
    'hostCpuReserve',
    'hostMemoryReserve',
  ]) {
    const numeric = policy[field];
    if (typeof numeric !== 'number' || !finiteNonNegative(numeric))
      throw new Error(`Invalid Judge pool policy field: ${field}`);
  }
  const threshold = policy.scaleDownUtilizationThreshold as number;
  const cpuReserve = policy.hostCpuReserve as number;
  const memoryReserve = policy.hostMemoryReserve as number;
  if (threshold > 1 || cpuReserve > 1 || memoryReserve > 1)
    throw new Error('Invalid Judge pool ratio');
}

const decisionId = (snapshot: JudgePoolSnapshot, policy: JudgePoolPolicy) =>
  `pool-${createHash('sha256')
    .update(
      JSON.stringify({
        t: snapshot.now.toISOString(),
        n: snapshot.runningNodes,
        p: snapshot.pendingJobs,
        a: snapshot.activeJobs,
        c: snapshot.schedulableCapacity,
        u: snapshot.utilization,
        avg: snapshot.averageQueueWaitMs,
        p95: snapshot.p95QueueWaitMs,
        mode: policy.mode,
        min: policy.minNodes,
        max: policy.maxNodes,
        cv: policy.controlVersion,
      }),
    )
    .digest('hex')
    .slice(0, 20)}`;

const capacityForOneNode = (
  snapshot: JudgePoolSnapshot,
  policy: JudgePoolPolicy,
) => {
  if (!snapshot.host.available) return 0;
  const cpuBudget = Math.max(
    0,
    snapshot.host.remainingCpu -
      snapshot.host.configuredCpu * policy.hostCpuReserve,
  );
  const memoryBudget = Math.max(
    0,
    snapshot.host.remainingMemoryBytes -
      snapshot.host.configuredMemoryBytes * policy.hostMemoryReserve,
  );
  const byCpu =
    snapshot.host.nodeCpu > 0
      ? Math.floor(cpuBudget / snapshot.host.nodeCpu)
      : Number.MAX_SAFE_INTEGER;
  const byMemory =
    snapshot.host.nodeMemoryBytes > 0
      ? Math.floor(memoryBudget / snapshot.host.nodeMemoryBytes)
      : Number.MAX_SAFE_INTEGER;
  return Math.max(
    0,
    Math.min(snapshot.host.maxAdditionalNodes, byCpu, byMemory),
  );
};

const audit = (
  snapshot: JudgePoolSnapshot,
  policy: JudgePoolPolicy,
  action: JudgePoolScaleAction,
  requestedNodeCount: number,
  resultingNodeCount: number,
  reason: JudgePoolReason,
): JudgePoolAuditRecord => ({
  decisionId: decisionId(snapshot, policy),
  timestamp: snapshot.now.toISOString(),
  mode: policy.mode,
  action,
  previousNodeCount: snapshot.runningNodes,
  requestedNodeCount,
  resultingNodeCount,
  pendingJobs: snapshot.pendingJobs,
  averageQueueWaitMs: snapshot.averageQueueWaitMs,
  p95QueueWaitMs: snapshot.p95QueueWaitMs,
  utilization: snapshot.utilization,
  schedulableCapacity: snapshot.schedulableCapacity,
  host: {
    configuredCpu: snapshot.host.configuredCpu,
    remainingCpu: snapshot.host.remainingCpu,
    configuredMemoryBytes: snapshot.host.configuredMemoryBytes,
    remainingMemoryBytes: snapshot.host.remainingMemoryBytes,
    maxAdditionalNodes: snapshot.host.maxAdditionalNodes,
  },
  reason,
  ...(snapshot.correlationId ? { correlationId: snapshot.correlationId } : {}),
});

const finish = (
  snapshot: JudgePoolSnapshot,
  policy: JudgePoolPolicy,
  action: JudgePoolScaleAction,
  requested: number,
  resulting: number,
  reason: JudgePoolReason,
): JudgePoolDecision => ({
  action,
  requestedNodeCount: requested,
  resultingNodeCount: resulting,
  reason,
  audit: audit(snapshot, policy, action, requested, resulting, reason),
});

/**
 * Compute one autoscaling decision. The function has no timers or side effects;
 * callers perform the requested lifecycle operation and persist the audit record.
 */
export function decideJudgePool(
  snapshot: JudgePoolSnapshot,
  policy: JudgePoolPolicy,
): JudgePoolDecision {
  assertJudgePoolPolicy(policy);
  if (policy.mode === 'MANUAL')
    return finish(
      snapshot,
      policy,
      'NOOP',
      snapshot.runningNodes,
      snapshot.runningNodes,
      'MANUAL_MODE',
    );

  const current = Math.max(0, Math.floor(snapshot.runningNodes));
  const upPressure =
    snapshot.pendingJobs >= policy.pendingJobsScaleUpThreshold ||
    snapshot.averageQueueWaitMs > policy.targetQueueWaitMs ||
    snapshot.p95QueueWaitMs > policy.targetQueueWaitMs ||
    (snapshot.schedulableCapacity <= 0 && snapshot.pendingJobs > 0);
  const fastPressure =
    snapshot.averageQueueWaitMs >= policy.fastScaleQueueWaitMs ||
    snapshot.p95QueueWaitMs >= policy.fastScaleQueueWaitMs ||
    snapshot.pendingJobs >= Math.max(1, policy.pendingJobsScaleUpThreshold * 2);

  if (upPressure) {
    const requested = Math.min(
      policy.maxNodes,
      current + (fastPressure ? policy.fastScaleUpStep : policy.scaleUpStep),
    );
    if (requested <= current)
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        current,
        current,
        'MAX_NODES_REACHED',
      );
    if (!snapshot.host.available)
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        requested,
        current,
        'HOST_AGENT_UNAVAILABLE',
      );
    const capacity = capacityForOneNode(snapshot, policy);
    const permitted = Math.min(requested - current, capacity);
    if (permitted <= 0)
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        requested,
        current,
        'HOST_CAPACITY_EXHAUSTED',
      );
    if (
      snapshot.lastScaleUpAt &&
      snapshot.now.getTime() - snapshot.lastScaleUpAt.getTime() <
        policy.scaleUpCooldownMs
    )
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        requested,
        current,
        'SCALE_UP_COOLDOWN',
      );
    const resulting = current + permitted;
    return finish(
      snapshot,
      policy,
      'SCALE_UP',
      requested,
      resulting,
      fastPressure
        ? 'FAST_SCALE_BACKLOG'
        : snapshot.pendingJobs >= policy.pendingJobsScaleUpThreshold
          ? 'PENDING_QUEUE_THRESHOLD_EXCEEDED'
          : snapshot.p95QueueWaitMs > policy.targetQueueWaitMs
            ? 'P95_QUEUE_WAIT_TARGET_EXCEEDED'
            : 'QUEUE_WAIT_TARGET_EXCEEDED',
    );
  }

  const belowLoad =
    snapshot.pendingJobs === 0 &&
    snapshot.utilization <= policy.scaleDownUtilizationThreshold;
  const idleDuration = snapshot.idleSince
    ? snapshot.now.getTime() - snapshot.idleSince.getTime()
    : 0;
  if (belowLoad) {
    if (current <= policy.minNodes)
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        current,
        current,
        'MIN_NODES_REACHED',
      );
    const requested = Math.max(policy.minNodes, current - policy.scaleDownStep);
    if (
      snapshot.lastScaleDownAt &&
      snapshot.now.getTime() - snapshot.lastScaleDownAt.getTime() <
        policy.scaleDownCooldownMs
    )
      return finish(
        snapshot,
        policy,
        'BLOCKED',
        requested,
        current,
        'SCALE_DOWN_COOLDOWN',
      );
    if (idleDuration < policy.scaleDownIdleWindowMs)
      return finish(
        snapshot,
        policy,
        'NOOP',
        requested,
        current,
        'IDLE_WINDOW_NOT_SUSTAINED',
      );
    return finish(
      snapshot,
      policy,
      'SCALE_DOWN',
      requested,
      requested,
      'LOW_UTILIZATION_IDLE_WINDOW',
    );
  }
  if (current > policy.minNodes && snapshot.pendingJobs > 0)
    return finish(
      snapshot,
      policy,
      'NOOP',
      current,
      current,
      'HYSTERESIS_ACTIVE',
    );
  return finish(
    snapshot,
    policy,
    'NOOP',
    current,
    current,
    'NO_SCALE_PRESSURE',
  );
}
