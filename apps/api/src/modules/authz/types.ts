import type { AuthContext } from '../auth/types.js';

export type ResourceReference = { id?: string; ownerId?: string };
export type AuthorizationPolicy = {
  can(
    action: string,
    resource: string,
    context: AuthContext | undefined,
    target?: ResourceReference,
  ): Promise<boolean>;
};
export type AuditRecord = {
  actorUserId: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'allowed' | 'denied';
  requestId: string;
  occurredAt: string;
  metadata?: Readonly<Record<string, string>>;
};
export type AuditHook = { record(event: AuditRecord): Promise<void> | void };
export type Role = { name: string; permissions: ReadonlySet<string> };
