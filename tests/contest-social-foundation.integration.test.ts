import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  registerContestModule,
  type ContestModuleOptions,
} from '../apps/api/src/modules/contest/index.js';
import { RedisFixedWindowLimiter } from '../apps/api/src/modules/social/rate-limiter.js';
import { registerSocialModule } from '../apps/api/src/modules/social/index.js';
import { createDatabase } from '../packages/database/src/index.js';

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
const prefix = `test:contest-social:${randomUUID()}`;
const userA = randomUUID();
const userB = randomUUID();
const userC = randomUUID();
const fixtureProblem = `contest-fixture-${randomUUID()}`;

const auth = async (request: { headers: Record<string, unknown> }) => {
  const value = request.headers['x-user-id'];
  return typeof value === 'string' ? { userId: value } : undefined;
};

beforeAll(async () => {
  for (const name of [
    '0007_contest_foundation.sql',
    '0008_social_messaging_foundation.sql',
    '0009_notifications_foundation.sql',
  ])
    await pool.query(
      await readFile(`packages/database/migrations/${name}`, 'utf8'),
    );
  await redis.connect();
  await pool.query(
    "INSERT INTO users(id,username,email,display_name,status) VALUES($1,$2,$3,$4,'active'),($5,$6,$7,$8,'active'),($9,$10,$11,$12,'active')",
    [
      userA,
      `contest-a-${userA.slice(0, 8)}`,
      `contest-a-${userA}@example.test`,
      'Contest A',
      userB,
      `contest-b-${userB.slice(0, 8)}`,
      `contest-b-${userB}@example.test`,
      'Contest B',
      userC,
      `contest-c-${userC.slice(0, 8)}`,
      `contest-c-${userC}@example.test`,
      'Contest C',
    ],
  );
  await pool.query(
    "INSERT INTO problems(id,slug,title,statement,input_description,output_description,constraints,time_limit_ms,memory_limit_bytes,visibility,status) VALUES($1,$2,'Fixture problem','s','i','o','c',1000,1048576,'public','published')",
    [fixtureProblem, `fixture-${fixtureProblem}`],
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM contests WHERE owner_user_id=ANY($1::uuid[])', [
    [userA, userB, userC],
  ]);
  await pool.query(
    'DELETE FROM conversations WHERE direct_user_low_id=ANY($1::uuid[]) OR direct_user_high_id=ANY($1::uuid[])',
    [[userA, userB, userC]],
  );
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
    [userA, userB, userC],
  ]);
  await pool.query('DELETE FROM problems WHERE id=$1', [fixtureProblem]);
  await redis.quit();
  await pool.end();
});

