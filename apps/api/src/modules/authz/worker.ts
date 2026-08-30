export type WorkerAccountStatus = 'active' | 'disabled' | 'deactivated';
export type WorkerLifecycleState =
  | 'STARTING'
  | 'READY'
  | 'CLAIMING'
  | 'BUSY'
  | 'DEGRADED'
  | 'DRAINING'
  | 'STOPPING'
  | 'STOPPED';

export type WorkerAuthContext = {
  userId: string;
  status: WorkerAccountStatus;
  sessionId?: string;
  strength?: 'password';
  roles?: readonly string[];
};

export type WorkerJobLink = {
  jobId: string;
  submissionId: string;
  ownerUserId: string;
  workerId?: string;
  state:
    | 'QUEUED'
    | 'LEASED'
    | 'WORKER_ACCEPTED'
    | 'SAFE_FIXTURE_RUNNING'
    | 'SAFE_FIXTURE_SUCCEEDED'
    | 'EXECUTION_COMPLETED'
    | 'SAFE_FIXTURE_FAILED_RETRYABLE'
    | 'SAFE_FIXTURE_FAILED_TERMINAL'
    | 'CANCELLED';
};

export type WorkerCapabilityManifest = {
  protocolVersion: string;
  buildVersion: string;
  executionModes: readonly string[];
  safeFixture: boolean;
  realSandboxedExecution: boolean;
  sandboxCapability: boolean;
  maxConcurrency: number;
  languageCapabilities: readonly string[];
};

export type WorkerStatusReference = {
  workerId: string;
  workerInstanceId: string;
  lifecycleState: WorkerLifecycleState;
  lastHeartbeatAt?: string;
  protocolVersion: string;
  buildVersion: string;
  capabilityManifest: WorkerCapabilityManifest;
  maxConcurrency: number;
  activeJobCount: number;
  activeJobIds?: readonly string[];
  degraded: boolean;
  offline: boolean;
  processId?: string;
  rawLeaseToken?: string;
  redisEndpoint?: string;
  stackTrace?: string;
  sourceBody?: string;
  diagnosticCode?: string;
};

export type SafeWorkerStatus = {
  workerId: string;
  lifecycleState: WorkerLifecycleState;
  lastHeartbeatAt?: string;
  protocolVersion: string;
  buildVersion: string;
  degraded: boolean;
  offline: boolean;
  activeJobCount?: number;
  activeJobIds?: readonly string[];
  diagnosticCode?: string;
  capabilityManifest?: WorkerCapabilityManifest;
};

export type WorkerAuthorizationAction =
  | 'worker:status:view'
  | 'worker:diagnostics:inspect'
  | 'worker:capabilities:view'
  | 'judge:job:cancel';

export type WorkerAuditEvent = {
  actorUserId: string;
  action: WorkerAuthorizationAction;
  workerId?: string;
  workerInstanceId?: string;
  judgeJobId?: string;
  submissionId?: string;
  outcome: 'allowed' | 'denied';
  requestId: string;
  reasonCode:
    | 'OWNER'
    | 'OPERATOR'
    | 'INACTIVE'
    | 'MALFORMED'
    | 'DENIED'
    | 'TERMINAL'
    | 'UNKNOWN_STATE';
  occurredAt: string;
};

export type WorkerAuditHook = {
  record(event: WorkerAuditEvent): Promise<void> | void;
};
export type WorkerAuthorizationOptions = {
  roles?: ReadonlyMap<string, ReadonlySet<WorkerAuthorizationAction>>;
  resolveSubmissionOwner?: (
    submissionId: string,
  ) => Promise<string | null> | string | null;
  resolveJudgeJob?: (
    jobId: string,
  ) => Promise<WorkerJobLink | null> | WorkerJobLink | null;
  resolveWorker?: (workerId: string) => Promise<boolean> | boolean;
  resolveUserRoles?: (
    userId: string,
  ) => Promise<readonly string[]> | readonly string[];
  auditHook?: WorkerAuditHook;
};

