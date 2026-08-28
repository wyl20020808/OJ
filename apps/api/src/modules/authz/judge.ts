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
};

export type JudgeAuthorizationOptions = {
  roles?: ReadonlyMap<string, ReadonlySet<JudgeAuthorizationAction>>;
  auditHook?: JudgeAuditHook;
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

const validJob = (job: JudgeJobReference | undefined) =>
  Boolean(job?.id && job.submissionId && job.ownerUserId && job.state);

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
  return {
    async canViewJudgeJob(user, job, requestId) {
      const allowed =
        validUser(user) &&
        validJob(job) &&
        (job!.ownerUserId === user!.userId ||
          roleAllows(user!, 'judge:job:view', roles));
      return decide(user, 'judge:job:view', job, allowed, requestId);
    },
    async canInspectJudgeJob(user, job, requestId) {
      const allowed =
        validUser(user) &&
        validJob(job) &&
        (job!.ownerUserId === user!.userId ||
          roleAllows(user!, 'judge:job:inspect', roles));
      return decide(user, 'judge:job:inspect', job, allowed, requestId);
    },
    async canEnqueueJudgeJob(user, requestId) {
      const allowed =
        validUser(user) && roleAllows(user!, 'judge:job:enqueue', roles);
      return decide(user, 'judge:job:enqueue', undefined, allowed, requestId);
    },
    async canRetryJudgeJob(user, job, requestId) {
      const allowed =
        validUser(user) &&
        validJob(job) &&
        roleAllows(user!, 'judge:job:retry', roles) &&
        job!.state !== 'CANCELLED' &&
        job!.state !== 'SUCCEEDED_FAKE' &&
        job!.state !== 'FAILED_TERMINAL';
      return decide(user, 'judge:job:retry', job, allowed, requestId);
    },
    async canCancelJudgeJob(user, job, requestId) {
      const allowed =
        validUser(user) &&
        validJob(job) &&
        roleAllows(user!, 'judge:job:cancel', roles) &&
        job!.state !== 'CANCELLED' &&
        job!.state !== 'SUCCEEDED_FAKE' &&
        job!.state !== 'FAILED_TERMINAL';
      return decide(user, 'judge:job:cancel', job, allowed, requestId);
    },
  };
}
