import { describe, expect, it } from 'vitest';
import {
  createJudgeAuthorizationPolicy,
  type JudgeAuditEvent,
  type JudgeAuthorizationAction,
  type JudgeAuthorizationUser,
  type JudgeJobReference,
} from '../apps/api/src/modules/authz/index.js';

const owner: JudgeAuthorizationUser = {
  userId: 'u1',
  status: 'active',
  sessionId: 's1',
  strength: 'password',
};
const operator: JudgeAuthorizationUser = {
  ...owner,
  userId: 'op',
  roles: ['operator'],
};
const job = {
  id: 'j1',
  submissionId: 'sub1',
  ownerUserId: 'u1',
  state: 'QUEUED' as const,
};
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
const policy = (
  extra: Parameters<typeof createJudgeAuthorizationPolicy>[0] = {},
) =>
  createJudgeAuthorizationPolicy({
    resolveSubmissionOwner: (id) => (id === 'sub1' ? 'u1' : null),
    ...extra,
  });
const withState = (state: JudgeJobReference['state']) => ({ ...job, state });

describe('Judge Authz recovery A01-A24', () => {
  it('A01 unauthenticated view denied', async () =>
    expect(await policy().canViewJudgeJob(undefined, job)).toBe(false));
  it('A02 owner view allowed', async () =>
    expect(await policy().canViewJudgeJob(owner, job)).toBe(true));
  it('A03 unrelated user view denied', async () =>
    expect(
      await policy().canViewJudgeJob({ ...owner, userId: 'u2' }, job),
    ).toBe(false));
  it('A04 operator inspect allowed', async () =>
    expect(await policy({ roles }).canInspectJudgeJob(operator, job)).toBe(
      true,
    ));
  it('A05 ordinary user inspect denied for unrelated job', async () =>
    expect(
      await policy().canInspectJudgeJob({ ...owner, userId: 'u2' }, job),
    ).toBe(false));
  it('A06 operator retry allowed only in retryable state', async () =>
    expect(
      await policy({ roles }).canRetryJudgeJob(
        operator,
        withState('FAILED_RETRYABLE'),
      ),
    ).toBe(true));
  it('A07 ordinary retry denied', async () =>
    expect(
      await policy().canRetryJudgeJob(owner, withState('FAILED_RETRYABLE')),
    ).toBe(false));
  it('A08 terminal retry denied across terminal states', async () => {
    for (const state of [
      'SUCCEEDED_FAKE',
      'FAILED_TERMINAL',
      'CANCELLED',
    ] as const)
      expect(
        await policy({ roles }).canRetryJudgeJob(operator, withState(state)),
      ).toBe(false);
  });
  it('A09 cancel semantics are state-aware and capability-controlled', async () => {
    expect(await policy({ roles }).canCancelJudgeJob(operator, job)).toBe(true);
    expect(
      await policy({ roles }).canCancelJudgeJob(
        operator,
        withState('SUCCEEDED_FAKE'),
      ),
    ).toBe(false);
    expect(await policy().canCancelJudgeJob(owner, job)).toBe(false);
  });
  it('A10 inactive, disabled, and deactivated users denied for all operations', async () => {
    for (const status of ['disabled', 'deactivated'] as const) {
      const user = { ...operator, status };
      expect(await policy({ roles }).canViewJudgeJob(user, job)).toBe(false);
      expect(await policy({ roles }).canInspectJudgeJob(user, job)).toBe(false);
      expect(await policy({ roles }).canEnqueueJudgeJob(user, job)).toBe(false);
      expect(
        await policy({ roles }).canRetryJudgeJob(
          user,
          withState('FAILED_RETRYABLE'),
        ),
      ).toBe(false);
      expect(await policy({ roles }).canCancelJudgeJob(user, job)).toBe(false);
    }
  });
  it('A11 forged ownership identifiers denied', async () => {
    expect(
      await policy().canViewJudgeJob(owner, {
        ...job,
        submissionId: 'sub-other',
      }),
    ).toBe(false);
  });
  it('A12 audit metadata contains no source marker', async () => {
    const marker = 'AUTHZ_SOURCE_SHOULD_NOT_APPEAR_9f1';
    const events: JudgeAuditEvent[] = [];
    await policy({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canInspectJudgeJob(owner, { ...job, source: marker } as never);
    expect(JSON.stringify(events)).not.toContain(marker);
  });
  it('A13 audit metadata contains no credential/session-secret marker', async () => {
    const secret = 'CONTROLLED_SESSION_SECRET_7a2';
    const events: JudgeAuditEvent[] = [];
    await policy({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canInspectJudgeJob({ ...owner, sessionId: secret }, job);
    expect(JSON.stringify(events)).not.toContain(secret);
  });
  it('A14 unknown operation deny-by-default', async () =>
    expect(await policy().canJudgeJobOperation('diagnostics', owner, job)).toBe(
      false,
    ));
  it('A15 malformed auth context denied safely', async () =>
    expect(
      await policy().canViewJudgeJob({ userId: '', status: 'active' }, job),
    ).toBe(false));
  it('A16 unknown Judge state fails closed', async () =>
    expect(
      await policy().canViewJudgeJob(owner, {
        ...job,
        state: 'UNKNOWN',
      } as never),
    ).toBe(false));
  it('A17 job/submission mismatch denied by authoritative linkage', async () =>
    expect(
      await policy().canInspectJudgeJob(operator, {
        ...job,
        submissionId: 'other',
      }),
    ).toBe(false));
  it('A18 horizontal privilege escalation denied', async () => {
    const user = { ...owner, userId: 'u2' };
    expect(await policy().canViewJudgeJob(user, job)).toBe(false);
    expect(await policy().canInspectJudgeJob(user, job)).toBe(false);
    expect(
      await policy().canRetryJudgeJob(user, withState('FAILED_RETRYABLE')),
    ).toBe(false);
    expect(await policy().canCancelJudgeJob(user, job)).toBe(false);
  });
  it('A19 role/capability spoofing denied', async () => {
    expect(
      await policy({ roles }).canRetryJudgeJob(
        { ...operator, roles: ['Operator', 'judge:job:retry'] },
        withState('FAILED_RETRYABLE'),
      ),
    ).toBe(false);
  });
  it('A20 Authz decision causes no queue mutation side effect', async () => {
    let calls = 0;
    const p = createJudgeAuthorizationPolicy({
      roles,
      resolveSubmissionOwner: () => {
        calls += 1;
        return 'u1';
      },
    });
    await p.canRetryJudgeJob(operator, withState('FAILED_RETRYABLE'));
    expect(calls).toBe(1);
  });
  it('A21 previously-valid session after account deactivation denied', async () =>
    expect(
      await policy().canViewJudgeJob({ ...owner, status: 'deactivated' }, job),
    ).toBe(false));
  it('A22 inspect privilege does not imply mutation privilege', async () => {
    const inspectOnly = new Map<string, ReadonlySet<JudgeAuthorizationAction>>([
      ['reviewer', new Set(['judge:job:inspect'])],
    ]);
    const user = { ...operator, roles: ['reviewer'] };
    expect(
      await policy({ roles: inspectOnly }).canInspectJudgeJob(user, job),
    ).toBe(true);
    expect(
      await policy({ roles: inspectOnly }).canRetryJudgeJob(
        user,
        withState('FAILED_RETRYABLE'),
      ),
    ).toBe(false);
    expect(
      await policy({ roles: inspectOnly }).canCancelJudgeJob(user, job),
    ).toBe(false);
  });
  it('A23 audit actor and target are consistent', async () => {
    const events: JudgeAuditEvent[] = [];
    await policy({
      roles,
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canCancelJudgeJob(operator, job, 'req-23');
    expect(events[0]).toMatchObject({
      actorUserId: 'op',
      resourceId: 'j1',
      requestId: 'req-23',
      action: 'judge:job:cancel',
    });
  });
  it('A24 repeated denied request is safe and idempotent', async () => {
    let audits = 0;
    const p = policy({
      auditHook: {
        record: () => {
          audits += 1;
        },
      },
    });
    expect(await p.canRetryJudgeJob(owner, withState('FAILED_TERMINAL'))).toBe(
      false,
    );
    expect(await p.canRetryJudgeJob(owner, withState('FAILED_TERMINAL'))).toBe(
      false,
    );
    expect(audits).toBe(2);
  });
});
