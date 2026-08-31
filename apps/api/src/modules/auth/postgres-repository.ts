import type { AuthRepository } from './types.js';
import { createPostgresAuthV2Repository } from './postgres-v2-repository.js';
type Row = Record<string, unknown>;
type Queryable = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Row[]; rowCount?: number | null }>;
};
export function createPostgresAuthRepository(
  pool: Queryable & {
    connect?: () => Promise<Queryable & { release(): void }>;
  },
): AuthRepository {
  const repository: AuthRepository = {
    async createUser(i) {
      const client = pool.connect ? await pool.connect() : pool;
      try {
        if ('release' in client) await client.query('BEGIN');
        const r = await client.query(
          "INSERT INTO users (username,email,display_name,status) VALUES ($1,$2,$3,'active') RETURNING id,username,email,display_name,status,created_at,updated_at",
          [i.username, i.email, i.displayName],
        );
        await client.query(
          'INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2)',
          [r.rows[0]!.id, i.passwordHash],
        );
        if ('release' in client) await client.query('COMMIT');
        return map(r.rows[0]!);
      } catch (error) {
        if ('release' in client) await client.query('ROLLBACK');
        throw error;
      } finally {
        if ('release' in client) client.release();
      }
    },
    async findByIdentity(v) {
      const r = await pool.query(
        'SELECT u.id,u.username,u.email,u.display_name,u.status,u.created_at,u.updated_at,c.password_hash,c.password_login_enabled FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE lower(u.username)=lower($1) OR lower(u.email)=lower($1)',
        [v],
      );
      return r.rows[0]
        ? {
            ...map(r.rows[0]!),
            passwordHash: String(r.rows[0]!.password_hash),
            passwordLoginEnabled: r.rows[0]!.password_login_enabled !== false,
          }
        : null;
    },
    async findById(id) {
      const r = await pool.query(
        'SELECT id,username,email,display_name,status,created_at,updated_at FROM users WHERE id=$1',
        [id],
      );
      return r.rows[0] ? map(r.rows[0]!) : null;
    },
    async createSession(i) {
      const r = await pool.query(
        'INSERT INTO auth_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3) RETURNING id',
        [i.userId, i.tokenHash, i.expiresAt],
      );
      return { id: String(r.rows[0]!.id) };
    },
    async updateProfile(id, patch) {
      const r = await pool.query(
        "UPDATE users SET display_name=$2, updated_at=now() WHERE id=$1 AND status='active' RETURNING id,username,email,display_name,status,created_at,updated_at",
        [id, patch.displayName],
      );
      return r.rows[0] ? map(r.rows[0]) : null;
    },
    async updatePasswordHash(id, passwordHash) {
      const r = await pool.query(
        'UPDATE user_credentials SET password_hash=$2 WHERE user_id=$1',
        [id, passwordHash],
      );
      return (
        (r as { rowCount?: number }).rowCount === 1 || Boolean(r.rows.length)
      );
    },
    async findSession(h) {
      const r = await pool.query(
        'SELECT id,user_id,expires_at FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',
        [h],
      );
      return r.rows[0]
        ? {
            id: String(r.rows[0]!.id),
            userId: String(r.rows[0]!.user_id),
            expiresAt: new Date(String(r.rows[0]!.expires_at)),
          }
        : null;
    },
    async revokeSession(id) {
      await pool.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',
        [id],
      );
    },
    async updateUserStatus(id, status) {
      const r = await pool.query(
        'UPDATE users SET status=$2, updated_at=now() WHERE id=$1 RETURNING id,username,email,display_name,status,created_at,updated_at',
        [id, status],
      );
      if (!r.rows[0]) return null;
      if (status !== 'active')
        await pool.query(
          'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
          [id],
        );
      return map(r.rows[0]);
    },
    async listSessions(userId) {
      const r = await pool.query(
        'SELECT id,created_at,expires_at,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC',
        [userId],
      );
      return r.rows.map((row) => ({
        id: String(row.id),
        createdAt: new Date(String(row.created_at)).toISOString(),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
        revokedAt: row.revoked_at
          ? new Date(String(row.revoked_at)).toISOString()
          : null,
      }));
    },
    async revokeAllSessions(userId) {
      await pool.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [userId],
      );
    },
    async revokeOtherSessions(userId, keepSessionId) {
      await pool.query(
        'UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',
        [userId, keepSessionId],
      );
    },
    async findSessionOwner(id) {
      const r = await pool.query(
        'SELECT user_id FROM auth_sessions WHERE id=$1',
        [id],
      );
      return r.rows[0] ? String(r.rows[0].user_id) : null;
    },
  };
  repository.v2 = createPostgresAuthV2Repository(pool);
  return repository;
}
const map = (r: Row) => ({
  id: String(r.id),
  username: String(r.username),
  email: r.email === null ? null : String(r.email),
  displayName: String(r.display_name),
  status: r.status as 'active' | 'disabled' | 'deactivated',
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
});
