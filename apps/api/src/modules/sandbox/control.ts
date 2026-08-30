import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthContext } from '../submission/model.js';
import {
  createSandboxAuthorizationPolicy,
  projectSafeSandboxCapability,
  projectSafeSandboxDiagnostic,
  type SandboxStatusReference,
  type TrustedProbe,
} from '../authz/sandbox.js';

const PROBE_ID = 'SANDBOX_PROBE_QUALIFICATION';
const PROBE_VERSION = '1';
const POLICY_VERSION = 'policy-2b.1';
const RESOURCE_ID = 'sandbox-primary';
const TRUSTED_PROBE_IDS = new Set([
  PROBE_ID,
  'SANDBOX_PROBE_CANCELLATION',
  'SANDBOX_PROBE_CLEANUP_FAILURE',
  'SANDBOX_PROBE_CPU_LIMIT',
  'SANDBOX_PROBE_MEMORY_LIMIT',
  'SANDBOX_PROBE_PIDS_LIMIT',
  'SANDBOX_PROBE_OUTPUT_LIMIT',
  'SANDBOX_PROBE_WORKSPACE_LIMIT',
  'SANDBOX_PROBE_WALL_TIMEOUT',
  'SANDBOX_PROBE_ABNORMAL_EXIT',
  'SANDBOX_PROBE_CONCURRENT_RESOURCES',
]);

type SandboxRuntimeStatus = SandboxStatusReference & {
  lastProbeId?: string;
  lastProbeOutcome?: string;
  lastProbePass?: boolean;
  lastProbeKind?: string;
};

export type SandboxRuntime = {
  resource(): Promise<SandboxRuntimeStatus>;
  probes(): readonly TrustedProbe[];
  start(
    probe: TrustedProbe,
    correlationId: string,
  ): Promise<SandboxRuntimeStatus>;
  status(probeId: string): Promise<SandboxRuntimeStatus>;
  cancel(probeId: string): Promise<SandboxRuntimeStatus>;
  verifyCleanup(): Promise<SandboxRuntimeStatus>;
  recoverCleanup(): Promise<SandboxRuntimeStatus>;
  close(): Promise<void>;
};

const baseResource = (configured: boolean): SandboxStatusReference => ({
  resourceId: RESOURCE_ID,
  state: configured ? 'READY' : 'DEGRADED',
  backendStatus: configured ? 'IMPLEMENTED' : 'DEGRADED',
  policyVersion: POLICY_VERSION,
  probeSuiteVersion: PROBE_VERSION,
  qualificationStatus: configured ? 'PENDING' : 'UNKNOWN',
  degraded: !configured,
  cleanupStatus: 'NOT_REQUIRED',
  ...(configured ? {} : { safeFailureCategory: 'SUPERVISOR_NOT_CONFIGURED' }),
});

const clearFailure = (status: SandboxRuntimeStatus): SandboxRuntimeStatus => {
  const next = { ...status };
  delete next.safeFailureCategory;
  return next;
};

const clearProbeResult = (
  status: SandboxRuntimeStatus,
): SandboxRuntimeStatus => {
  const next = { ...status };
  delete next.lastProbeOutcome;
  delete next.lastProbePass;
  delete next.lastProbeKind;
  return next;
};

function unavailableRuntime(): SandboxRuntime {
  const current = baseResource(false);
  return {
    async resource() {
      return current;
    },
    probes() {
      return [];
    },
    async start() {
      throw new Error('SUPERVISOR_NOT_CONFIGURED');
    },
    async status() {
      throw new Error('SUPERVISOR_NOT_CONFIGURED');
    },
    async cancel() {
      throw new Error('SUPERVISOR_NOT_CONFIGURED');
    },
    async verifyCleanup() {
      throw new Error('SUPERVISOR_NOT_CONFIGURED');
    },
    async recoverCleanup() {
      throw new Error('SUPERVISOR_NOT_CONFIGURED');
    },
    async close() {},
  };
}

export async function createSandboxRuntime(): Promise<SandboxRuntime> {
  const supervisorUrl = process.env.OJPLATFORM_SANDBOX_SUPERVISOR_URL;
  if (!supervisorUrl) return unavailableRuntime();
  return createSupervisorProtocolRuntime(supervisorUrl);
}

