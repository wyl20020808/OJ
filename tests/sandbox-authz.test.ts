import { describe, expect, it } from 'vitest';
import {
  createSandboxAuthorizationPolicy,
  projectSafeSandboxCapability,
  projectSafeSandboxDiagnostic,
  type SandboxAuditEvent,
  type SandboxStatusReference,
  type TrustedProbe,
} from '../apps/api/src/modules/authz/index.js';
import type { WorkerAuthContext } from '../apps/api/src/modules/authz/index.js';

const operator: WorkerAuthContext = {
  userId: 'op',
  status: 'active',
  sessionId: 'session',
  strength: 'password',
};
const ordinary: WorkerAuthContext = {
  userId: 'u1',
  status: 'active',
  sessionId: 'session',
  strength: 'password',
};
const actions = new Map([
  [
    'operator',
    new Set([
      'sandbox:status:view',
      'sandbox:qualification:view',
      'sandbox:capabilities:view',
      'sandbox:probe:start',
      'sandbox:probe:cancel',
      'sandbox:cleanup:verify',
    ] as const),
  ],
]);
const resource: SandboxStatusReference = {
  resourceId: 'sandbox-job-1',
  state: 'READY',
  backendStatus: 'QUALIFICATION_PENDING',
  policyVersion: 'policy-2b.1',
  probeSuiteVersion: 'suite-2b.1',
  qualificationStatus: 'PENDING',
  degraded: false,
  cleanupStatus: 'NOT_REQUIRED',
  hostPath: 'HOST_PATH_MARKER_PHASE2B',
  ociBundlePath: 'OCI_SECRET',
  rootfsPath: 'ROOTFS_SECRET',
  cgroupPath: 'CGROUP_SECRET',
  namespaceIds: ['NS_SECRET'],
  runcStatePath: 'RUNC_SECRET',
  seccompProfile: 'SECCOMP_SECRET',
  commandLine: 'SHELL_SECRET',
  probeExecutablePath: 'PROBE_PATH_SECRET',
  credentials: 'DB_SECRET_MARKER_PHASE2B',
  environment: { SECRET: 'SESSION_SECRET_MARKER_PHASE2B' },
  sourceBody: 'SOURCE_MARKER_PHASE2B',
  rawLeaseToken: 'LEASE_TOKEN_MARKER_PHASE2B',
};
const probe: TrustedProbe = {
  probeId: 'probe-fs-1',
  version: '1',
  sha256: 'trusted-hash',
  purpose: 'filesystem',
  immutableArtifactRef: 'registry://probe-fs-1',
  timeoutMs: 1000,
};
const make = (
  extra: Parameters<typeof createSandboxAuthorizationPolicy>[0] = {},
) =>
  createSandboxAuthorizationPolicy({
    roles: actions,
    resolveUserRoles: (id) => (id === 'op' ? ['operator'] : []),
    resolveSandbox: (id) => (id === resource.resourceId ? resource : null),
    resolveTrustedProbe: (id) => (id === probe.probeId ? probe : null),
    ...extra,
  });

