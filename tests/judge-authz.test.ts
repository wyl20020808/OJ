import { describe, expect, it } from 'vitest';
import {
  createJudgeAuthorizationPolicy,
  type JudgeAuditEvent,
  type JudgeAuthorizationAction,
  type JudgeAuthorizationUser,
} from '../apps/api/src/modules/authz/index.js';

const owner: JudgeAuthorizationUser = {
  userId: 'u1',
  status: 'active',
  sessionId: 's1',
  strength: 'password',
};
const job = {
  id: 'j1',
  submissionId: 'sub1',
  ownerUserId: 'u1',
  state: 'QUEUED' as const,
};

describe('judge authorization policy', () => {
  it('allows owners to view and inspect their metadata only', async () => {
    const policy = createJudgeAuthorizationPolicy();
    expect(await policy.canViewJudgeJob(owner, job)).toBe(true);
    expect(await policy.canInspectJudgeJob(owner, job)).toBe(true);
    expect(await policy.canViewJudgeJob({ ...owner, userId: 'u2' }, job)).toBe(
      false,
    );
    expect(
      await policy.canInspectJudgeJob({ ...owner, userId: 'u2' }, job),
    ).toBe(false);
  });

  it('denies malformed and inactive contexts by default', async () => {
    const policy = createJudgeAuthorizationPolicy();
    const malformed = { userId: 'u1', status: 'active' as const };
    expect(await policy.canViewJudgeJob(malformed, job)).toBe(false);
    expect(await policy.canInspectJudgeJob(undefined, job)).toBe(false);
    for (const status of ['disabled', 'deactivated'] as const) {
      expect(await policy.canViewJudgeJob({ ...owner, status }, job)).toBe(
        false,
      );
      expect(await policy.canEnqueueJudgeJob({ ...owner, status })).toBe(false);
    }
    expect(await policy.canViewJudgeJob(owner, undefined)).toBe(false);
  });

  it('requires explicit operator roles for enqueue, retry, cancel, and inspect', async () => {
    const roles = new Map<string, ReadonlySet<JudgeAuthorizationAction>>([
      [
        'operator',
        new Set<JudgeAuthorizationAction>([
          'judge:job:view',
          'judge:job:inspect',
          'judge:job:enqueue',
          'judge:job:retry',
          'judge:job:cancel',
        ]),
      ],
    ]);
    const policy = createJudgeAuthorizationPolicy({ roles });
    const operator = { ...owner, userId: 'op', roles: ['operator'] };
    expect(await policy.canViewJudgeJob(operator, job)).toBe(true);
    expect(await policy.canInspectJudgeJob(operator, job)).toBe(true);
    expect(await policy.canEnqueueJudgeJob(operator)).toBe(true);
    expect(await policy.canRetryJudgeJob(operator, job)).toBe(true);
    expect(await policy.canCancelJudgeJob(operator, job)).toBe(true);
    expect(await policy.canRetryJudgeJob(owner, job)).toBe(false);
    expect(await policy.canCancelJudgeJob(owner, job)).toBe(false);
  });

  it('denies retry and cancel for terminal jobs', async () => {
    const roles = new Map<string, ReadonlySet<JudgeAuthorizationAction>>([
      [
        'operator',
        new Set<JudgeAuthorizationAction>([
          'judge:job:retry',
          'judge:job:cancel',
        ]),
      ],
    ]);
    const policy = createJudgeAuthorizationPolicy({ roles });
    const operator = { ...owner, roles: ['operator'] };
    for (const state of [
      'CANCELLED',
      'SUCCEEDED_FAKE',
      'FAILED_TERMINAL',
    ] as const) {
      expect(await policy.canRetryJudgeJob(operator, { ...job, state })).toBe(
        false,
      );
      expect(await policy.canCancelJudgeJob(operator, { ...job, state })).toBe(
        false,
      );
    }
  });

  it('emits safe audit metadata without source, credentials, hashes, or raw sessions', async () => {
    const events: JudgeAuditEvent[] = [];
    const policy = createJudgeAuthorizationPolicy({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    });
    await policy.canViewJudgeJob(owner, job, 'req-7');
    await policy.canRetryJudgeJob(owner, job, 'req-8');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actorUserId: 'u1',
      action: 'judge:job:view',
      resource: 'judge_job',
      resourceId: 'j1',
      outcome: 'allowed',
      requestId: 'req-7',
    });
    expect(events[1]?.outcome).toBe('denied');
    for (const event of events) {
      expect(event).not.toHaveProperty('source');
      expect(event).not.toHaveProperty('password');
      expect(event).not.toHaveProperty('token');
      expect(event).not.toHaveProperty('sessionId');
    }
  });
});
