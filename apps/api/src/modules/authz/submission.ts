import type { AuditHook } from './types.js';

export type SubmissionAuthorizationUser = {
  id: string;
  status: 'active' | 'disabled' | 'deactivated';
  roles?: readonly string[];
  capabilities?: {
    canViewAnySubmission?: boolean;
  };
};

export type SubmissionProblemRevision = {
  id: string;
  problemId: string;
  authorId?: string | null;
  status: 'draft' | 'published' | 'archived';
  visibility: 'private' | 'public';
};

export type SubmissionReference = {
  id: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  status: 'PENDING' | 'QUEUED';
};

export type SubmissionAuthorizationPolicy = {
  canSubmit(
    user: SubmissionAuthorizationUser | undefined,
    problemRevision: SubmissionProblemRevision | undefined,
  ): Promise<boolean>;
  canViewSubmission(
    user: SubmissionAuthorizationUser | undefined,
    submission: SubmissionReference | undefined,
  ): Promise<boolean>;
  canListOwnSubmissions(
    user: SubmissionAuthorizationUser | undefined,
  ): Promise<boolean>;
};

export type SubmissionAuditEvent = {
  actorUserId: string;
  action: 'submission:create' | 'submission:view' | 'submission:list';
  submissionId?: string;
  outcome: 'allowed' | 'denied';
  requestId: string;
  occurredAt: string;
};

export type SubmissionAuditHook = Pick<AuditHook, 'record'> & {
  record(event: SubmissionAuditEvent): Promise<void> | void;
};

export type SubmissionAbuseHook = {
  assess(input: {
    userId: string;
    problemId: string;
    occurredAt: string;
  }): Promise<'allow' | 'deny'> | 'allow' | 'deny';
};

export type SubmissionAuthorizationOptions = {
  auditHook?: SubmissionAuditHook;
  abuseHook?: SubmissionAbuseHook;
  roles?: ReadonlyMap<string, ReadonlySet<string>>;
  hasPermissions?: (
    userId: string,
    permissions: readonly string[],
  ) => Promise<boolean> | boolean;
};

const hasPermission = (
  user: SubmissionAuthorizationUser,
  permission: string,
  roles: ReadonlyMap<string, ReadonlySet<string>>,
) => (user.roles ?? []).some((role) => roles.get(role)?.has(permission));

export function createSubmissionAuthorizationPolicy(
  options: SubmissionAuthorizationOptions = {},
): SubmissionAuthorizationPolicy {
  const roles = options.roles ?? new Map<string, ReadonlySet<string>>();
  const hasPermissions = options.hasPermissions;
  const active = (user: SubmissionAuthorizationUser | undefined) =>
    Boolean(user?.id && user.status === 'active');
  return {
    async canSubmit(user, revision) {
      if (!active(user) || !revision?.id || !revision.problemId) return false;
      if (revision.status === 'archived') return false;
      if (revision.status === 'published' && revision.visibility === 'public')
        return true;
      return Boolean(
        revision.authorId === user!.id ||
        hasPermission(user!, 'submission:create:private', roles),
      );
    },
    async canViewSubmission(user, submission) {
      if (!active(user) || !submission?.id || !submission.ownerUserId)
        return false;
      if (submission.ownerUserId === user!.id) return true;
      if (user!.capabilities?.canViewAnySubmission === true) return true;
      if (hasPermission(user!, 'submission:view:any', roles)) return true;
      return hasPermissions
        ? hasPermissions(user!.id, ['submission:view:any'])
        : false;
    },
    async canListOwnSubmissions(user) {
      return active(user);
    },
  };
}
