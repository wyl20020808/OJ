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

export type SandboxRuntime = {
  resource(): Promise<SandboxStatusReference>;
  probes(): readonly TrustedProbe[];
  start(
    probe: TrustedProbe,
    correlationId: string,
  ): Promise<SandboxStatusReference>;
  status(probeId: string): Promise<SandboxStatusReference>;
  cancel(probeId: string): Promise<SandboxStatusReference>;
  verifyCleanup(): Promise<SandboxStatusReference>;
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
        item.probe_id === PROBE_ID &&
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
  let current = baseResource(catalog.length === 1);
  let activeProbe: string | undefined;
  const project = (result: {
    outcome?: string;
    clean?: boolean;
    completed_at?: string;
  }): SandboxStatusReference => {
    const passed =
      result.outcome === 'SANDBOX_PROBE_SUCCEEDED' && result.clean === true;
    return {
      ...current,
      state: passed ? 'READY' : 'FAILED',
      lifecycleState: passed ? 'CLOSED' : 'CLEANUP_FAILURE',
      qualificationStatus: passed ? 'PASS' : 'FAIL',
      backendStatus: passed ? 'QUALIFIED' : 'DEGRADED',
      degraded: !passed,
      cleanupStatus: result.clean ? 'VERIFIED' : 'FAILED',
      ...(result.completed_at
        ? { lastQualificationAt: result.completed_at }
        : {}),
      ...(passed ? {} : { safeFailureCategory: 'PROBE_OR_CLEANUP_FAILURE' }),
    };
  };
  const refresh = async () => {
    if (activeProbe) {
      try {
        const result = await response<{
          outcome?: string;
          clean?: boolean;
          completed_at?: string;
        }>(`/v1/probes/status?probe_id=${encodeURIComponent(activeProbe)}`);
        if (result.outcome && result.outcome !== 'SANDBOX_PROBE_RUNNING') {
          activeProbe = undefined;
          current = project(result);
        }
      } catch {
        current = {
          ...current,
          state: 'DEGRADED',
          backendStatus: 'DEGRADED',
          degraded: true,
          safeFailureCategory: 'SUPERVISOR_UNAVAILABLE',
        };
      }
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
          ProbeID: selected.probeId,
          Version: selected.version,
          Hash: selected.sha256,
          CorrelationID: correlationId,
        }),
      });
      activeProbe = selected.probeId;
      return (current = {
        ...current,
        state: 'PROBE_ACTIVE',
        lifecycleState: 'RUNNING',
        degraded: false,
        cleanupStatus: 'PENDING',
      });
    },
    async status(probeId) {
      if (probeId !== PROBE_ID) throw new Error('UNKNOWN_PROBE');
      await refresh();
      return current;
    },
    async cancel(probeId) {
      if (probeId !== PROBE_ID || !activeProbe)
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
      await response('/v1/cleanup/verify', { method: 'POST', body: '{}' });
      activeProbe = undefined;
      return (current = {
        ...current,
        state: 'READY',
        lifecycleState: 'VERIFY_CLEAN',
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
        resource.state === 'PROBE_ACTIVE'
          ? 'QUALIFYING'
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
