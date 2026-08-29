import type { WorkerAuthContext } from './worker.js';

export type SandboxOperationId =
  | 'INSPECT_SANDBOX_STATUS'
  | 'INSPECT_SANDBOX_QUALIFICATION'
  | 'INSPECT_SANDBOX_CAPABILITIES'
  | 'START_TRUSTED_PROBE'
  | 'CANCEL_TRUSTED_PROBE'
  | 'VERIFY_SANDBOX_CLEANUP';

export type SandboxCapabilityAction =
  | 'sandbox:status:view'
  | 'sandbox:qualification:view'
  | 'sandbox:capabilities:view'
  | 'sandbox:probe:start'
  | 'sandbox:probe:cancel'
  | 'sandbox:cleanup:verify';

export type SandboxBackendStatus =
  | 'CONFIGURED'
  | 'IMPLEMENTED'
  | 'QUALIFICATION_PENDING'
  | 'QUALIFIED'
  | 'DEGRADED'
  | 'UNSUPPORTED';

export type SandboxIsolationStatus =
  'UNKNOWN' | 'PASS' | 'PARTIAL' | 'FAIL' | 'PENDING';

export type SandboxQualificationState =
  | 'READY'
  | 'PROBE_ACTIVE'
  | 'CLEANUP_PENDING'
  | 'CLOSED'
  | 'FAILED'
  | 'DEGRADED';

export type SandboxLifecycleState =
  | 'PREPARE'
  | 'VALIDATE_POLICY'
  | 'CREATE_ISOLATION'
  | 'STAGE_TRUSTED_PROBE'
  | 'START'
  | 'RUNNING'
  | 'CANCEL'
  | 'LIMIT'
  | 'EXIT'
  | 'COLLECT_RESULT'
  | 'TEARDOWN'
  | 'VERIFY_CLEAN'
  | 'CLOSED'
  | 'SETUP_FAILURE'
  | 'MOUNT_FAILURE'
  | 'NAMESPACE_FAILURE'
  | 'CGROUP_FAILURE'
  | 'PROBE_START_FAILURE'
  | 'TIMEOUT'
  | 'CANCELLATION'
  | 'CLEANUP_FAILURE';

export type SandboxResource = {
  resourceId: string;
  state: SandboxQualificationState;
  lifecycleState?: SandboxLifecycleState;
  backendStatus: SandboxBackendStatus;
  policyVersion: string;
  probeSuiteVersion: string;
  qualificationStatus: SandboxIsolationStatus;
  degraded: boolean;
  cleanupStatus: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'FAILED';
  lastQualificationAt?: string;
  safeFailureCategory?: string;
};

export type TrustedProbe = {
  probeId: string;
  version: string;
  sha256: string;
  purpose: string;
  immutableArtifactRef: string;
  timeoutMs: number;
};

export type SandboxStatusReference = SandboxResource & {
  hostPath?: string;
  ociBundlePath?: string;
  rootfsPath?: string;
  cgroupPath?: string;
  namespaceIds?: readonly string[];
  runcStatePath?: string;
  seccompProfile?: string;
  commandLine?: string;
  probeExecutablePath?: string;
  credentials?: string;
  environment?: Record<string, string>;
  sourceBody?: string;
  rawLeaseToken?: string;
};

export type SafeSandboxDiagnostic = {
  resourceId: string;
  backendStatus: SandboxBackendStatus;
  qualificationStatus: SandboxIsolationStatus;
  policyVersion: string;
  probeSuiteVersion: string;
  degraded: boolean;
  cleanupStatus: SandboxResource['cleanupStatus'];
  lastQualificationAt?: string;
  safeFailureCategory?: string;
};

export type SafeSandboxCapability = {
  backend: 'DEDICATED_SUPERVISOR_OCI_RUNC';
  mode: 'SANDBOX_PROBE_QUALIFICATION';
  realSubmissionExecution: false;
  qualificationStatus: SandboxIsolationStatus;
  backendStatus: SandboxBackendStatus;
  policyVersion: string;
  probeSuiteVersion: string;
  capabilities: readonly [
    'filesystem_isolation',
    'network_isolation',
    'process_isolation',
    'resource_limits',
    'cleanup',
  ];
};

export type SandboxDecisionCode =
  | 'ALLOWED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND_OR_NOT_VISIBLE'
  | 'INVALID_OPERATION'
  | 'INVALID_STATE'
  | 'POLICY_MISMATCH'
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNKNOWN_PROBE'
  | 'CONFLICT';

