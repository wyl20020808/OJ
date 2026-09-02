import type { User } from '../user/model.js';
import type {
  AuthIdentity,
  AuthOnboardingContinuation,
  AuthV2Repository,
  IdentityKind,
  OAuthTransactionRecord,
  VerificationChallengeRecord,
  AuthProvider,
  VerificationChannel,
  VerificationPurpose,
} from './v2-types.js';

type Row = Record<string, unknown>;
type Queryable = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Row[]; rowCount?: number | null }>;
};

const mapIdentity = (row: Row): AuthIdentity => ({
  id: String(row.id),
  userId: String(row.user_id),
  kind: row.kind as IdentityKind,
  value: String(row.normalized_value),
  ...(row.provider ? { provider: row.provider as AuthProvider } : {}),
  ...(row.provider_subject ? { subject: String(row.provider_subject) } : {}),
  ...(row.display_name ? { displayName: String(row.display_name) } : {}),
  ...(row.avatar_url ? { avatarUrl: String(row.avatar_url) } : {}),
  verifiedAt: new Date(String(row.verified_at)).toISOString(),
  createdAt: new Date(String(row.created_at)).toISOString(),
  lastUsedAt: row.last_used_at
    ? new Date(String(row.last_used_at)).toISOString()
    : null,
});

const mapChallenge = (row: Row): VerificationChallengeRecord => ({
  id: String(row.id),
  channel: row.channel as VerificationChannel,
  purpose: row.purpose as VerificationPurpose,
  destination: String(row.destination),
  codeHash: String(row.code_hash),
  expiresAt: new Date(String(row.expires_at)),
  resendAt: new Date(String(row.resend_at)),
  attemptCount: Number(row.attempt_count),
  maxAttempts: Number(row.max_attempts),
  consumedAt: row.consumed_at ? new Date(String(row.consumed_at)) : null,
  state: row.state as VerificationChallengeRecord['state'],
});