async function createSupervisorProtocolRuntime(
  baseUrl: string,
): Promise<SandboxRuntime> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return unavailableRuntime();
  }
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
  )
    return unavailableRuntime();
  const root = baseUrl.replace(/\/$/, '');
  const response = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const result = await fetch(`${root}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!result.ok) throw new Error(`SUPERVISOR_${result.status}`);
    return (await result.json()) as T;
  };
  let listed: {
    items: Array<{
      probe_id: string;
      version: string;
      sha256: string;
      purpose: string;
      timeout_ms: number;
    }>;
  };
  try {
    listed = await response('/v1/probes');
  } catch {
    return unavailableRuntime();
  }
  const catalog = listed.items
    .filter(
      (item) =>
        TRUSTED_PROBE_IDS.has(item.probe_id) &&
        item.version === PROBE_VERSION &&
        /^[a-f0-9]{64}$/.test(item.sha256),
    )
    .map((item) => ({
      probeId: item.probe_id,
      version: item.version,
      sha256: item.sha256,
      purpose: item.purpose,
      immutableArtifactRef: 'sandbox-supervisor/trusted-probe',
      timeoutMs: item.timeout_ms,
    }));
  let current: SandboxRuntimeStatus = baseResource(
    catalog.some((item) => item.probeId === PROBE_ID),
  );
  let activeProbe: string | undefined;
  let availabilityLost = false;
  let cleanupUncertain = false;
  const project = (result: {
    outcome?: string;
    clean?: boolean;
    completed_at?: string;
    qualification_pass?: boolean;
    qualifies_sandbox?: boolean;
    qualification_kind?: string;
    trusted_probe_id?: string;
  }): SandboxRuntimeStatus => {
    const cleanupFailed = result.clean === false;
    const passed = result.qualification_pass === true && !cleanupFailed;
    const qualifiesSandbox = passed && result.qualifies_sandbox === true;
    if (cleanupFailed) {
      return {
        ...current,
        state: 'FAILED',
        lifecycleState: 'CLEANUP_FAILURE',
        qualificationStatus: 'FAIL',
        backendStatus: 'DEGRADED',
        degraded: true,
        cleanupStatus: 'FAILED',
        safeFailureCategory: 'QUALIFICATION_CLEANUP_FAILURE',
        ...(result.completed_at
          ? { lastQualificationAt: result.completed_at }
          : {}),
        ...(result.trusted_probe_id
          ? { lastProbeId: result.trusted_probe_id }
          : {}),
        ...(result.outcome ? { lastProbeOutcome: result.outcome } : {}),
        lastProbePass: false,
        ...(result.qualification_kind
          ? { lastProbeKind: result.qualification_kind }
          : {}),
      };
    }
    if (passed) {
      return {
        ...clearFailure(current),
        state: 'READY',
        lifecycleState: 'CLOSED',
        qualificationStatus: qualifiesSandbox
          ? 'PASS'
          : current.qualificationStatus,
        backendStatus: qualifiesSandbox ? 'QUALIFIED' : current.backendStatus,
        degraded: false,
        cleanupStatus: 'VERIFIED',
        ...(result.completed_at && qualifiesSandbox
          ? { lastQualificationAt: result.completed_at }
          : {}),
        ...(result.trusted_probe_id
          ? { lastProbeId: result.trusted_probe_id }
          : {}),
        ...(result.outcome ? { lastProbeOutcome: result.outcome } : {}),
        lastProbePass: true,
        ...(result.qualification_kind
          ? { lastProbeKind: result.qualification_kind }
          : {}),
      };
    }
    return {
      ...current,
      state: 'FAILED',
      lifecycleState: 'EXIT',
      qualificationStatus: 'FAIL',
      backendStatus: 'DEGRADED',
      degraded: true,
      cleanupStatus: result.clean ? 'VERIFIED' : 'FAILED',
      ...(result.completed_at
        ? { lastQualificationAt: result.completed_at }
        : {}),
      safeFailureCategory: 'PROBE_QUALIFICATION_FAILED',
      ...(result.trusted_probe_id
        ? { lastProbeId: result.trusted_probe_id }
        : {}),
      ...(result.outcome ? { lastProbeOutcome: result.outcome } : {}),
      lastProbePass: false,
      ...(result.qualification_kind
        ? { lastProbeKind: result.qualification_kind }
        : {}),
    };
  };
  const unavailable = (lostActiveProbe: boolean) => {
    cleanupUncertain ||= lostActiveProbe;
    availabilityLost = true;
    activeProbe = undefined;
    current = {
      ...current,
      state: 'DEGRADED',
      lifecycleState: cleanupUncertain ? 'CLEANUP_FAILURE' : 'EXIT',
      qualificationStatus: 'PENDING',
      backendStatus: 'DEGRADED',
      degraded: true,
      cleanupStatus: cleanupUncertain ? 'FAILED' : current.cleanupStatus,
      safeFailureCategory: cleanupUncertain
        ? 'SUPERVISOR_LOST_DURING_PROBE'
        : 'SUPERVISOR_UNAVAILABLE',
    };
  };
  const reconnect = () => {
    availabilityLost = false;
    current = {
      ...(cleanupUncertain ? current : clearFailure(current)),
      state: cleanupUncertain ? 'FAILED' : 'READY',
      lifecycleState: cleanupUncertain ? 'CLEANUP_FAILURE' : 'VERIFY_CLEAN',
      qualificationStatus: 'PENDING',
      backendStatus: 'IMPLEMENTED',
      degraded: cleanupUncertain,
      cleanupStatus: cleanupUncertain ? 'FAILED' : 'NOT_REQUIRED',
    };
  };
  const refresh = async () => {
    if (activeProbe) {
      const requestedProbe = activeProbe;
      try {
        const result = await response<{
          outcome?: string;
          clean?: boolean;
          completed_at?: string;
          qualification_pass?: boolean;
          qualifies_sandbox?: boolean;
          qualification_kind?: string;
          trusted_probe_id?: string;
        }>(`/v1/probes/status?probe_id=${encodeURIComponent(activeProbe)}`);
        if (result.outcome && result.outcome !== 'SANDBOX_PROBE_RUNNING') {
          activeProbe = undefined;
          current = project(result);
        }
      } catch {
        unavailable(requestedProbe !== undefined);
      }
      return current;
    }
    try {
      const health = await response<{ status?: string }>('/v1/health');
      if (health.status !== 'ok') throw new Error('SUPERVISOR_UNHEALTHY');
      if (availabilityLost) reconnect();
    } catch {
      unavailable(false);
    }
    return current;
  };
  return {
    resource: refresh,
    probes() {
      return catalog;
    },
    async start(selected, correlationId) {
      if (
        !catalog.some(
          (item) =>
            item.probeId === selected.probeId &&
            item.version === selected.version &&
            item.sha256 === selected.sha256,
        )
      )
        throw new Error('UNKNOWN_PROBE');
      await response('/v1/probes/start', {
        method: 'POST',
        body: JSON.stringify({
          probe_id: selected.probeId,
          version: selected.version,
          hash: selected.sha256,
          correlation_id: correlationId,
        }),
      });
      activeProbe = selected.probeId;
      return (current = {
        ...clearProbeResult(current),
        state: 'PROBE_ACTIVE',
        lifecycleState: 'RUNNING',
        degraded: false,
        cleanupStatus: 'PENDING',
        lastProbeId: selected.probeId,
      });
    },
    async status(probeId) {
      if (!TRUSTED_PROBE_IDS.has(probeId)) throw new Error('UNKNOWN_PROBE');
      await refresh();
      return current;
    },
    async cancel(probeId) {
      if (probeId !== activeProbe || !activeProbe)
        throw new Error('INVALID_STATE');
      await response('/v1/probes/cancel', {
        method: 'POST',
        body: JSON.stringify({ probe_id: probeId }),
      });
      return (current = {
        ...current,
        state: 'CLEANUP_PENDING',
        lifecycleState: 'CANCELLATION',
        cleanupStatus: 'PENDING',
      });
    },
    async verifyCleanup() {
      const result = await response<{
        status: string;
        clean: boolean;
        failure_category?: string;
      }>('/v1/cleanup/verify', { method: 'POST', body: '{}' });
      if (!result.clean) {
        return (current = {
          ...current,
          state: 'FAILED',
          lifecycleState: 'CLEANUP_FAILURE',
          qualificationStatus: 'FAIL',
          backendStatus: 'DEGRADED',
          cleanupStatus: 'FAILED',
          degraded: true,
          safeFailureCategory:
            result.failure_category ?? 'QUALIFICATION_CLEANUP_FAILURE',
        });
      }
      activeProbe = undefined;
      cleanupUncertain = false;
      availabilityLost = false;
      return (current = {
        ...clearFailure(current),
        state: 'READY',
        lifecycleState: 'VERIFY_CLEAN',
        cleanupStatus: 'VERIFIED',
        degraded: false,
      });
    },
    async recoverCleanup() {
      await response('/v1/cleanup/recover', { method: 'POST', body: '{}' });
      activeProbe = undefined;
      return (current = {
        ...clearFailure(current),
        state: 'READY',
        lifecycleState: 'VERIFY_CLEAN',
        qualificationStatus: 'PENDING',
        backendStatus: 'IMPLEMENTED',
        cleanupStatus: 'VERIFIED',
        degraded: false,
      });
    },
    async close() {
      if (activeProbe) {
        try {
          await response('/v1/probes/cancel', {
            method: 'POST',
            body: JSON.stringify({ probe_id: activeProbe }),
          });
        } catch {
          /* supervisor owns cleanup */
        }
        activeProbe = undefined;
      }
    },
  };
}

const error = (
  reply: { status: (code: number) => { send: (value: unknown) => unknown } },
  requestId: string,
  status: number,
  code: string,
  message: string,
) => reply.status(status).send({ code, message, requestId });

export async function registerSandboxControlRoutes(
  app: FastifyInstance,
  options: {
    getAuthContext: (
      request: FastifyRequest,
    ) => Promise<AuthContext | undefined>;
    operatorUserIds?: ReadonlySet<string>;
    operatorUsernames?: ReadonlySet<string>;
    resolveUserName?: (userId: string) => Promise<string | undefined>;
    runtime: SandboxRuntime;
  },
) {
  const roles = new Map([
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
  const runtime = options.runtime;
  const policy = createSandboxAuthorizationPolicy({
    roles,
    resolveSandbox: () => runtime.resource(),
    resolveTrustedProbe: async (id) =>
      runtime.probes().find((item) => item.probeId === id) ?? null,
  });
  const auth = async (request: FastifyRequest) => {
    const context = await options.getAuthContext(request);
    if (!context || !context.sessionId || context.strength !== 'password')
      return undefined;
    const byId = options.operatorUserIds?.has(context.userId) ?? false;
    const username = options.resolveUserName
      ? await options.resolveUserName(context.userId)
      : undefined;
    return {
      userId: context.userId,
      sessionId: context.sessionId,
      strength: 'password' as const,
      status: 'active' as const,
      roles:
        byId || options.operatorUsernames?.has(username ?? '')
          ? ['operator']
          : [],
    };
  };
  const guard = async (
    request: FastifyRequest,
    operation: string,
    probeId?: string,
  ) => {
    const user = await auth(request);
    const decision = await policy.authorizeSandboxOperation(
      operation,
      user,
      RESOURCE_ID,
      probeId,
      undefined,
      request.id,
    );
    return { user, decision };
  };
  app.get('/api/operations/sandbox', async (request, reply) => {
    const { decision } = await guard(request, 'INSPECT_SANDBOX_STATUS');
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED' ? 401 : 403,
        decision.code,
        'Sandbox qualification details are not available for this session.',
      );
    const resource = await runtime.resource();
    return reply.send({
      resourceId: resource.resourceId,
      backendType: 'DEDICATED_SUPERVISOR_OCI_RUNC',
      qualificationState:
        resource.state === 'PROBE_ACTIVE' ||
        resource.state === 'CLEANUP_PENDING'
          ? 'QUALIFYING'
          : resource.cleanupStatus === 'FAILED'
            ? 'CLEANUP_FAILED'
            : resource.qualificationStatus === 'PASS'
              ? 'QUALIFIED'
              : resource.degraded
                ? 'DEGRADED'
                : 'QUALIFICATION_PENDING',
      policyVersion: resource.policyVersion,
      probeSuiteVersion: resource.probeSuiteVersion,
      lastQualificationAt: resource.lastQualificationAt ?? null,
      capabilities: [
        'filesystem_isolation',
        'network_isolation',
        'process_isolation',
        'resource_limits',
        'cleanup',
      ].map((id) => ({
        id,
        label: id.replaceAll('_', ' '),
        state:
          resource.qualificationStatus === 'PASS'
            ? 'qualified'
            : resource.degraded
              ? 'degraded'
              : 'qualification_pending',
      })),
      failureCategory: resource.safeFailureCategory ?? null,
      realSubmissionExecution: 'DISABLED',
      activeProbeId:
        resource.state === 'PROBE_ACTIVE'
          ? (resource.lastProbeId ?? null)
          : null,
      lastProbeId: resource.lastProbeId ?? null,
      lastProbeOutcome: resource.lastProbeOutcome ?? null,
      lastProbePass: resource.lastProbePass ?? null,
      lastProbeKind: resource.lastProbeKind ?? null,
      cleanupStatus: resource.cleanupStatus,
    });
  });
  app.get('/api/operations/sandbox/capabilities', async (request, reply) => {
    const { decision } = await guard(request, 'INSPECT_SANDBOX_CAPABILITIES');
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED' ? 401 : 403,
        decision.code,
        'Sandbox capabilities are not available for this session.',
      );
    return reply.send(
      projectSafeSandboxCapability(await runtime.resource(), true),
    );
  });
  app.get('/api/operations/sandbox/probes', async (request, reply) => {
    const { decision } = await guard(request, 'INSPECT_SANDBOX_QUALIFICATION');
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED' ? 401 : 403,
        decision.code,
        'Sandbox probes are not available for this session.',
      );
    return reply.send({
      items: runtime
        .probes()
        .map(({ probeId, version, purpose, timeoutMs }) => ({
          probeId,
          version,
          purpose,
          timeoutMs,
        })),
    });
  });
  app.post(
    '/api/operations/sandbox/probes/:probeId',
    async (request, reply) => {
      const probeId = (request.params as { probeId?: string }).probeId;
      const { decision } = await guard(request, 'START_TRUSTED_PROBE', probeId);
      if (!decision.allowed)
        return error(
          reply,
          request.id,
          decision.code === 'UNAUTHENTICATED'
            ? 401
            : decision.code === 'INVALID_STATE'
              ? 409
              : 403,
          decision.code,
          'Sandbox probe request was rejected.',
        );
      try {
        return reply.status(202).send(
          await runtime.start(
            runtime.probes().find((item) => item.probeId === probeId)!,
            request.id,
          ),
        );
      } catch (reason) {
        return error(
          reply,
          request.id,
          409,
          reason instanceof Error ? reason.message : 'CONFLICT',
          'Sandbox probe request was rejected.',
        );
      }
    },
  );
  app.get('/api/operations/sandbox/probes/:probeId', async (request, reply) => {
    const probeId = (request.params as { probeId?: string }).probeId;
    const { decision } = await guard(
      request,
      'INSPECT_SANDBOX_QUALIFICATION',
      probeId,
    );
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED' ? 401 : 404,
        decision.code,
        'Sandbox probe is not available.',
      );
    try {
      return reply.send(await runtime.status(probeId!));
    } catch {
      return error(
        reply,
        request.id,
        404,
        'NOT_FOUND',
        'Sandbox probe is not available.',
      );
    }
  });
  app.post(
    '/api/operations/sandbox/probes/:probeId/cancel',
    async (request, reply) => {
      const probeId = (request.params as { probeId?: string }).probeId;
      const { decision } = await guard(
        request,
        'CANCEL_TRUSTED_PROBE',
        probeId,
      );
      if (!decision.allowed)
        return error(
          reply,
          request.id,
          decision.code === 'UNAUTHENTICATED'
            ? 401
            : decision.code === 'INVALID_STATE'
              ? 409
              : 403,
          decision.code,
          'Sandbox probe cancellation was rejected.',
        );
      try {
        return reply.send(await runtime.cancel(probeId!));
      } catch {
        return error(
          reply,
          request.id,
          409,
          'CONFLICT',
          'Sandbox probe cancellation was rejected.',
        );
      }
    },
  );
  app.post('/api/operations/sandbox/cleanup/verify', async (request, reply) => {
    const { decision } = await guard(request, 'VERIFY_SANDBOX_CLEANUP');
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED'
          ? 401
          : decision.code === 'INVALID_STATE'
            ? 409
            : 403,
        decision.code,
        'Sandbox cleanup verification was rejected.',
      );
    try {
      return reply.send(await runtime.verifyCleanup());
    } catch {
      return error(
        reply,
        request.id,
        409,
        'CONFLICT',
        'Sandbox cleanup verification was rejected.',
      );
    }
  });
  app.post(
    '/api/operations/sandbox/cleanup/recover',
    async (request, reply) => {
      const { decision } = await guard(request, 'VERIFY_SANDBOX_CLEANUP');
      if (!decision.allowed)
        return error(
          reply,
          request.id,
          decision.code === 'UNAUTHENTICATED'
            ? 401
            : decision.code === 'INVALID_STATE'
              ? 409
              : 403,
          decision.code,
          'Sandbox cleanup recovery was rejected.',
        );
      try {
        return reply.send(await runtime.recoverCleanup());
      } catch {
        return error(
          reply,
          request.id,
          409,
          'CONFLICT',
          'Sandbox cleanup recovery was rejected.',
        );
      }
    },
  );
  app.get('/api/operations/sandbox/diagnostics', async (request, reply) => {
    const { decision } = await guard(request, 'INSPECT_SANDBOX_STATUS');
    if (!decision.allowed)
      return error(
        reply,
        request.id,
        decision.code === 'UNAUTHENTICATED' ? 401 : 403,
        decision.code,
        'Sandbox diagnostics are not available for this session.',
      );
    return reply.send(
      projectSafeSandboxDiagnostic(await runtime.resource(), true),
    );
  });
}