export type SandboxAuthorizationDecision = {
  allowed: boolean;
  operation: SandboxOperationId | 'UNKNOWN';
  code: SandboxDecisionCode;
  reason:
    | 'ALLOWED'
    | 'DENIED'
    | 'INACTIVE'
    | 'UNKNOWN_STATE'
    | 'POLICY_MISMATCH'
    | 'UNKNOWN_PROBE'
    | 'TERMINAL'
    | 'MALFORMED';
};

export type SandboxAuditEvent = {
  actorUserId: string;
  operation: SandboxOperationId | 'UNKNOWN';
  resourceId?: string;
  probeId?: string;
  policyVersion?: string;
  outcome: 'allowed' | 'denied';
  reasonCode: SandboxDecisionCode;
  correlationId: string;
  occurredAt: string;
};

export type SandboxAuditHook = {
  record(event: SandboxAuditEvent): Promise<void> | void;
};

export type SandboxAuthorizationOptions = {
  roles?: ReadonlyMap<string, ReadonlySet<SandboxCapabilityAction>>;
  resolveUserRoles?: (
    userId: string,
  ) => Promise<readonly string[]> | readonly string[];
  resolveSandbox?: (
    resourceId: string,
  ) => Promise<SandboxStatusReference | null> | SandboxStatusReference | null;
  resolveTrustedProbe?: (
    probeId: string,
  ) => Promise<TrustedProbe | null> | TrustedProbe | null;
  auditHook?: SandboxAuditHook;
};

const operationAction: Record<SandboxOperationId, SandboxCapabilityAction> = {
  INSPECT_SANDBOX_STATUS: 'sandbox:status:view',
  INSPECT_SANDBOX_QUALIFICATION: 'sandbox:qualification:view',
  INSPECT_SANDBOX_CAPABILITIES: 'sandbox:capabilities:view',
  START_TRUSTED_PROBE: 'sandbox:probe:start',
  CANCEL_TRUSTED_PROBE: 'sandbox:probe:cancel',
  VERIFY_SANDBOX_CLEANUP: 'sandbox:cleanup:verify',
};
const validStates = new Set<SandboxQualificationState>([
  'READY',
  'PROBE_ACTIVE',
  'CLEANUP_PENDING',
  'CLOSED',
  'FAILED',
  'DEGRADED',
]);
const validBackend = new Set<SandboxBackendStatus>([
  'CONFIGURED',
  'IMPLEMENTED',
  'QUALIFICATION_PENDING',
  'QUALIFIED',
  'DEGRADED',
  'UNSUPPORTED',
]);
const validIsolation = new Set<SandboxIsolationStatus>([
  'UNKNOWN',
  'PASS',
  'PARTIAL',
  'FAIL',
  'PENDING',
]);
const knownPolicyVersions = new Set(['policy-2b.1']);
const active = (user: WorkerAuthContext | undefined) =>
  Boolean(
    user?.userId &&
    user.status === 'active' &&
    user.sessionId &&
    user.strength === 'password',
  );
const validResource = (resource: SandboxStatusReference | null | undefined) =>
  Boolean(
    resource?.resourceId &&
    validStates.has(resource.state) &&
    validBackend.has(resource.backendStatus) &&
    validIsolation.has(resource.qualificationStatus) &&
    knownPolicyVersions.has(resource.policyVersion) &&
    resource.probeSuiteVersion &&
    ['NOT_REQUIRED', 'PENDING', 'VERIFIED', 'FAILED'].includes(
      resource.cleanupStatus,
    ),
  );

function safeDecision(
  operation: SandboxAuthorizationDecision['operation'],
  code: SandboxDecisionCode,
  reason: SandboxAuthorizationDecision['reason'],
  allowed = false,
): SandboxAuthorizationDecision {
  return { allowed, operation, code, reason };
}

function safeCapability(resource: SandboxResource): SafeSandboxCapability {
  return {
    backend: 'DEDICATED_SUPERVISOR_OCI_RUNC',
    mode: 'SANDBOX_PROBE_QUALIFICATION',
    realSubmissionExecution: false,
    qualificationStatus: resource.qualificationStatus,
    backendStatus: resource.backendStatus,
    policyVersion: resource.policyVersion,
    probeSuiteVersion: resource.probeSuiteVersion,
    capabilities: [
      'filesystem_isolation',
      'network_isolation',
      'process_isolation',
      'resource_limits',
      'cleanup',
    ],
  };
}