const VALID_LIFECYCLE = new Set<WorkerLifecycleState>([
  'STARTING',
  'READY',
  'CLAIMING',
  'BUSY',
  'DEGRADED',
  'DRAINING',
  'STOPPING',
  'STOPPED',
]);
const VALID_JOB_STATES = new Set<WorkerJobLink['state']>([
  'QUEUED',
  'LEASED',
  'WORKER_ACCEPTED',
  'SAFE_FIXTURE_RUNNING',
  'SAFE_FIXTURE_SUCCEEDED',
  'EXECUTION_COMPLETED',
  'SAFE_FIXTURE_FAILED_RETRYABLE',
  'SAFE_FIXTURE_FAILED_TERMINAL',
  'CANCELLED',
]);
const active = (user: WorkerAuthContext | undefined) =>
  Boolean(
    user?.userId &&
    user.status === 'active' &&
    user.sessionId &&
    user.strength === 'password',
  );
const validWorker = (worker: WorkerStatusReference | undefined) =>
  Boolean(
    worker?.workerId &&
    worker.workerInstanceId &&
    worker.protocolVersion &&
    worker.buildVersion &&
    VALID_LIFECYCLE.has(worker.lifecycleState) &&
    Number.isInteger(worker.maxConcurrency) &&
    worker.maxConcurrency > 0 &&
    Number.isInteger(worker.activeJobCount) &&
    worker.activeJobCount >= 0,
  );
const validJob = (job: WorkerJobLink | null | undefined) =>
  Boolean(
    job?.jobId &&
    job.submissionId &&
    job.ownerUserId &&
    VALID_JOB_STATES.has(job.state),
  );

const capability = (
  user: WorkerAuthContext | undefined,
  action: WorkerAuthorizationAction,
  roles: ReadonlyMap<string, ReadonlySet<WorkerAuthorizationAction>>,
) =>
  active(user) &&
  (user!.roles ?? []).some((role) => roles.get(role)?.has(action));

