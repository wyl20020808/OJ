import { randomUUID } from 'node:crypto';
import type { AuthRepository } from './types.js';
import type { User } from '../user/model.js';
export function createMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, User & { passwordHash: string }>();
  const sessions = new Map<
    string,
    { id: string; userId: string; expiresAt: Date; revoked: boolean }
  >();
  return {
    async createUser(input) {
      const now = new Date().toISOString();
      const user = {
        id: randomUUID(),
        ...input,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      };
      users.set(user.id, user);
      return user;
    },
    async findByIdentity(identity) {
      const value = identity.toLowerCase();
      return (
        [...users.values()].find(
          (u) =>
            u.username.toLowerCase() === value ||
            u.email.toLowerCase() === value,
        ) ?? null
      );
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async createSession(input) {
      const id = randomUUID();
      sessions.set(input.tokenHash, {
        id,
        userId: input.userId,
        expiresAt: input.expiresAt,
        revoked: false,
      });
      return { id };
    },
    async findSession(hash) {
      const s = sessions.get(hash);
      return s && !s.revoked && s.expiresAt > new Date() ? s : null;
    },
    async revokeSession(id) {
      for (const s of sessions.values()) if (s.id === id) s.revoked = true;
    },
  };
}
