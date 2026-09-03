import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresAuthRepository,
  createPostgresGuestAuthStore,
  RedisGuestRateLimiter,
  registerAuthModule,
} from '../../apps/api/src/modules/auth/index.js';
import { createDatabase } from '../../packages/database/src/index.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
const pool = createDatabase({ url: databaseUrl }).pool;
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
const createdUserIds: string[] = [];
const prefix = `test:guest-auth:${randomUUID()}`;

const apply = async (name: string) =>
  pool.query(
    await readFile(`packages/database/migrations/${name}.sql`, 'utf8'),
  );

const cookiesFrom = (value: unknown) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(String).map((item) => item.split(';', 1)[0] ?? '');
};

beforeAll(async () => {
  for (const name of [
    '0000_platform_metadata',
    '0001_auth_foundation',
    '0002_problem_foundation',
    '0003_authz_foundation',
    '0004_problem_authoring_revision',
    '0005_submission_intake',
    '0007_contest_foundation',
    '0008_social_messaging_foundation',
    '0009_notifications_foundation',
    '0010_guest_auth',
  ])
    await apply(name);
  await redis.connect();
});

afterAll(async () => {
  if (createdUserIds.length)
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
      createdUserIds,
    ]);
  await redis.quit();
  await pool.end();
});

describe('Guest Auth PostgreSQL and Redis integration', () => {
  it('persists a guest, resumes through a persistent cookie jar, rotates on API restart, and revokes', async () => {
    const repository = createPostgresAuthRepository(pool);
    const store = createPostgresGuestAuthStore(pool);
    const limiter = new RedisGuestRateLimiter(redis, prefix);
    const build = async () => {
      const app = Fastify({ logger: false });
      await registerAuthModule(app, {
        repository,
        guestStore: store,
        guestRateLimiter: limiter,
        guestResumeTtlMs: 120_000,
      });
      return app;
    };
    const firstApp = await build();
    const first = await firstApp.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const firstCookies = cookiesFrom(first.headers['set-cookie']);
    const firstSession = firstCookies.find((v) => v.startsWith('oj_session='));
    const firstResume = firstCookies.find((v) =>
      v.startsWith('oj_guest_resume='),
    );
    expect(firstSession).toBeDefined();
    expect(firstResume).toBeDefined();
    const firstUserId = first.json().id as string;
    createdUserIds.push(firstUserId);
    const storedCredential = await pool.query(
      'SELECT grc.token_hash, grc.revoked_at FROM guest_resume_credentials grc JOIN guest_identities gi ON gi.id=grc.guest_identity_id WHERE gi.user_id=$1',
      [firstUserId],
    );
    expect(storedCredential.rows).toHaveLength(1);
    expect(String(storedCredential.rows[0]!.token_hash)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(String(storedCredential.rows[0]!.token_hash)).not.toBe(
      firstResume!.slice('oj_guest_resume='.length),
    );
    expect(
      await pool.query(
        'SELECT count(*)::int AS count FROM auth_sessions WHERE user_id=$1',
        [firstUserId],
      ),
    ).toMatchObject({ rows: [{ count: 1 }] });
    const logout = await firstApp.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `${firstSession}; ${firstResume}` },
      payload: {},
    });
    expect(logout.statusCode).toBe(204);
    await firstApp.close();

    const restarted = await build();
    const resumed = await restarted.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: firstResume! },
      payload: {},
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ id: firstUserId, resumed: true });
    const rotated = cookiesFrom(resumed.headers['set-cookie']).find((v) =>
      v.startsWith('oj_guest_resume='),
    );
    expect(rotated).toBeDefined();
    const me = await restarted.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: String(resumed.headers['set-cookie']) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: firstUserId, guest: true });
    const repeated = await restarted.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: firstResume! },
      payload: {},
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({ id: firstUserId, resumed: true });
    const revoke = await restarted.inject({
      method: 'DELETE',
      url: '/api/auth/guest/resume',
      headers: { cookie: rotated! },
    });
    expect(revoke.statusCode).toBe(204);
    await restarted.close();
    const row = await pool.query(
      'SELECT count(*)::int AS count FROM guest_resume_credentials grc JOIN guest_identities gi ON gi.id=grc.guest_identity_id WHERE gi.user_id=$1 AND grc.revoked_at IS NULL',
      [firstUserId],
    );
    expect(Number(row.rows[0]?.count)).toBe(0);
  });
});