describe('contest and messaging foundation against PostgreSQL and Redis', () => {
  it('creates a contest atomically, preserves private access authorization, and reports unavailable standings', async () => {
    const app = Fastify();
    const options: ContestModuleOptions = {
      pool,
      getAuth: auth,
      problemExists: async (id) => id === fixtureProblem,
    };
    await registerContestModule(app, options);
    const create = await app.inject({
      method: 'POST',
      url: '/api/contests',
      headers: { 'x-user-id': userA },
      payload: {
        title: 'Private fixture',
        visibility: 'PRIVATE',
        privatePassword: 'fixture-code',
        startsAt: '2099-01-01T00:00:00.000Z',
        endsAt: '2099-01-01T01:00:00.000Z',
      },
    });
    expect(create.statusCode).toBe(201);
    const contestId = create.json().id as string;
    expect(
      await pool.query(
        "SELECT 1 FROM contest_roles WHERE contest_id=$1 AND user_id=$2 AND role='OWNER'",
        [contestId, userA],
      ),
    ).toMatchObject({ rowCount: 1 });
    const invisible = await app.inject({
      method: 'GET',
      url: `/api/contests/${contestId}`,
      headers: { 'x-user-id': userB },
    });
    expect(invisible.statusCode).toBe(403);
    await app.inject({
      method: 'PUT',
      url: `/api/contests/${contestId}/problems`,
      headers: { 'x-user-id': userA },
      payload: { problems: [{ problemId: fixtureProblem, label: 'A' }] },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/contests/${contestId}/publish`,
          headers: { 'x-user-id': userA },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/contests/${contestId}/register`,
          headers: { 'x-user-id': userB },
          payload: { accessCode: 'fixture-code' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/contests/${contestId}`,
          headers: { 'x-user-id': userB },
        })
      ).statusCode,
    ).toBe(200);
    const restarted = Fastify();
    await registerContestModule(restarted, options);
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: `/api/contests/${contestId}`,
          headers: { 'x-user-id': userB },
        })
      ).statusCode,
    ).toBe(200);
    await restarted.close();
    const standings = await app.inject({
      method: 'GET',
      url: `/api/contests/${contestId}/standings`,
      headers: { 'x-user-id': userB },
    });
    expect(standings.statusCode).toBe(503);
    expect(standings.json()).toMatchObject({
      available: false,
      reason: 'SCORING_ENGINE_NOT_INTEGRATED',
    });
    await app.close();
  });

  it('enforces canonical friendship, direct message idempotency, notifications, and real Redis limits', async () => {
    const app = Fastify();
    await registerSocialModule(app, {
      pool,
      getAuth: auth,
      limiter: new RedisFixedWindowLimiter(redis, prefix),
    });
    const request = await app.inject({
      method: 'POST',
      url: '/api/friend-requests',
      headers: { 'x-user-id': userA },
      payload: { targetUserId: userB },
    });
    expect(request.statusCode).toBe(201);
    const requestId = request.json().id as string;
    const accept = await app.inject({
      method: 'POST',
      url: `/api/friend-requests/${requestId}/accept`,
      headers: { 'x-user-id': userB },
    });
    expect(accept.statusCode).toBe(200);
    const acceptReplay = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/friend-requests/${requestId}/accept`,
          headers: { 'x-user-id': userB },
        }),
      ),
    );
    expect(acceptReplay.map((response) => response.statusCode)).toEqual([
      200, 200,
    ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/friend-requests',
          headers: { 'x-user-id': userB },
          payload: { targetUserId: userA },
        })
      ).statusCode,
    ).toBe(409);
    const conversation = await app.inject({
      method: 'POST',
      url: '/api/conversations/direct',
      headers: { 'x-user-id': userA },
      payload: { userId: userB },
    });
    expect(conversation.statusCode).toBe(201);
    const conversationId = conversation.json().id as string;
    const concurrentConversation = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/conversations/direct',
          headers: { 'x-user-id': userA },
          payload: { userId: userB },
        }),
      ),
    );
    expect(
      concurrentConversation.map((response) => response.statusCode),
    ).toEqual([201, 201]);
    expect(
      new Set(concurrentConversation.map((response) => response.json().id)),
    ).toEqual(new Set([conversationId]));
    const message = {
      body: 'trusted fixture message',
      clientMessageId: `client-${randomUUID()}`,
    };
    const sent = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: { 'x-user-id': userA },
      payload: message,
    });
    expect(sent.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: { 'x-user-id': userA },
      payload: message,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().id).toBe(sent.json().id);
    const duplicateMessage = {
      body: 'same-key concurrent fixture message',
      clientMessageId: `same-key-${randomUUID()}`,
    };
    const concurrentDuplicate = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/conversations/${conversationId}/messages`,
          headers: { 'x-user-id': userA },
          payload: duplicateMessage,
        }),
      ),
    );
    expect(
      concurrentDuplicate.map((response) => response.statusCode).sort(),
    ).toEqual([200, 201]);
    expect(
      new Set(concurrentDuplicate.map((response) => response.json().id)).size,
    ).toBe(1);
    const concurrent = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/conversations/${conversationId}/messages`,
          headers: { 'x-user-id': userA },
          payload: {
            body: 'concurrent trusted fixture message',
            clientMessageId: `concurrent-${randomUUID()}`,
          },
        }),
      ),
    );
    expect(concurrent.map((response) => response.statusCode)).toEqual([
      201, 201,
    ]);
    expect(
      await pool.query(
        "SELECT count(*)::int count FROM notifications WHERE user_id=$1 AND category='DIRECT_MESSAGE'",
        [userB],
      ),
    ).toMatchObject({ rows: [{ count: 4 }] });
    const conversations = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { 'x-user-id': userB },
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json().items[0]).toMatchObject({ unreadCount: 4 });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/notifications/unread-count',
          headers: { 'x-user-id': userB },
        })
      ).json(),
    ).toMatchObject({ count: 5 });
    const limiter = new RedisFixedWindowLimiter(redis, `${prefix}:direct`);
    expect(await limiter.consume('key', 1, 60)).toBe(true);
    expect(await limiter.consume('key', 1, 60)).toBe(false);
    await app.close();
  });

  it('fails closed when the rate-limit dependency is unavailable', async () => {
    const app = Fastify();
    await registerSocialModule(app, {
      pool,
      getAuth: auth,
      limiter: { consume: async () => Promise.reject(new Error('redis down')) },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/search?q=Contest',
      headers: { 'x-user-id': userA },
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });
});