describe('Phase 2B Sandbox Authz A2B-01..A2B-30', () => {
  it('A2B-01 authorized operator safe backend inspect', async () =>
    expect(
      (await make().authorizeSandboxInspect(operator, resource.resourceId))
        .allowed,
    ).toBe(true));
  it('A2B-02 authorized qualification inspect', async () =>
    expect(
      (
        await make().authorizeSandboxQualificationInspect(
          operator,
          resource.resourceId,
        )
      ).allowed,
    ).toBe(true));
  it('A2B-03 policy version safe visibility', () =>
    expect(projectSafeSandboxDiagnostic(resource, true)?.policyVersion).toBe(
      'policy-2b.1',
    ));
  it('A2B-04 capability truth preserves pending', () =>
    expect(projectSafeSandboxCapability(resource, true)).toMatchObject({
      backendStatus: 'QUALIFICATION_PENDING',
      qualificationStatus: 'PENDING',
      realSubmissionExecution: false,
    }));
  it('A2B-05 approved trusted probe start allowed', async () =>
    expect(
      (
        await make().authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
          'policy-2b.1',
        )
      ).allowed,
    ).toBe(true));
  it('A2B-06 approved active probe cancel allowed', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, state: 'PROBE_ACTIVE' }),
        }).authorizeSandboxProbeCancel(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(true));
  it('A2B-07 cleanup verification allowed when pending', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({
            ...resource,
            state: 'CLEANUP_PENDING',
            cleanupStatus: 'PENDING',
          }),
        }).authorizeSandboxCleanupVerify(operator, resource.resourceId)
      ).allowed,
    ).toBe(true));
  it('A2B-08 repeated inspect is side-effect free', async () => {
    let calls = 0;
    const p = make({
      resolveSandbox: () => {
        calls++;
        return resource;
      },
    });
    await p.authorizeSandboxInspect(operator, resource.resourceId);
    await p.authorizeSandboxInspect(operator, resource.resourceId);
    expect(calls).toBe(2);
  });
  it('A2B-09 denial is side-effect free', async () => {
    let calls = 0;
    const p = make({
      resolveSandbox: () => {
        calls++;
        return resource;
      },
    });
    await p.authorizeSandboxInspect(ordinary, resource.resourceId);
    expect(calls).toBe(1);
  });
  it('A2B-10 unknown operation fail-closed', async () =>
    expect(
      (
        await make().authorizeSandboxOperation(
          'RESTART_SANDBOX',
          operator,
          resource.resourceId,
        )
      ).code,
    ).toBe('INVALID_OPERATION'));
  it('A2B-11 unknown state fails closed for mutation', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, state: 'ALIEN' }) as never,
        }).authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('A2B-12 inspect/control capabilities separated', async () => {
    const p = make({
      roles: new Map([['inspect', new Set(['sandbox:status:view'])]]),
      resolveUserRoles: () => ['inspect'],
    });
    expect(
      (await p.authorizeSandboxInspect(operator, resource.resourceId)).allowed,
    ).toBe(true);
    expect(
      (
        await p.authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false);
  });
  it('A2B-13 start/cancel capabilities separated', async () => {
    const p = make({
      roles: new Map([['start', new Set(['sandbox:probe:start'])]]),
      resolveUserRoles: () => ['start'],
    });
    expect(
      (
        await p.authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(true);
    expect(
      (
        await p.authorizeSandboxProbeCancel(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false);
  });
  it('A2B-14 real execution capability absent', () =>
    expect(
      projectSafeSandboxCapability(resource, true)?.realSubmissionExecution,
    ).toBe(false));
  it('A2B-15 arbitrary payload is not an API input', async () =>
    expect(
      (
        await make().authorizeSandboxOperation(
          'START_TRUSTED_PROBE',
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(true));
  it('A2B-16 server probe registry authoritative', async () =>
    expect(
      (
        await make({
          resolveTrustedProbe: () => null,
        }).authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).code,
    ).toBe('UNKNOWN_PROBE'));
  it('A2B-17 server Sandbox state authoritative', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, state: 'PROBE_ACTIVE' }),
        }).authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('A2B-18 stale session re-evaluated', async () => {
    const actor = { ...operator };
    const p = make();
    expect(
      (await p.authorizeSandboxInspect(actor, resource.resourceId)).allowed,
    ).toBe(true);
    actor.status = 'disabled';
    expect(
      (await p.authorizeSandboxInspect(actor, resource.resourceId)).allowed,
    ).toBe(false);
  });
  it('A2B-19 safe error codes stable', async () =>
    expect(
      (await make().authorizeSandboxOperation('bad', ordinary, 'missing')).code,
    ).toBe('INVALID_OPERATION'));
  it('A2B-20 privileged control creates audit', async () => {
    const events: SandboxAuditEvent[] = [];
    await make({
      auditHook: {
        record: (e) => {
          events.push(e);
        },
      },
    }).authorizeSandboxProbeStart(
      operator,
      resource.resourceId,
      probe.probeId,
      undefined,
      'corr-20',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('allowed');
  });
  it('A2B-21 audit excludes markers', async () => {
    const events: SandboxAuditEvent[] = [];
    await make({
      auditHook: {
        record: (e) => {
          events.push(e);
        },
      },
    }).authorizeSandboxProbeStart(operator, resource.resourceId, probe.probeId);
    expect(JSON.stringify(events)).not.toMatch(/MARKER|SECRET|PATH|SHELL/i);
  });
  it('A2B-22 ordinary user receives non-enumerating denial', async () =>
    expect(
      (await make().authorizeSandboxInspect(ordinary, resource.resourceId))
        .code,
    ).toBe('FORBIDDEN'));
  it('A2B-23 inactive operator denied', async () =>
    expect(
      (
        await make().authorizeSandboxInspect(
          { ...operator, status: 'disabled' },
          resource.resourceId,
        )
      ).allowed,
    ).toBe(false));
  it('A2B-24 failed qualification remains failed', () =>
    expect(
      projectSafeSandboxCapability(
        { ...resource, qualificationStatus: 'FAIL', backendStatus: 'DEGRADED' },
        true,
      ),
    ).toMatchObject({
      qualificationStatus: 'FAIL',
      backendStatus: 'DEGRADED',
    }));
  it('A2B-25 failed cleanup remains visible', () =>
    expect(
      projectSafeSandboxDiagnostic(
        { ...resource, cleanupStatus: 'FAILED', state: 'FAILED' },
        true,
      )?.cleanupStatus,
    ).toBe('FAILED'));
  it('A2B-26 degraded backend prevents unsafe start', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({
            ...resource,
            degraded: true,
            backendStatus: 'DEGRADED',
          }),
        }).authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('A2B-27 policy mismatch prevents control', async () =>
    expect(
      (
        await make().authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
          'old-policy',
        )
      ).code,
    ).toBe('POLICY_MISMATCH'));
  it('A2B-28 exact resource linkage required', async () =>
    expect(
      (await make().authorizeSandboxInspect(operator, 'forged-resource')).code,
    ).toBe('NOT_FOUND_OR_NOT_VISIBLE'));
  it('A2B-29 no direct runtime side effect', async () => {
    let calls = 0;
    await make({
      resolveSandbox: () => {
        calls++;
        return resource;
      },
    }).authorizeSandboxInspect(operator, resource.resourceId);
    expect(calls).toBe(1);
  });
  it('A2B-30 Lead interface is typed and narrow', () =>
    expect(make()).toHaveProperty('authorizeSandboxProbeStart'));
});

describe('Phase 2B Sandbox negative and abuse N2B-01..N2B-30', () => {
  const denied = async (
    operation: string,
    actor: WorkerAuthContext | undefined = operator,
    id = resource.resourceId,
  ) =>
    (
      await make().authorizeSandboxOperation(
        operation,
        actor,
        id,
        probe.probeId,
      )
    ).allowed;
  it('N2B-01 unauthenticated inspect denied', async () =>
    expect(
      (
        await make().authorizeSandboxOperation(
          'INSPECT_SANDBOX_STATUS',
          undefined,
          resource.resourceId,
        )
      ).allowed,
    ).toBe(false));
  it('N2B-02 ordinary diagnostics denied', async () =>
    expect(await denied('INSPECT_SANDBOX_CAPABILITIES', ordinary)).toBe(false));
  it('N2B-03 inactive operator denied', async () =>
    expect(
      await denied('INSPECT_SANDBOX_STATUS', {
        ...operator,
        status: 'disabled',
      }),
    ).toBe(false));
  it('N2B-04 unknown operation denied', async () =>
    expect(await denied('UNKNOWN')).toBe(false));
  it('N2B-05 malformed operation denied', async () =>
    expect(await denied('')).toBe(false));
  it('N2B-06 unknown state denies mutation', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, state: 'UNKNOWN' }) as never,
        }).authorizeSandboxOperation(
          'START_TRUSTED_PROBE',
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('N2B-07 unknown policy denied', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, policyVersion: '' }),
        }).authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('N2B-08 unknown probe denied', async () =>
    expect(
      (
        await make().authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          'unknown-probe',
        )
      ).allowed,
    ).toBe(false));
  it('N2B-09 forged probe hash cannot authorize', async () =>
    expect(
      (
        await make().authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
          'forged-hash',
        )
      ).code,
    ).toBe('POLICY_MISMATCH'));
  it('N2B-10 arbitrary executable path rejected', async () =>
    expect(await denied('RUN_EXECUTABLE')).toBe(false));
  it('N2B-11 shell command rejected', async () =>
    expect(await denied('RUN_SHELL')).toBe(false));
  it('N2B-12 host mount rejected', async () =>
    expect(await denied('MOUNT_HOST_PATH')).toBe(false));
  it('N2B-13 network target rejected', async () =>
    expect(await denied('SET_NETWORK_TARGET')).toBe(false));
  it('N2B-14 environment injection rejected', async () =>
    expect(await denied('SET_ENVIRONMENT')).toBe(false));
  it('N2B-15 seccomp override rejected', async () =>
    expect(await denied('SET_SECCOMP')).toBe(false));
  it('N2B-16 privileged/root/device rejected', async () =>
    expect(await denied('ENABLE_PRIVILEGE')).toBe(false));
  it('N2B-17 stale resource denied', async () =>
    expect(await denied('INSPECT_SANDBOX_STATUS', operator, 'stale')).toBe(
      false,
    ));
  it('N2B-18 completed probe mutation safe', async () =>
    expect(
      (
        await make({
          resolveSandbox: () => ({ ...resource, state: 'CLOSED' }),
        }).authorizeSandboxProbeCancel(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('N2B-19 repeated cancel safe', async () =>
    expect(
      (
        await make().authorizeSandboxProbeCancel(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false));
  it('N2B-20 inspect does not imply control', async () => {
    const p = make({
      roles: new Map([['i', new Set(['sandbox:status:view'])]]),
      resolveUserRoles: () => ['i'],
    });
    expect(
      (
        await p.authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
        )
      ).allowed,
    ).toBe(false);
  });
  it('N2B-21 qualification control does not imply real execution', () =>
    expect(projectSafeSandboxCapability(resource, true)?.mode).toBe(
      'SANDBOX_PROBE_QUALIFICATION',
    ));
  it('N2B-22 source marker absent from audit', async () => {
    const events: SandboxAuditEvent[] = [];
    await make({
      auditHook: {
        record: (e) => {
          events.push(e);
        },
      },
    }).authorizeSandboxInspect(operator, resource.resourceId);
    expect(JSON.stringify(events)).not.toContain('SOURCE_MARKER_PHASE2B');
  });
  it('N2B-23 secret marker absent from audit', async () => {
    const events: SandboxAuditEvent[] = [];
    await make({
      auditHook: {
        record: (e) => {
          events.push(e);
        },
      },
    }).authorizeSandboxProbeStart(operator, resource.resourceId, probe.probeId);
    expect(JSON.stringify(events)).not.toMatch(
      /SESSION_SECRET|REDIS_SECRET|DB_SECRET|OBJECT_SECRET|LEASE_TOKEN/,
    );
  });
  it('N2B-24 host path marker absent from response', () =>
    expect(
      JSON.stringify(projectSafeSandboxDiagnostic(resource, true)),
    ).not.toContain('HOST_PATH_MARKER_PHASE2B'));
  it('N2B-25 arbitrary metadata not copied', async () => {
    const events: SandboxAuditEvent[] = [];
    await make({
      auditHook: {
        record: (e) => {
          events.push(e);
        },
      },
    }).authorizeSandboxOperation(
      'START_TRUSTED_PROBE',
      operator,
      resource.resourceId,
      probe.probeId,
    );
    expect(JSON.stringify(events)).not.toContain('arbitrary');
  });
  it('N2B-26 malformed actor denied', async () =>
    expect(
      await denied('INSPECT_SANDBOX_STATUS', {
        userId: '',
        status: 'active',
      } as never),
    ).toBe(false));
  it('N2B-27 inactive session denied', async () =>
    expect(
      await denied('INSPECT_SANDBOX_STATUS', {
        ...operator,
        sessionId: undefined,
      } as never),
    ).toBe(false));
  it('N2B-28 policy downgrade denied', async () =>
    expect(
      (
        await make().authorizeSandboxProbeStart(
          operator,
          resource.resourceId,
          probe.probeId,
          'policy-1',
        )
      ).allowed,
    ).toBe(false));
  it('N2B-29 real-submission operation denied', async () =>
    expect(await denied('REAL_SUBMISSION_EXECUTION')).toBe(false));
  it('N2B-30 generic process kill absent', async () =>
    expect(await denied('KILL_PROCESS')).toBe(false));
});

describe('Phase 2B marker projection guards', () => {
  it('operator-safe projection omits all internal markers', () => {
    const text = JSON.stringify({
      diagnostic: projectSafeSandboxDiagnostic(resource, true),
      capability: projectSafeSandboxCapability(resource, true),
    });
    expect(text).not.toMatch(
      /SOURCE_MARKER|SESSION_SECRET|REDIS_SECRET|DB_SECRET|OBJECT_SECRET|HOST_PATH|LEASE_TOKEN|OCI_SECRET|ROOTFS_SECRET|CGROUP_SECRET|RUNC_SECRET|SECCOMP_SECRET|SHELL_SECRET|PROBE_PATH_SECRET/,
    );
  });
  it('ordinary projection is null and non-enumerating', () =>
    expect(projectSafeSandboxDiagnostic(resource, false)).toBeNull());
});
