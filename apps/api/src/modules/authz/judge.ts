export type JudgeAccountStatus = 'active' | 'disabled' | 'deactivated';

export type JudgeAuthorizationUser = {
  userId: string;
  status: JudgeAccountStatus;
  sessionId?: string;
  strength?: 'password';
  roles?: readonly string[];
};

export type JudgeJobReference = {
  id: string;
  submissionId: string;
  ownerUserId: string;
  state:
    | 'QUEUED'
    | 'LEASED_FAKE'
    | 'SUCCEEDED_FAKE'
    | 'FAILED_RETRYABLE'
    | 'FAILED_TERMINAL'
    | 'CANCELLED';
  attemptNumber?: number;
};

export type JudgeAuthorizationAction =
  | 'judge:job:view'
  | 'judge:job:inspect'
  | 'judge:job:enqueue'
  | 'judge:job:retry'
  | 'judge:job:cancel';
export type JudgeOperation =
  'view' | 'inspect' | 'enqueue' | 'retry' | 'cancel';

export type JudgeAuditEvent = {
  actorUserId: string;
  action: JudgeAuthorizationAction;
  resource: 'judge_job';
  resourceId?: string;
  outcome: 'allowed' | 'denied';
  requestId: string;
  occurredAt: string;
};

export type JudgeAuditHook = {
  record(event: JudgeAuditEvent): Promise<void> | void;
};

export type JudgeAuthorizationPolicy = {
  canViewJudgeJob(
    user: JudgeAuthorizationUser | undefined,
    job: JudgeJobReference | undefined,
    requestId?: string,
  ): Promise<boolean>;
  canInspectJudgeJob(
    user: JudgeAuthorizationUser | undefined,
    job: JudgeJobReference | undefined,
    requestId?: string,
  ): Promise<boolean>;
  canEnqueueJudgeJob(
    user: JudgeAuthorizationUser | undefined,
    job?: JudgeJobReference,
    requestId?: string,
  ): Promise<boolean>;
  canRetryJudgeJob(
    user: JudgeAuthorizationUser | undefined,
    job: JudgeJobReference | undefined,
    requestId?: string,
  ): Promise<boolean>;
  canCancelJudgeJob(
    user: JudgeAuthorizationUser | undefined,
    job: JudgeJobReference | undefined,
    requestId?: string,
  ): Promise<boolean>;
  canJudgeJobOperation(
    operation: string,
    user: JudgeAuthorizationUser | undefined,
    job?: JudgeJobReference,
    requestId?: string,
  ): Promise<boolean>;
};

export type JudgeAuthorizationOptions = {
  roles?: ReadonlyMap<string, ReadonlySet<JudgeAuthorizationAction>>;
  auditHook?: JudgeAuditHook;
  resolveSubmissionOwner?: (
    submissionId: string,
  ) => Promise<string | null> | string | null;
};

const roleAllows = (
  user: JudgeAuthorizationUser,
  action: JudgeAuthorizationAction,
  roles: ReadonlyMap<string, ReadonlySet<JudgeAuthorizationAction>>,
) => (user.roles ?? []).some((role) => roles.get(role)?.has(action));

const validUser = (user: JudgeAuthorizationUser | undefined) =>
  Boolean(
    user?.userId &&
    user.status === 'active' &&
    user.sessionId &&
    user.strength === 'password',
  );

const VALID_STATES = new Set<JudgeJobReference['state']>([
  'QUEUED',
  'LEASED_FAKE',
  'SUCCEEDED_FAKE',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED',
]);
const validJob = (job: JudgeJobReference | undefined) =>
  Boolean(
    job?.id &&
    job.submissionId &&
    job.ownerUserId &&
    VALID_STATES.has(job.state),
  );

export function createJudgeAuthorizationPolicy(
  options: JudgeAuthorizationOptions = {},
): JudgeAuthorizationPolicy {
  const roles = options.roles ?? new Map();
  const audit = async (
    user: JudgeAuthorizationUser | undefined,
    action: JudgeAuthorizationAction,
    job: JudgeJobReference | undefined,
    allowed: boolean,
    requestId: string,
  ) => {
    const event: JudgeAuditEvent = {
      actorUserId: user?.userId ?? 'unknown',
      action,
      resource: 'judge_job',
      outcome: allowed ? 'allowed' : 'denied',
      requestId,
      occurredAt: new Date().toISOString(),
    };
    if (job?.id) event.resourceId = job.id;
    await options.auditHook?.record(event);
  };
  const decide = async (
    user: JudgeAuthorizationUser | undefined,
    action: JudgeAuthorizationAction,
    job: JudgeJobReference | undefined,
    allowed: boolean,
    requestId = 'internal',
  ) => {
    await audit(user, action, job, allowed, requestId);
    return allowed;
  };
  const linkedOwner = async (job: JudgeJobReference | undefined) => {
    if (!validJob(job) || !options.resolveSubmissionOwner) return null;
    const owner = await options.resolveSubmissionOwner(job!.submissionId);
    return owner && owner === job!.ownerUserId ? owner : null;
  };
  const ownerOrCapability = async (
    user: JudgeAuthorizationUser | undefined,
    job: JudgeJobReference | undefined,
    action: JudgeAuthorizationAction,
  ) => {
    if (!validUser(user) || !validJob(job)) return false;
    const owner = await linkedOwner(job);
    return owner === user!.userId || roleAllows(user!, action, roles);
  };
  const capabilityOnly = (
    user: JudgeAuthorizationUser | undefined,
    action: JudgeAuthorizationAction,
  ) => validUser(user) && roleAllows(user!, action, roles);
  return {
    async canViewJudgeJob(user, job, requestId) {
      const allowed = await ownerOrCapability(user, job, 'judge:job:view');
      return decide(user, 'judge:job:view', job, allowed, requestId);
    },
    async canInspectJudgeJob(user, job, requestId) {
      const allowed = await ownerOrCapability(user, job, 'judge:job:inspect');
      return decide(user, 'judge:job:inspect', job, allowed, requestId);
    },
    async canEnqueueJudgeJob(user, job, requestId) {
      const allowed =
        (await linkedOwner(job)) !== null &&
        capabilityOnly(user, 'judge:job:enqueue');
      return decide(user, 'judge:job:enqueue', job, allowed, requestId);
    },
    async canRetryJudgeJob(user, job, requestId) {
      const allowed =
        capabilityOnly(user, 'judge:job:retry') &&
        (await linkedOwner(job)) !== null &&
        job!.state === 'FAILED_RETRYABLE';
      return decide(user, 'judge:job:retry', job, allowed, requestId);
    },
    async canCancelJudgeJob(user, job, requestId) {
      const allowed =
        capabilityOnly(user, 'judge:job:cancel') &&
        (await linkedOwner(job)) !== null &&
        ['QUEUED', 'LEASED_FAKE', 'FAILED_RETRYABLE'].includes(job!.state);
      return decide(user, 'judge:job:cancel', job, allowed, requestId);
    },
    async canJudgeJobOperation(operation, user, job, requestId) {
      switch (operation) {
        case 'view':
          return this.canViewJudgeJob(user, job, requestId);
        case 'inspect':
          return this.canInspectJudgeJob(user, job, requestId);
        case 'retry':
          return this.canRetryJudgeJob(user, job, requestId);
        case 'cancel':
          return this.canCancelJudgeJob(user, job, requestId);
        case 'enqueue':
          return this.canEnqueueJudgeJob(user, job, requestId);
        default:
          return decide(user, 'judge:job:view', job, false, requestId);
      }
    },
  };
}