export function projectSafeSandboxDiagnostic(
  resource: SandboxStatusReference | null | undefined,
  operator = false,
): SafeSandboxDiagnostic | null {
  if (!operator || !validResource(resource)) return null;
  const result: SafeSandboxDiagnostic = {
    resourceId: resource!.resourceId,
    backendStatus: resource!.backendStatus,
    qualificationStatus: resource!.qualificationStatus,
    policyVersion: resource!.policyVersion,
    probeSuiteVersion: resource!.probeSuiteVersion,
    degraded: resource!.degraded,
    cleanupStatus: resource!.cleanupStatus,
  };
  if (resource!.lastQualificationAt)
    result.lastQualificationAt = resource!.lastQualificationAt;
  if (resource!.safeFailureCategory)
    result.safeFailureCategory = resource!.safeFailureCategory;
  return result;
}

export function projectSafeSandboxCapability(
  resource: SandboxStatusReference | null | undefined,
  operator = false,
): SafeSandboxCapability | null {
  return operator && validResource(resource) ? safeCapability(resource!) : null;
}

export function createSandboxAuthorizationPolicy(
  options: SandboxAuthorizationOptions = {},
) {
  const roles =
    options.roles ?? new Map<string, ReadonlySet<SandboxCapabilityAction>>();
  const hasCapability = async (
    user: WorkerAuthContext | undefined,
    action: SandboxCapabilityAction,
  ) => {
    if (!active(user)) return false;
    const names = options.resolveUserRoles
      ? await options.resolveUserRoles(user!.userId)
      : (user!.roles ?? []);
    return names.some((name) => roles.get(name)?.has(action));
  };
  const audit = async (
    user: WorkerAuthContext | undefined,
    operation: SandboxAuthorizationDecision['operation'],
    resource: SandboxStatusReference | null | undefined,
    probeId: string | undefined,
    decision: SandboxAuthorizationDecision,
    correlationId: string,
  ) => {
    const event: SandboxAuditEvent = {
      actorUserId: user?.userId ?? 'unknown',
      operation,
      outcome: decision.allowed ? 'allowed' : 'denied',
      reasonCode: decision.code,
      correlationId,
      occurredAt: new Date().toISOString(),
    };
    if (resource?.resourceId) event.resourceId = resource.resourceId;
    if (probeId) event.probeId = probeId;
    if (resource?.policyVersion) event.policyVersion = resource.policyVersion;
    await options.auditHook?.record(event);
    return decision;
  };
  const resolve = async (resourceId: string | undefined) =>
    resourceId && options.resolveSandbox
      ? options.resolveSandbox(resourceId)
      : null;
  const decide = async (
    operationInput: string,
    user: WorkerAuthContext | undefined,
    resourceId?: string,
    probeId?: string,
    policyVersion?: string,
    correlationId = 'internal',
  ) => {
    const operation = (
      Object.prototype.hasOwnProperty.call(operationAction, operationInput)
        ? operationInput
        : 'UNKNOWN'
    ) as SandboxAuthorizationDecision['operation'];
    if (operation === 'UNKNOWN')
      return audit(
        user,
        operation,
        null,
        undefined,
        safeDecision(operation, 'INVALID_OPERATION', 'MALFORMED'),
        correlationId,
      );
    if (!active(user))
      return audit(
        user,
        operation,
        null,
        probeId,
        safeDecision(operation, 'UNAUTHENTICATED', 'INACTIVE'),
        correlationId,
      );
    const resource = await resolve(resourceId);
    if (!validResource(resource))
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'NOT_FOUND_OR_NOT_VISIBLE', 'MALFORMED'),
        correlationId,
      );
    const action = operationAction[operation];
    if (!(await hasCapability(user, action)))
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'FORBIDDEN', 'DENIED'),
        correlationId,
      );
    if (policyVersion && policyVersion !== resource!.policyVersion)
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'POLICY_MISMATCH', 'POLICY_MISMATCH'),
        correlationId,
      );
    if (
      operation === 'INSPECT_SANDBOX_STATUS' ||
      operation === 'INSPECT_SANDBOX_QUALIFICATION' ||
      operation === 'INSPECT_SANDBOX_CAPABILITIES'
    )
      return audit(
        user,
        operation,
        resource,
        undefined,
        safeDecision(operation, 'ALLOWED', 'ALLOWED', true),
        correlationId,
      );
    if (operation === 'START_TRUSTED_PROBE') {
      const probe =
        probeId && options.resolveTrustedProbe
          ? await options.resolveTrustedProbe(probeId)
          : null;
      if (!probe)
        return audit(
          user,
          operation,
          resource,
          probeId,
          safeDecision(operation, 'UNKNOWN_PROBE', 'UNKNOWN_PROBE'),
          correlationId,
        );
      if (
        !['READY', 'FAILED'].includes(resource!.state) ||
        resource!.degraded ||
        resource!.backendStatus === 'DEGRADED' ||
        resource!.backendStatus === 'UNSUPPORTED' ||
        resource!.qualificationStatus === 'FAIL'
      )
        return audit(
          user,
          operation,
          resource,
          probeId,
          safeDecision(operation, 'INVALID_STATE', 'UNKNOWN_STATE'),
          correlationId,
        );
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'ALLOWED', 'ALLOWED', true),
        correlationId,
      );
    }
    if (operation === 'CANCEL_TRUSTED_PROBE') {
      const probe =
        probeId && options.resolveTrustedProbe
          ? await options.resolveTrustedProbe(probeId)
          : null;
      if (!probe)
        return audit(
          user,
          operation,
          resource,
          probeId,
          safeDecision(operation, 'UNKNOWN_PROBE', 'UNKNOWN_PROBE'),
          correlationId,
        );
      if (resource!.state !== 'PROBE_ACTIVE')
        return audit(
          user,
          operation,
          resource,
          probeId,
          safeDecision(
            operation,
            resource!.state === 'CLOSED' ? 'CONFLICT' : 'INVALID_STATE',
            resource!.state === 'CLOSED' ? 'TERMINAL' : 'UNKNOWN_STATE',
          ),
          correlationId,
        );
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'ALLOWED', 'ALLOWED', true),
        correlationId,
      );
    }
    if (operation === 'VERIFY_SANDBOX_CLEANUP') {
      if (
        !['CLEANUP_PENDING', 'FAILED'].includes(resource!.state) &&
        resource!.cleanupStatus !== 'PENDING' &&
        resource!.cleanupStatus !== 'FAILED'
      )
        return audit(
          user,
          operation,
          resource,
          probeId,
          safeDecision(operation, 'INVALID_STATE', 'UNKNOWN_STATE'),
          correlationId,
        );
      return audit(
        user,
        operation,
        resource,
        probeId,
        safeDecision(operation, 'ALLOWED', 'ALLOWED', true),
        correlationId,
      );
    }
    return audit(
      user,
      operation,
      resource,
      probeId,
      safeDecision(operation, 'INVALID_OPERATION', 'MALFORMED'),
      correlationId,
    );
  };
  return {
    authorizeSandboxInspect: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      correlationId?: string,
    ) =>
      decide(
        'INSPECT_SANDBOX_STATUS',
        user,
        resourceId,
        undefined,
        undefined,
        correlationId,
      ),
    authorizeSandboxQualificationInspect: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      correlationId?: string,
    ) =>
      decide(
        'INSPECT_SANDBOX_QUALIFICATION',
        user,
        resourceId,
        undefined,
        undefined,
        correlationId,
      ),
    authorizeSandboxCapabilitiesInspect: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      correlationId?: string,
    ) =>
      decide(
        'INSPECT_SANDBOX_CAPABILITIES',
        user,
        resourceId,
        undefined,
        undefined,
        correlationId,
      ),
    authorizeSandboxProbeStart: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      probeId?: string,
      policyVersion?: string,
      correlationId?: string,
    ) =>
      decide(
        'START_TRUSTED_PROBE',
        user,
        resourceId,
        probeId,
        policyVersion,
        correlationId,
      ),
    authorizeSandboxProbeCancel: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      probeId?: string,
      correlationId?: string,
    ) =>
      decide(
        'CANCEL_TRUSTED_PROBE',
        user,
        resourceId,
        probeId,
        undefined,
        correlationId,
      ),
    authorizeSandboxCleanupVerify: (
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      correlationId?: string,
    ) =>
      decide(
        'VERIFY_SANDBOX_CLEANUP',
        user,
        resourceId,
        undefined,
        undefined,
        correlationId,
      ),
    authorizeSandboxOperation: (
      operation: string,
      user: WorkerAuthContext | undefined,
      resourceId?: string,
      probeId?: string,
      policyVersion?: string,
      correlationId?: string,
    ) =>
      decide(
        operation,
        user,
        resourceId,
        probeId,
        policyVersion,
        correlationId,
      ),
  };
}