const safeManifest = (
  manifest: WorkerCapabilityManifest,
  maxConcurrency: number,
): NonNullable<SafeWorkerStatus['capabilityManifest']> => ({
  protocolVersion:
    manifest.realSandboxedExecution &&
    manifest.sandboxCapability &&
    manifest.protocolVersion === '2C.1' &&
    manifest.executionModes.includes('REAL_SANDBOXED_EXECUTION') &&
    manifest.languageCapabilities.length === 1 &&
    manifest.languageCapabilities[0] === 'cpp20-gcc-13-v1'
      ? '2C.1'
      : '2A.1',
  buildVersion: manifest.buildVersion,
  executionModes:
    manifest.realSandboxedExecution &&
    manifest.sandboxCapability &&
    manifest.protocolVersion === '2C.1' &&
    manifest.executionModes.includes('REAL_SANDBOXED_EXECUTION') &&
    manifest.languageCapabilities.length === 1 &&
    manifest.languageCapabilities[0] === 'cpp20-gcc-13-v1'
      ? ['SAFE_FIXTURE_QUALIFICATION', 'REAL_SANDBOXED_EXECUTION']
      : ['SAFE_FIXTURE_QUALIFICATION'],
  safeFixture: true,
  realSandboxedExecution:
    manifest.realSandboxedExecution &&
    manifest.sandboxCapability &&
    manifest.protocolVersion === '2C.1' &&
    manifest.executionModes.includes('REAL_SANDBOXED_EXECUTION') &&
    manifest.languageCapabilities.length === 1 &&
    manifest.languageCapabilities[0] === 'cpp20-gcc-13-v1',
  sandboxCapability:
    manifest.realSandboxedExecution &&
    manifest.sandboxCapability &&
    manifest.protocolVersion === '2C.1' &&
    manifest.executionModes.includes('REAL_SANDBOXED_EXECUTION') &&
    manifest.languageCapabilities.length === 1 &&
    manifest.languageCapabilities[0] === 'cpp20-gcc-13-v1',
  maxConcurrency:
    Number.isInteger(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 1,
  languageCapabilities:
    manifest.realSandboxedExecution &&
    manifest.sandboxCapability &&
    manifest.protocolVersion === '2C.1' &&
    manifest.executionModes.includes('REAL_SANDBOXED_EXECUTION') &&
    manifest.languageCapabilities.length === 1 &&
    manifest.languageCapabilities[0] === 'cpp20-gcc-13-v1'
      ? ['cpp20-gcc-13-v1']
      : [],
});

export function projectWorkerStatus(
  worker: WorkerStatusReference | undefined,
  user: WorkerAuthContext | undefined,
  canonicalJob?: WorkerJobLink,
  roles: ReadonlyMap<
    string,
    ReadonlySet<WorkerAuthorizationAction>
  > = new Map(),
): SafeWorkerStatus | null {
  if (!validWorker(worker) || !active(user)) return null;
  const operator =
    capability(user, 'worker:diagnostics:inspect', roles) ||
    capability(user, 'worker:status:view', roles);
  // This projector is intentionally pure: callers must pass the job returned
  // by the authoritative resolver after an authorization decision.
  if (
    !operator &&
    (!validJob(canonicalJob) ||
      canonicalJob!.ownerUserId !== user!.userId ||
      canonicalJob!.workerId !== worker!.workerId)
  )
    return null;
  const result: SafeWorkerStatus = {
    workerId: worker!.workerId,
    lifecycleState: worker!.lifecycleState,
    protocolVersion: worker!.protocolVersion,
    buildVersion: worker!.buildVersion,
    degraded: worker!.degraded,
    offline: worker!.offline,
  };
  if (worker!.lastHeartbeatAt) result.lastHeartbeatAt = worker!.lastHeartbeatAt;
  if (operator) {
    result.activeJobCount = worker!.activeJobCount;
    result.activeJobIds = worker!.activeJobIds ? [...worker!.activeJobIds] : [];
    if (worker!.diagnosticCode) result.diagnosticCode = worker!.diagnosticCode;
  }
  return result;
}

export function projectWorkerCapabilities(
  worker: WorkerStatusReference | undefined,
  user: WorkerAuthContext | undefined,
  roles: ReadonlyMap<
    string,
    ReadonlySet<WorkerAuthorizationAction>
  > = new Map(),
): SafeWorkerStatus['capabilityManifest'] | null {
  if (
    !validWorker(worker) ||
    !capability(user, 'worker:capabilities:view', roles)
  )
    return null;
  return safeManifest(worker!.capabilityManifest, worker!.maxConcurrency);
}

export function createWorkerAuthorizationPolicy(
  options: WorkerAuthorizationOptions = {},
) {
  const roles =
    options.roles ?? new Map<string, ReadonlySet<WorkerAuthorizationAction>>();
  const audit = async (
    user: WorkerAuthContext | undefined,
    action: WorkerAuthorizationAction,
    worker: WorkerStatusReference | undefined,
    job: WorkerJobLink | null | undefined,
    allowed: boolean,
    reasonCode: WorkerAuditEvent['reasonCode'],
    requestId = 'internal',
  ) => {
    const event: WorkerAuditEvent = {
      actorUserId: user?.userId ?? 'unknown',
      action,
      outcome: allowed ? 'allowed' : 'denied',
      requestId,
      reasonCode,
      occurredAt: new Date().toISOString(),
    };
    if (worker?.workerId) event.workerId = worker.workerId;
    if (worker?.workerInstanceId)
      event.workerInstanceId = worker.workerInstanceId;
    if (job?.jobId) event.judgeJobId = job.jobId;
    if (job?.submissionId) event.submissionId = job.submissionId;
    await options.auditHook?.record(event);
    return allowed;
  };
  const hasCapability = async (
    user: WorkerAuthContext | undefined,
    action: WorkerAuthorizationAction,
  ) => {
    if (!active(user)) return false;
    const resolvedRoles = options.resolveUserRoles
      ? await options.resolveUserRoles(user!.userId)
      : (user!.roles ?? []);
    return resolvedRoles.some((role) => roles.get(role)?.has(action));
  };
  const linkedOwner = async (job: WorkerJobLink | null | undefined) => {
    if (!validJob(job) || !options.resolveSubmissionOwner) return null;
    const owner = await options.resolveSubmissionOwner(job!.submissionId);
    return owner && owner === job!.ownerUserId ? owner : null;
  };
  const authoritativeJob = async (job: WorkerJobLink | undefined) => {
    if (!validJob(job) || !options.resolveJudgeJob) return null;
    const canonical = await options.resolveJudgeJob(job!.jobId);
    if (
      !validJob(canonical) ||
      canonical!.submissionId !== job!.submissionId ||
      canonical!.ownerUserId !== job!.ownerUserId ||
      canonical!.workerId !== job!.workerId
    )
      return null;
    return canonical;
  };
  const authoritativeWorker = async (
    worker: WorkerStatusReference | undefined,
  ) =>
    Boolean(
      validWorker(worker) &&
      options.resolveWorker &&
      (await options.resolveWorker(worker!.workerId)),
    );
  const decide = async (
    operation: string,
    user: WorkerAuthContext | undefined,
    worker?: WorkerStatusReference,
    job?: WorkerJobLink,
    requestId = 'internal',
  ) => {
    const action = (
      {
        status: 'worker:status:view',
        diagnostics: 'worker:diagnostics:inspect',
        capabilities: 'worker:capabilities:view',
        cancel: 'judge:job:cancel',
      } as Record<string, WorkerAuthorizationAction>
    )[operation];
    if (!action)
      return audit(
        user,
        'worker:status:view',
        worker,
        job,
        false,
        'DENIED',
        requestId,
      );
    if (!active(user))
      return audit(user, action, worker, job, false, 'INACTIVE', requestId);
    if (operation === 'status') {
      const canonicalJob = await authoritativeJob(job);
      const allowed =
        (await authoritativeWorker(worker)) &&
        ((await hasCapability(user, action)) ||
          (canonicalJob !== null &&
            canonicalJob.ownerUserId === user!.userId &&
            canonicalJob.workerId === worker!.workerId &&
            (await linkedOwner(canonicalJob)) === user!.userId));
      return audit(
        user,
        action,
        worker,
        job,
        allowed,
        allowed ? 'OWNER' : 'DENIED',
        requestId,
      );
    }
    if (operation === 'diagnostics' || operation === 'capabilities') {
      const allowed =
        (await authoritativeWorker(worker)) &&
        (await hasCapability(user, action));
      return audit(
        user,
        action,
        worker,
        job,
        allowed,
        allowed ? 'OPERATOR' : 'DENIED',
        requestId,
      );
    }
    const canonicalJob = await authoritativeJob(job);
    const allowed =
      (await hasCapability(user, action)) &&
      (await authoritativeWorker(worker)) &&
      canonicalJob !== null &&
      (await linkedOwner(canonicalJob)) !== null &&
      canonicalJob.workerId === worker!.workerId &&
      [
        'QUEUED',
        'LEASED',
        'WORKER_ACCEPTED',
        'SAFE_FIXTURE_RUNNING',
        'SAFE_FIXTURE_FAILED_RETRYABLE',
      ].includes(canonicalJob.state);
    return audit(
      user,
      action,
      worker,
      job,
      allowed,
      allowed
        ? 'OPERATOR'
        : validJob(canonicalJob) &&
            [
              'SAFE_FIXTURE_SUCCEEDED',
              'SAFE_FIXTURE_FAILED_TERMINAL',
              'CANCELLED',
            ].includes(canonicalJob!.state)
          ? 'TERMINAL'
          : 'DENIED',
      requestId,
    );
  };
  return {
    canViewWorkerStatus: (
      user: WorkerAuthContext | undefined,
      worker?: WorkerStatusReference,
      job?: WorkerJobLink,
      requestId?: string,
    ) => decide('status', user, worker, job, requestId),
    canInspectWorkerDiagnostics: (
      user: WorkerAuthContext | undefined,
      worker?: WorkerStatusReference,
      requestId?: string,
    ) => decide('diagnostics', user, worker, undefined, requestId),
    canViewWorkerCapabilities: (
      user: WorkerAuthContext | undefined,
      worker?: WorkerStatusReference,
      requestId?: string,
    ) => decide('capabilities', user, worker, undefined, requestId),
    canCancelJudgeJob: (
      user: WorkerAuthContext | undefined,
      worker?: WorkerStatusReference,
      job?: WorkerJobLink,
      requestId?: string,
    ) => decide('cancel', user, worker, job, requestId),
    canWorkerOperation: (
      operation: string,
      user: WorkerAuthContext | undefined,
      worker?: WorkerStatusReference,
      job?: WorkerJobLink,
      requestId?: string,
    ) => decide(operation, user, worker, job, requestId),
  };
}
