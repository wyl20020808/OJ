import type { AuthRepository } from './types.js';
type Row = Record<string, unknown>;
export function createPostgresAuthRepository(pool: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
}): AuthRepository {
  return {
    async createUser(i) {
      const r = await pool.query(
        "INSERT INTO users (username,email,display_name,status) VALUES ($1,$2,$3,'active') RETURNING id,username,email,display_name,status,created_at,updated_at",
        [i.username, i.email, i.displayName],
      );
      await pool.query(
        'INSERT INTO user_credentials (user_id,password_hash) VALUES ($1,$2)',
        [r.rows[0]!.id, i.passwordHash],
      );
      return map(r.rows[0]!);
    },
    async findByIdentity(v) {
      const r = await pool.query(
        'SELECT u.id,u.username,u.email,u.display_name,u.status,u.created_at,u.updated_at,c.password_hash FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE lower(u.username)=lower($1) OR lower(u.email)=lower($1)',
        [v],
      );
      return r.rows[0]
        ? { ...map(r.rows[0]!), passwordHash: String(r.rows[0]!.password_hash) }
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
  };
}
const map = (r: Row) => ({
  id: String(r.id),
  username: String(r.username),
  email: String(r.email),
  displayName: String(r.display_name),
  status: r.status as 'active' | 'disabled',
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
});
