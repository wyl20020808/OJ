import type { User } from '../user/model.js';
import type { AuthV2Repository } from './v2-types.js';

export type AuthenticatedUser = Pick<
  User,
  'id' | 'username' | 'email' | 'displayName'
> & { status: 'active'; guest?: boolean; upgradeHint?: string };
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
  strength: 'password' | 'guest';
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
  ): Promise<
    (User & { passwordHash: string; passwordLoginEnabled?: boolean }) | null
  >;
  findById(id: string): Promise<User | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  updateProfile(
    id: string,
    patch: { displayName: string },
  ): Promise<User | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<boolean>;
  findSession(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date } | null>;
  revokeSession(id: string): Promise<void>;
  updateUserStatus(id: string, status: User['status']): Promise<User | null>;
  listSessions(userId: string): Promise<SessionMetadata[]>;
  revokeAllSessions(userId: string): Promise<void>;
  revokeOtherSessions(userId: string, keepSessionId: string): Promise<void>;
  findSessionOwner(id: string): Promise<string | null>;
  v2?: AuthV2Repository;
};

export type SessionMetadata = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt?: string;
  deviceLabel?: string;
};

export const publicUser = (user: User, guest = false): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  displayName: user.displayName,
  status: 'active',
  ...(guest
    ? {
        guest: true,
        upgradeHint:
          'Add an email, phone, or social identity to upgrade this guest account.',
      }
    : {}),
});

export const publicAccount = (user: User, guest = false): AccountView => ({
  ...publicUser(user, guest),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  capabilities: { canManageSessions: user.status === 'active' },
});
