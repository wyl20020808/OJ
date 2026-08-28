import type { User } from '../user/model.js';

export type AuthenticatedUser = Pick<
  User,
  'id' | 'username' | 'email' | 'displayName'
> & { status: 'active' };
export type AccountView = AuthenticatedUser & {
  createdAt: string;
  updatedAt: string;
  capabilities: {
    canManageSessions: boolean;
  };
};
export type AuthContext = {
  userId: string;
  sessionId: string;
  strength: 'password';
};
export type AuthRepository = {
  createUser(input: {
    username: string;
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<User>;
  findByIdentity(
    identity: string,
  ): Promise<(User & { passwordHash: string }) | null>;
  findById(id: string): Promise<User | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  findSession(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date } | null>;
  revokeSession(id: string): Promise<void>;
  updateUserStatus(id: string, status: User['status']): Promise<User | null>;
  listSessions(userId: string): Promise<SessionMetadata[]>;
  revokeAllSessions(userId: string): Promise<void>;
  findSessionOwner(id: string): Promise<string | null>;
};

export type SessionMetadata = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt?: string;
  deviceLabel?: string;
};

export const publicUser = (user: User): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  displayName: user.displayName,
  status: 'active',
});

export const publicAccount = (user: User): AccountView => ({
  ...publicUser(user),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  capabilities: { canManageSessions: user.status === 'active' },
});
