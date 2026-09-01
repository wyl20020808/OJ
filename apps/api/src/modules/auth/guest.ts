import { randomBytes, randomUUID } from 'node:crypto';
import type { User } from '../user/model.js';
import { tokenHash } from './crypto.js';
import type { AuthRepository } from './types.js';

export type GuestAuthRateLimiter = {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
};

export type GuestSessionInput = {
  resumeTokenHash: string;
  resumeExpiresAt: Date;
  sessionTokenHash: string;
  sessionExpiresAt: Date;
};

export type GuestResumeInput = GuestSessionInput & { oldTokenHash: string };

export type GuestAuthStore = {
  createGuest(
    input: GuestSessionInput,
  ): Promise<{ user: User; sessionId: string }>;
  resumeGuest(
    input: GuestResumeInput,
  ): Promise<{ user: User; sessionId: string } | null>;
  revokeResume(tokenHash: string): Promise<boolean>;
  isGuest(userId: string): Promise<boolean>;
  findUser(userId: string): Promise<User | null>;
};

export const guestToken = () => randomBytes(32).toString('base64url');

const guestCode = () =>
  randomBytes(5).toString('hex').slice(0, 8).toUpperCase();

export function createMemoryGuestAuthStore(
  sessionRepository?: Pick<AuthRepository, 'createSession'>,
): GuestAuthStore {
  const users = new Map<string, User>();
  const resumes = new Map<
    string,
    { userId: string; expiresAt: Date; revoked: boolean }
  >();
  const sessions = new Map<string, string>();
  return {
    async createGuest(input) {
      const id = randomUUID();
      const code = guestCode();
      const user: User = {
        id,
        username: `guest-${id.slice(0, 12)}`,
        email: null,
        displayName: `游客 ${code}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      users.set(id, user);
      resumes.set(input.resumeTokenHash, {
        userId: id,
        expiresAt: input.resumeExpiresAt,
        revoked: false,
      });
      const sessionId = sessionRepository
        ? (
            await sessionRepository.createSession({
              userId: id,
              tokenHash: input.sessionTokenHash,
              expiresAt: input.sessionExpiresAt,
            })
          ).id
        : randomUUID();
      sessions.set(input.sessionTokenHash, id);
      return { user, sessionId };
    },
    async resumeGuest(input) {
      const current = resumes.get(input.oldTokenHash);
      if (!current || current.revoked || current.expiresAt <= new Date())
        return null;
      const user = users.get(current.userId);
      if (!user || user.status !== 'active') return null;
      current.revoked = true;
      resumes.set(input.resumeTokenHash, {
        userId: user.id,
        expiresAt: input.resumeExpiresAt,
        revoked: false,
      });
      const sessionId = sessionRepository
        ? (
            await sessionRepository.createSession({
              userId: user.id,
              tokenHash: input.sessionTokenHash,
              expiresAt: input.sessionExpiresAt,
            })
          ).id
        : randomUUID();
      sessions.set(input.sessionTokenHash, user.id);
      user.updatedAt = new Date().toISOString();
      return { user, sessionId };
    },
    async revokeResume(hash) {
      const value = resumes.get(hash);
      if (!value || value.revoked) return false;
      value.revoked = true;
      return true;
    },
    async isGuest(userId) {
      return (
        [...resumes.values()].some((resume) => resume.userId === userId) ||
        [...users.keys()].includes(userId)
      );
    },
    async findUser(userId) {
      return users.get(userId) ?? null;
    },
  };
}

type DbQuery = { rows: Record<string, unknown>[] };
type DbClient = {
  query(sql: string, values?: unknown[]): Promise<DbQuery>;
  release(): void;
};
type DbPool = {
  query(sql: string, values?: unknown[]): Promise<DbQuery>;
  connect(): Promise<DbClient>;
};

const mapUser = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  username: String(row.username),
  email: row.email === null ? null : String(row.email),
  displayName: String(row.display_name),
  status: row.status as User['status'],
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

export function createPostgresGuestAuthStore(pool: DbPool): GuestAuthStore {
  return {
    async createGuest(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const user = (
          await client.query(
            "INSERT INTO users(username,email,display_name,status) VALUES($1,NULL,$2,'active') RETURNING id,username,email,display_name,status,created_at,updated_at",
            [
              `guest-${randomUUID().replace(/-/g, '').slice(0, 20)}`,
              `游客 ${guestCode()}`,
            ],
          )
        ).rows[0]!;
        const identity = (
          await client.query(
            'INSERT INTO guest_identities(user_id) VALUES($1) RETURNING id',
            [user.id],
          )
        ).rows[0]!;
        const session = (
          await client.query(
            'INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3) RETURNING id',
            [user.id, input.sessionTokenHash, input.sessionExpiresAt],
          )
        ).rows[0]!;
        await client.query(
          'INSERT INTO guest_resume_credentials(guest_identity_id,token_hash,expires_at) VALUES($1,$2,$3)',
          [identity.id, input.resumeTokenHash, input.resumeExpiresAt],
        );
        await client.query('COMMIT');
        return { user: mapUser(user), sessionId: String(session.id) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async resumeGuest(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = (
          await client.query(
            "SELECT gi.id guest_identity_id,u.id,u.username,u.email,u.display_name,u.status,u.created_at,u.updated_at FROM guest_resume_credentials grc JOIN guest_identities gi ON gi.id=grc.guest_identity_id JOIN users u ON u.id=gi.user_id WHERE grc.token_hash=$1 AND grc.revoked_at IS NULL AND grc.expires_at>now() AND gi.revoked_at IS NULL AND u.status='active' FOR UPDATE OF grc,gi,u",
            [input.oldTokenHash],
          )
        ).rows[0];
        if (!found) {
          await client.query('ROLLBACK');
          return null;
        }
        await client.query(
          'UPDATE guest_resume_credentials SET revoked_at=now(),last_used_at=now() WHERE token_hash=$1',
          [input.oldTokenHash],
        );
        await client.query(
          'INSERT INTO guest_resume_credentials(guest_identity_id,token_hash,token_version,expires_at,rotated_from_id) SELECT guest_identity_id,$2,token_version+1,$3,id FROM guest_resume_credentials WHERE token_hash=$1',
          [input.oldTokenHash, input.resumeTokenHash, input.resumeExpiresAt],
        );
        await client.query(
          'UPDATE guest_identities SET last_used_at=now() WHERE id=$1',
          [found.guest_identity_id],
        );
        const session = (
          await client.query(
            'INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3) RETURNING id',
            [found.id, input.sessionTokenHash, input.sessionExpiresAt],
          )
        ).rows[0]!;
        await client.query('COMMIT');
        return { user: mapUser(found), sessionId: String(session.id) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async revokeResume(hash) {
      const result = await pool.query(
        'UPDATE guest_resume_credentials SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id',
        [hash],
      );
      return Boolean(result.rows[0]);
    },
    async isGuest(userId) {
      const result = await pool.query(
        'SELECT 1 FROM guest_identities WHERE user_id=$1 AND revoked_at IS NULL AND upgraded_at IS NULL',
        [userId],
      );
      return Boolean(result.rows[0]);
    },
    async findUser(userId) {
      const result = await pool.query(
        'SELECT id,username,email,display_name,status,created_at,updated_at FROM users WHERE id=$1',
        [userId],
      );
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
  };
}

export const guestTokenHash = tokenHash;
