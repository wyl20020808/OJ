import type { User } from '../user/model.js';

export type AuthenticatedUser = Pick<
  User,
  'id' | 'username' | 'email' | 'displayName'
> & { status: 'active' };
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
};

export const publicUser = (user: User): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  displayName: user.displayName,
  status: 'active',
});
