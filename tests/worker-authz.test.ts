import { describe, expect, it } from 'vitest';
import {
  createWorkerAuthorizationPolicy,
  projectWorkerCapabilities,
  projectWorkerStatus,
  type WorkerAuditEvent,
  type WorkerAuthorizationAction,
  type WorkerAuthContext,
  type WorkerJobLink,
  type WorkerStatusReference,
} from '../apps/api/src/modules/authz/index.js';

const owner: WorkerAuthContext = {
  userId: 'u1',
  status: 'active',
  sessionId: 's1',
  strength: 'password',
};
const operator: WorkerAuthContext = {
  ...owner,
  userId: 'op',
  roles: ['operator'],
};
const worker: WorkerStatusReference = {
  workerId: 'worker-a',
  workerInstanceId: 'instance-a',
  lifecycleState: 'READY',
  lastHeartbeatAt: '2026-08-29T00:00:00.000Z',
  protocolVersion: '2A.1',
  buildVersion: 'build-a',
  capabilityManifest: {
    protocolVersion: '2A.1',
    buildVersion: 'build-a',
    executionModes: ['REAL_SANDBOXED_EXECUTION'],
    safeFixture: false,
    realSandboxedExecution: true,
    sandboxCapability: true,
    maxConcurrency: 1,
    languageCapabilities: ['cpp'],
  },
  maxConcurrency: 1,
  activeJobCount: 1,
  activeJobIds: ['j1'],
  degraded: false,
  offline: false,
  processId: 'pid-secret',
  rawLeaseToken: 'LEASE_TOKEN_SECRET',
  redisEndpoint: 'redis://secret',
  stackTrace: 'private stack',
  sourceBody: 'AUTHZ_SOURCE_MARKER',
  diagnosticCode: 'WORKER_OK',
};
const job: WorkerJobLink = {
  jobId: 'j1',
  submissionId: 'sub1',
  ownerUserId: 'u1',
  workerId: 'worker-a',
  state: 'QUEUED',
};
const actions = new Map<string, ReadonlySet<WorkerAuthorizationAction>>([
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
const make = (
  extra: Parameters<typeof createWorkerAuthorizationPolicy>[0] = {},
) =>
  createWorkerAuthorizationPolicy({
    roles: actions,
    resolveUserRoles: (id) => (id === 'op' ? ['operator'] : []),
    resolveWorker: (id) => id === 'worker-a',
    resolveJudgeJob: (id) => (id === 'j1' ? job : null),
    resolveSubmissionOwner: (id) => (id === 'sub1' ? 'u1' : null),
    ...extra,
  });
describe('Phase 2A Worker Authz A2A-01..A2A-24', () => {
  it('A2A-01 unauthenticated protected worker health denied', async () =>
    expect(await make().canInspectWorkerDiagnostics(undefined, worker)).toBe(
      false,
    ));
  it('A2A-02 active operator safe worker view allowed', async () =>
    expect(await make().canViewWorkerStatus(operator, worker)).toBe(true));
  it('A2A-03 ordinary user global inspect denied', async () =>
    expect(await make().canInspectWorkerDiagnostics(owner, worker)).toBe(
      false,
    ));
  it('A2A-04 inactive operator denied', async () =>
    expect(
      await make().canInspectWorkerDiagnostics(
        { ...operator, status: 'disabled' },
        worker,
      ),
    ).toBe(false));
  it('A2A-05 malformed auth context denied', async () =>
    expect(
      await make().canViewWorkerStatus(
        { userId: '', status: 'active' },
        worker,
        job,
      ),
    ).toBe(false));
  it('A2A-06 unknown operation deny-by-default', async () =>
    expect(
      await make().canWorkerOperation('restart', operator, worker, job),
    ).toBe(false));
  it('A2A-07 unknown worker state fail-closed', async () =>
    expect(
      await make().canCancelJudgeJob(operator, worker, {
        ...job,
        state: 'UNKNOWN',
      } as never),
    ).toBe(false));
  it('A2A-08 capability spoof denied', async () =>
    expect(
      await make().canInspectWorkerDiagnostics(
        { ...owner, roles: ['Operator', 'worker:diagnostics:inspect'] },
        worker,
      ),
    ).toBe(false));
  it('A2A-09 authoritative ownership used for cancel', async () =>
    expect(
      await make().canCancelJudgeJob(operator, worker, {
        ...job,
        ownerUserId: 'forged',
      }),
    ).toBe(false));
  it('A2A-10 cross-user horizontal cancellation denied', async () =>
    expect(
      await make().canCancelJudgeJob(
        { ...operator, userId: 'u2' },
        worker,
        job,
      ),
    ).toBe(false));
  it('A2A-11 terminal cancel rule', async () =>
    expect(
      await make({
        resolveJudgeJob: () => ({ ...job, state: 'SAFE_FIXTURE_SUCCEEDED' }),
      }).canCancelJudgeJob(operator, worker, {
        ...job,
        state: 'SAFE_FIXTURE_SUCCEEDED',
      }),
    ).toBe(false));
  it('A2A-12 inspect/control capabilities remain distinct', async () => {
    const inspectOnly = new Map<string, ReadonlySet<WorkerAuthorizationAction>>(
      [['reviewer', new Set(['worker:diagnostics:inspect'])]],
    );
    const user = { ...operator, roles: ['reviewer'] };
    expect(
      await make({
        roles: inspectOnly,
        resolveUserRoles: () => ['reviewer'],
      }).canInspectWorkerDiagnostics(user, worker),
    ).toBe(true);
    expect(
      await make({
        roles: inspectOnly,
        resolveUserRoles: () => ['reviewer'],
      }).canCancelJudgeJob(user, worker, job),
    ).toBe(false);
  });
  it('A2A-13 unsupported restart/drain denied', async () =>
    expect(await make().canWorkerOperation('drain', operator, worker)).toBe(
      false,
    ));
  it('A2A-14 manifest cannot claim real execution', () => {
    const manifest = projectWorkerCapabilities(worker, operator, actions);
    expect(manifest).toMatchObject({
      protocolVersion: '2A.1',
      executionModes: ['SAFE_FIXTURE_QUALIFICATION'],
      safeFixture: true,
      realSandboxedExecution: false,
      sandboxCapability: false,
      languageCapabilities: [],
    });
  });
  it('A2A-15 source marker absent from audit', async () => {
    const events: WorkerAuditEvent[] = [];
    await make({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canCancelJudgeJob(operator, worker, {
      ...job,
      sourceBody: 'SOURCE_MARKER',
    } as never);
    expect(JSON.stringify(events)).not.toContain('SOURCE_MARKER');
  });
  it('A2A-16 session secret absent', async () => {
    const events: WorkerAuditEvent[] = [];
    await make({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canInspectWorkerDiagnostics(
      { ...operator, sessionId: 'SESSION_SECRET' },
      worker,
    );
    expect(JSON.stringify(events)).not.toContain('SESSION_SECRET');
  });
  it('A2A-17 raw lease token absent', async () => {
    const events: WorkerAuditEvent[] = [];
    await make({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canInspectWorkerDiagnostics(operator, {
      ...worker,
      rawLeaseToken: 'LEASE_SECRET',
    });
    expect(JSON.stringify(events)).not.toContain('LEASE_SECRET');
  });
  it('A2A-18 arbitrary request fields not copied to audit', async () => {
    const events: WorkerAuditEvent[] = [];
    await make({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canWorkerOperation('cancel', operator, worker, {
      ...job,
      command: 'rm -rf',
      executablePath: 'C:\\secret',
    } as never);
    expect(JSON.stringify(events)).not.toContain('rm -rf');
    expect(JSON.stringify(events)).not.toContain('executablePath');
  });
  it('A2A-19 decision side-effect free', async () => {
    let calls = 0;
    await make({
      resolveWorker: () => {
        calls += 1;
        return true;
      },
    }).canInspectWorkerDiagnostics(operator, worker);
    expect(calls).toBe(1);
  });
  it('A2A-20 repeated denied request safe', async () => {
    expect(await make().canCancelJudgeJob(owner, worker, job)).toBe(false);
    expect(await make().canCancelJudgeJob(owner, worker, job)).toBe(false);
  });
  it('A2A-21 stale session/inactive account denied', async () =>
    expect(
      await make().canViewWorkerStatus(
        { ...owner, status: 'deactivated' },
        worker,
        job,
      ),
    ).toBe(false));
  it('A2A-22 worker/job mismatch cannot escalate', async () =>
    expect(
      await make().canCancelJudgeJob(
        operator,
        { ...worker, workerId: 'worker-b' },
        job,
      ),
    ).toBe(false));
  it('A2A-23 malformed worker identity denied', async () =>
    expect(
      await make().canViewWorkerStatus(operator, { ...worker, workerId: '' }),
    ).toBe(false));
  it('A2A-24 reason/error codes do not leak secrets', async () => {
    const events: WorkerAuditEvent[] = [];
    await make({
      auditHook: {
        record: (event) => {
          events.push(event);
        },
      },
    }).canWorkerOperation('restart', operator, worker, undefined, 'req-24');
    expect(events[0]?.reasonCode).toBe('DENIED');
    expect(JSON.stringify(events)).not.toMatch(/secret|token|stack|source/i);
  });
});

describe('Worker resource projections and NEG-01..NEG-15', () => {
  it('projects only safe fields to an owner and safe capabilities to operators', () => {
    const ownerView = projectWorkerStatus(worker, owner, job, actions);
    expect(ownerView).toMatchObject({
      workerId: 'worker-a',
      lifecycleState: 'READY',
    });
    expect(ownerView).not.toHaveProperty('activeJobIds');
    const operatorView = projectWorkerStatus(
      worker,
      operator,
      undefined,
      actions,
    );
    expect(operatorView).toHaveProperty('activeJobIds');
    expect(
      projectWorkerCapabilities(worker, operator, actions)
        ?.realSandboxedExecution,
    ).toBe(false);
  });
  it('NEG-01 forged worker id cannot bypass policy', async () =>
    expect(
      await make().canInspectWorkerDiagnostics(operator, {
        ...worker,
        workerId: 'forged',
      }),
    ).toBe(false));
  it('NEG-02 arbitrary control payload cannot inject command/path', async () =>
    expect(
      await make().canWorkerOperation('restart', operator, worker, {
        ...job,
        command: 'shell',
        path: '/tmp',
      } as never),
    ).toBe(false));
  it('NEG-03 diagnostic enumeration denied to unrelated user', async () =>
    expect(
      await make().canInspectWorkerDiagnostics(
        { ...owner, userId: 'u2' },
        worker,
      ),
    ).toBe(false));
  it('NEG-04 operator cancellation uses exact worker authority', async () =>
    expect(
      await make().canCancelJudgeJob(
        operator,
        { ...worker, workerId: 'forged' },
        job,
      ),
    ).toBe(false));
  it('NEG-05 missing resolver fails closed', async () =>
    expect(
      await createWorkerAuthorizationPolicy({
        roles: actions,
      }).canCancelJudgeJob(operator, worker, job),
    ).toBe(false));
  it('NEG-06 unknown lifecycle state is not projected', () =>
    expect(
      projectWorkerStatus(
        { ...worker, lifecycleState: 'ALIEN' } as never,
        operator,
        undefined,
        actions,
      ),
    ).toBeNull());
  it('NEG-07 terminal cancel is a denial/no-op', async () =>
    expect(
      await make({
        resolveJudgeJob: () => ({ ...job, state: 'CANCELLED' }),
      }).canCancelJudgeJob(operator, worker, { ...job, state: 'CANCELLED' }),
    ).toBe(false));
  it('NEG-08 client role cannot grant capability', async () =>
    expect(
      await make().canInspectWorkerDiagnostics(
        { ...owner, roles: ['operator'] },
        worker,
      ),
    ).toBe(false));
  it('NEG-09 null identifiers fail safely', async () =>
    expect(
      await make().canCancelJudgeJob(operator, worker, { ...job, jobId: '' }),
    ).toBe(false));
  it('NEG-10 cross-user horizontal cancellation denied', async () =>
    expect(
      await make().canCancelJudgeJob({ ...owner, userId: 'u2' }, worker, {
        ...job,
        ownerUserId: 'u1',
      }),
    ).toBe(false));
  it('NEG-11 exact operator scope is required', async () =>
    expect(await make().canViewWorkerCapabilities(owner, worker)).toBe(false));
  it('NEG-12 no queue/worker mutation API exists on policy', () =>
    expect(make()).not.toHaveProperty('enqueue'));
  it('NEG-13 replayed privileged request rechecks account state', async () => {
    const replay = { ...operator };
    expect(await make().canInspectWorkerDiagnostics(replay, worker)).toBe(true);
    replay.status = 'disabled';
    expect(await make().canInspectWorkerDiagnostics(replay, worker)).toBe(
      false,
    );
  });
  it('NEG-14 hidden fields never appear in safe projection', () => {
    const projection = projectWorkerStatus(
      worker,
      operator,
      undefined,
      actions,
    );
    expect(JSON.stringify(projection)).not.toMatch(
      /pid-secret|LEASE_TOKEN|redis|stack|SOURCE_MARKER/i,
    );
  });
  it('NEG-15 safe fixture is the only advertised execution mode', () =>
    expect(
      projectWorkerCapabilities(worker, operator, actions)?.executionModes,
    ).toEqual(['SAFE_FIXTURE_QUALIFICATION']));
});
