import type { AuthorizationPolicy, ResourceReference, Role } from './types.js';

const key = (action: string, resource: string) => `${resource}:${action}`;

export function createMemoryAuthorizationPolicy(
  input: {
    roles?: Role[];
    assignments?: Map<string, string[]>;
  } = {},
): AuthorizationPolicy & {
  assign(userId: string, role: string): void;
  defineRole(role: Role): void;
} {
  const roles = new Map((input.roles ?? []).map((role) => [role.name, role]));
  const assignments = input.assignments ?? new Map<string, string[]>();
  return {
    defineRole(role) {
      roles.set(role.name, role);
    },
    assign(userId, role) {
      assignments.set(userId, [...(assignments.get(userId) ?? []), role]);
    },
    async can(action, resource, context, target?: ResourceReference) {
      if (
        !context?.userId ||
        !context.sessionId ||
        context.strength !== 'password'
      )
        return false;
      const permission = key(action, resource);
      const allowed = (assignments.get(context.userId) ?? []).some((name) =>
        roles.get(name)?.permissions.has(permission),
      );
      if (!allowed) return false;
      if (
        target?.ownerId &&
        target.ownerId !== context.userId &&
        permission !== 'account:disable'
      )
        return false;
      return true;
    },
  };
}