export function createPostgresAuthV2Repository(
  pool: Queryable & {
    connect?: () => Promise<Queryable & { release(): void }>;
  },
): AuthV2Repository {
  const transaction = async <T>(work: (client: Queryable) => Promise<T>) => {
    const client = pool.connect ? await pool.connect() : pool;
    const transactional = 'release' in client;
    try {
      if (transactional) await client.query('BEGIN');
      const result = await work(client);
      if (transactional) await client.query('COMMIT');
      return result;
    } catch (error) {
      if (transactional) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (transactional) client.release();
    }
  };
  return {
    async findIdentity(input) {
      const params =
        input.kind === 'PROVIDER'
          ? [input.kind, input.provider, input.subject]
          : [input.kind, input.value];
      const predicate =
        input.kind === 'PROVIDER'
          ? 'kind=$1 AND provider=$2 AND provider_subject=$3'
          : 'kind=$1 AND normalized_value=$2';
      const result = await pool.query(
        `SELECT id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at FROM auth_identities WHERE ${predicate} LIMIT 1`,
        params,
      );
      return result.rows[0] ? mapIdentity(result.rows[0]) : null;
    },
    async listIdentifiers(userId) {
      const result = await pool.query(
        "SELECT id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at FROM auth_identities WHERE user_id=$1 AND kind IN ('EMAIL','PHONE') ORDER BY created_at,id",
        [userId],
      );
      return result.rows.map(mapIdentity);
    },
    async listProviderIdentities(userId) {
      const result = await pool.query(
        "SELECT id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at FROM auth_identities WHERE user_id=$1 AND kind='PROVIDER' ORDER BY created_at,id",
        [userId],
      );
      return result.rows.map(mapIdentity);
    },
    async createUserWithIdentity(input) {
      return transaction(async (client) => {
        const userResult = await client.query(
          "INSERT INTO users (username,email,display_name,status) VALUES ($1,$2,$3,'active') RETURNING id,username,email,display_name,status,created_at,updated_at",
          [input.username, input.email, input.displayName],
        );
        const row = userResult.rows[0]!;
        await client.query(
          'INSERT INTO user_credentials (user_id,password_hash,password_login_enabled) VALUES ($1,$2,$3)',
          [row.id, input.passwordHash, input.passwordLoginEnabled],
        );
        const identityResult = await client.query(
          'INSERT INTO auth_identities (user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at',
          [
            row.id,
            input.identity.kind,
            input.identity.value,
            input.identity.provider ?? null,
            input.identity.subject ?? null,
            input.identity.displayName ?? null,
            input.identity.avatarUrl ?? null,
          ],
        );
        const user: User = {
          id: String(row.id),
          username: String(row.username),
          email: row.email == null ? '' : String(row.email),
          displayName: String(row.display_name),
          status: row.status as User['status'],
          createdAt: new Date(String(row.created_at)).toISOString(),
          updatedAt: new Date(String(row.updated_at)).toISOString(),
        };
        return { user, identity: mapIdentity(identityResult.rows[0]!) };
      });
    },
    async addIdentity(input) {
      const result = await pool.query(
        'INSERT INTO auth_identities (user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (identity_key) DO NOTHING RETURNING id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at',
        [
          input.userId,
          input.kind,
          input.value,
          input.provider ?? null,
          input.subject ?? null,
          input.displayName ?? null,
          input.avatarUrl ?? null,
        ],
      );
      if (!result.rows[0]) {
        const existing = await pool.query(
          input.kind === 'PROVIDER'
            ? 'SELECT id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at FROM auth_identities WHERE kind=$1 AND provider=$2 AND provider_subject=$3'
            : 'SELECT id,user_id,kind,normalized_value,provider,provider_subject,display_name,avatar_url,verified_at,created_at,last_used_at FROM auth_identities WHERE kind=$1 AND normalized_value=$2',
          input.kind === 'PROVIDER'
            ? [input.kind, input.provider, input.subject]
            : [input.kind, input.value],
        );
        if (
          existing.rows[0] &&
          String(existing.rows[0].user_id) === input.userId
        )
          return mapIdentity(existing.rows[0]);
        throw Object.assign(new Error('identity conflict'), { code: '23505' });
      }
      const identity = mapIdentity(result.rows[0]);
      if (identity.userId !== input.userId)
        throw Object.assign(new Error('identity conflict'), { code: '23505' });
      return identity;
    },
    async removeIdentity(userId, identityId) {
      const result = await pool.query(
        'DELETE FROM auth_identities WHERE id=$1 AND user_id=$2',
        [identityId, userId],
      );
      return result.rowCount === 1;
    },
    async countLoginMethods(userId) {
      const result = await pool.query(
        'SELECT (SELECT CASE WHEN password_login_enabled THEN 1 ELSE 0 END FROM user_credentials WHERE user_id=$1) + (SELECT count(*) FROM auth_identities WHERE user_id=$1)::int AS count',
        [userId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
    async createVerificationChallenge(record) {
      await pool.query(
        'INSERT INTO auth_verification_challenges (id,channel,purpose,destination,code_hash,expires_at,resend_at,attempt_count,max_attempts,state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          record.id,
          record.channel,
          record.purpose,
          record.destination,
          record.codeHash,
          record.expiresAt,
          record.resendAt,
          record.attemptCount,
          record.maxAttempts,
          record.state,
        ],
      );
    },
    async findVerificationChallenge(id) {
      const result = await pool.query(
        'SELECT id,channel,purpose,destination,code_hash,expires_at,resend_at,attempt_count,max_attempts,consumed_at,state FROM auth_verification_challenges WHERE id=$1',
        [id],
      );
      return result.rows[0] ? mapChallenge(result.rows[0]) : null;
    },
    async supersedeVerificationChallenges(channel, purpose, destination) {
      await pool.query(
        "UPDATE auth_verification_challenges SET state='SUPERSEDED',consumed_at=now() WHERE channel=$1 AND purpose=$2 AND destination=$3 AND state IN ('ISSUED','VERIFIED')",
        [channel, purpose, destination],
      );
      await pool.query(
        "UPDATE auth_verification_grants SET consumed_at=now() WHERE challenge_id IN (SELECT id FROM auth_verification_challenges WHERE channel=$1 AND purpose=$2 AND destination=$3 AND state='SUPERSEDED') AND consumed_at IS NULL",
        [channel, purpose, destination],
      );
    },
    async findLatestVerificationChallenge(channel, purpose, destination) {
      const result = await pool.query(
        "SELECT id,channel,purpose,destination,code_hash,expires_at,resend_at,attempt_count,max_attempts,consumed_at,state FROM auth_verification_challenges WHERE channel=$1 AND purpose=$2 AND destination=$3 AND state IN ('ISSUED','VERIFIED') ORDER BY created_at DESC LIMIT 1",
        [channel, purpose, destination],
      );
      return result.rows[0] ? mapChallenge(result.rows[0]) : null;
    },
    async updateVerificationChallenge(record) {
      await pool.query(
        'UPDATE auth_verification_challenges SET attempt_count=$2,consumed_at=$3,state=$4 WHERE id=$1',
        [record.id, record.attemptCount, record.consumedAt, record.state],
      );
    },
    async createVerificationGrant(record) {
      await pool.query(
        'INSERT INTO auth_verification_grants (id,challenge_id,purpose,destination,expires_at,consumed_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          record.id,
          record.challengeId,
          record.purpose,
          record.destination,
          record.expiresAt,
          record.consumedAt,
        ],
      );
    },
    async consumeVerificationGrant(id) {
      const result = await pool.query(
        'UPDATE auth_verification_grants SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id,challenge_id,purpose,destination,expires_at,consumed_at',
        [id],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: String(row.id),
        challengeId: String(row.challenge_id),
        purpose: row.purpose as VerificationPurpose,
        destination: String(row.destination),
        expiresAt: new Date(String(row.expires_at)),
        consumedAt: new Date(String(row.consumed_at)),
      };
    },
    async createContinuation(record) {
      await pool.query(
        'INSERT INTO auth_onboarding_continuations (id,kind,identity_kind,identity_value,provider,provider_subject,display_name,avatar_url,email,email_verified,expires_at,link_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          record.id,
          record.kind,
          record.identity.kind,
          record.identity.value,
          record.identity.provider ?? null,
          record.identity.subject ?? null,
          record.identity.displayName ?? null,
          record.identity.avatarUrl ?? null,
          record.identity.email ?? null,
          record.identity.emailVerified ?? false,
          record.expiresAt,
          record.linkUserId ?? null,
        ],
      );
    },
    async consumeContinuation(id) {
      const result = await pool.query(
        'UPDATE auth_onboarding_continuations SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id,kind,identity_kind,identity_value,provider,provider_subject,display_name,avatar_url,email,email_verified,expires_at,consumed_at,link_user_id',
        [id],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: String(row.id),
        kind: row.kind as AuthOnboardingContinuation['kind'],
        identity: {
          kind: row.identity_kind as IdentityKind,
          value: String(row.identity_value),
          ...(row.provider ? { provider: row.provider as AuthProvider } : {}),
          ...(row.provider_subject
            ? { subject: String(row.provider_subject) }
            : {}),
          ...(row.display_name
            ? { displayName: String(row.display_name) }
            : {}),
          ...(row.avatar_url ? { avatarUrl: String(row.avatar_url) } : {}),
          ...(row.email ? { email: String(row.email) } : {}),
          emailVerified: row.email_verified === true,
        },
        expiresAt: new Date(String(row.expires_at)),
        consumedAt: new Date(String(row.consumed_at)),
        ...(row.link_user_id ? { linkUserId: String(row.link_user_id) } : {}),
      };
    },
    async createOAuthTransaction(record) {
      await pool.query(
        'INSERT INTO auth_oauth_transactions (id,provider,state_hash,code_verifier,nonce,return_to,expires_at,user_id,mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          record.id,
          record.provider,
          record.stateHash,
          record.codeVerifier,
          record.nonce,
          record.returnTo,
          record.expiresAt,
          record.userId,
          record.mode,
        ],
      );
    },
    async consumeOAuthTransaction(provider, stateHash) {
      const result = await pool.query(
        'UPDATE auth_oauth_transactions SET consumed_at=now() WHERE provider=$1 AND state_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id,provider,state_hash,code_verifier,nonce,return_to,expires_at,consumed_at,user_id,mode',
        [provider, stateHash],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: String(row.id),
        provider: row.provider as AuthProvider,
        stateHash: String(row.state_hash),
        codeVerifier: String(row.code_verifier),
        nonce: String(row.nonce),
        returnTo: String(row.return_to),
        expiresAt: new Date(String(row.expires_at)),
        consumedAt: new Date(String(row.consumed_at)),
        userId: row.user_id ? String(row.user_id) : null,
        mode: row.mode as OAuthTransactionRecord['mode'],
      };
    },
  };
}
