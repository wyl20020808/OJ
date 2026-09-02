import { describe, expect, it } from 'vitest';
import {
  assertJudgePoolPolicy,
  decideJudgePool,
  type JudgePoolPolicy,
  type JudgePoolSnapshot,
} from '../apps/judge-service/src/pool-autoscaler.js';

const policy: JudgePoolPolicy = {
  mode: 'AUTOMATIC',
  templateId: 'cpp20-standard-v1',
  minNodes: 1,
  maxNodes: 6,
  targetQueueWaitMs: 1_000,
  fastScaleQueueWaitMs: 5_000,
  pendingJobsScaleUpThreshold: 3,
  scaleUpStep: 1,
  fastScaleUpStep: 3,
  scaleDownStep: 1,
  scaleDownUtilizationThreshold: 0.2,
  scaleDownIdleWindowMs: 10_000,
  scaleUpCooldownMs: 5_000,
  scaleDownCooldownMs: 5_000,
  hostCpuReserve: 0.1,
  hostMemoryReserve: 0.1,
  controlVersion: 7,
};

const snapshot = (
  overrides: Partial<JudgePoolSnapshot> = {},
): JudgePoolSnapshot => ({
  now: new Date('2026-09-02T00:00:00.000Z'),
  runningNodes: 2,
  pendingJobs: 0,
  activeJobs: 1,
  schedulableCapacity: 3,
  utilization: 0.5,
  averageQueueWaitMs: 0,
  p95QueueWaitMs: 0,
  host: {
    configuredCpu: 8,
    remainingCpu: 8,
    configuredMemoryBytes: 16 * 1024 ** 3,
    remainingMemoryBytes: 16 * 1024 ** 3,
    maxAdditionalNodes: 6,
    nodeCpu: 1,
    nodeMemoryBytes: 1024 ** 3,
    available: true,
  },
  ...overrides,
});

describe('Judge pool autoscaler', () => {
  it('never changes desired count in MANUAL mode', () => {
    const result = decideJudgePool(snapshot({ pendingJobs: 100 }), {
      ...policy,
      mode: 'MANUAL',
    });
    expect(result).toMatchObject({
      action: 'NOOP',
      requestedNodeCount: 2,
      resultingNodeCount: 2,
      reason: 'MANUAL_MODE',
    });
  });

  it('performs normal and fast scale-up from queue pressure', () => {
    expect(decideJudgePool(snapshot({ pendingJobs: 3 }), policy)).toMatchObject(
      {
        action: 'SCALE_UP',
        resultingNodeCount: 3,
        reason: 'PENDING_QUEUE_THRESHOLD_EXCEEDED',
      },
    );
    expect(
      decideJudgePool(
        snapshot({ pendingJobs: 10, averageQueueWaitMs: 6_000 }),
        policy,
      ),
    ).toMatchObject({
      action: 'SCALE_UP',
      resultingNodeCount: 5,
      reason: 'FAST_SCALE_BACKLOG',
    });
  });

  it('bounds scale-up by max nodes and host CPU/RAM reserves', () => {
    expect(
      decideJudgePool(snapshot({ runningNodes: 6, pendingJobs: 10 }), policy),
    ).toMatchObject({ action: 'BLOCKED', reason: 'MAX_NODES_REACHED' });
    expect(
      decideJudgePool(
        snapshot({
          pendingJobs: 10,
          host: {
            ...snapshot().host,
            remainingCpu: 0.2,
            remainingMemoryBytes: 0.2 * 1024 ** 3,
            maxAdditionalNodes: 6,
          },
        }),
        policy,
      ),
    ).toMatchObject({ action: 'BLOCKED', reason: 'HOST_CAPACITY_EXHAUSTED' });
  });

  it('honors independent cooldowns and sustained idle hysteresis', () => {
    const now = new Date('2026-09-02T00:00:10.000Z');
    expect(
      decideJudgePool(
        snapshot({
          pendingJobs: 3,
          lastScaleUpAt: new Date('2026-09-02T00:00:08.000Z'),
        }),
        policy,
      ),
    ).toMatchObject({ action: 'BLOCKED', reason: 'SCALE_UP_COOLDOWN' });
    expect(
      decideJudgePool(
        snapshot({
          now,
          utilization: 0.1,
          idleSince: new Date('2026-09-02T00:00:05.000Z'),
        }),
        policy,
      ),
    ).toMatchObject({ action: 'NOOP', reason: 'IDLE_WINDOW_NOT_SUSTAINED' });
    expect(
      decideJudgePool(
        snapshot({
          now,
          utilization: 0.1,
          idleSince: new Date('2026-09-02T00:00:00.000Z'),
        }),
        policy,
      ),
    ).toMatchObject({
      action: 'SCALE_DOWN',
      resultingNodeCount: 1,
      reason: 'LOW_UTILIZATION_IDLE_WINDOW',
    });
  });

  it('records deterministic bounded audit data and rejects invalid policies', () => {
    const first = decideJudgePool(
      snapshot({ correlationId: 'corr-1' }),
      policy,
    );
    const second = decideJudgePool(
      snapshot({ correlationId: 'corr-1' }),
      policy,
    );
    expect(first.audit).toEqual(second.audit);
    expect(first.audit).toMatchObject({
      mode: 'AUTOMATIC',
      previousNodeCount: 2,
      pendingJobs: 0,
      correlationId: 'corr-1',
    });
    expect(() => assertJudgePoolPolicy({ ...policy, minNodes: 7 })).toThrow();
  });
});
