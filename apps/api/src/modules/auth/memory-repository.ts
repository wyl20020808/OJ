import { randomUUID } from 'node:crypto';
import type { AuthRepository } from './types.js';
import type { User } from '../user/model.js';
export function createMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, User & { passwordHash: string }>();
  const sessions = new Map<
    string,
    {
      id: string;
      userId: string;
      expiresAt: Date;
      createdAt: Date;
      revokedAt: Date | null;
    }
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
            u.email?.toLowerCase() === value,
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
        createdAt: new Date(),
        revokedAt: null,
      });
      return { id };
    },
    async findSession(hash) {
      const s = sessions.get(hash);
      return s && !s.revokedAt && s.expiresAt > new Date() ? s : null;
    },
    async revokeSession(id) {
      for (const s of sessions.values())
        if (s.id === id) s.revokedAt = new Date();
    },
    async updateUserStatus(id, status) {
      const user = users.get(id);
      if (!user) return null;
      user.status = status;
      user.updatedAt = new Date().toISOString();
      if (status !== 'active')
        for (const s of sessions.values())
          if (s.userId === id) s.revokedAt = new Date();
      return user;
    },
    async listSessions(userId) {
      return [...sessions.values()]
        .filter((s) => s.userId === userId)
        .map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          revokedAt: s.revokedAt?.toISOString() ?? null,
        }));
    },
    async revokeAllSessions(userId) {
      for (const s of sessions.values())
        if (s.userId === userId) s.revokedAt = new Date();
    },
    async findSessionOwner(id) {
      return [...sessions.values()].find((s) => s.id === id)?.userId ?? null;
    },
  };
}
