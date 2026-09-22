import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { createDatabase } from '../../packages/database/src/index.js';

const config = loadConfig();
const pool = createDatabase({ url: config.databaseUrl }).pool;
const suffix = randomUUID().slice(0, 8);
const userA = `compose-a-${suffix}`;
const userB = `compose-b-${suffix}`;
const userAEmail = `${userA}@example.test`;
const userBEmail = `${userB}@example.test`;
const problemId = randomUUID();
let guestIdForCleanup: string | undefined;

const cookies = (value: unknown) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map(String)
    .map((entry) => entry.split(';', 1)[0] ?? '');

const cookie = (response: { headers: Record<string, unknown> }) =>
  cookies(response.headers['set-cookie']).join('; ');

beforeAll(async () => {
  await pool.query(
    "INSERT INTO problems(id,slug,title,statement,input_description,output_description,constraints,time_limit_ms,memory_limit_bytes,visibility,status) VALUES($1,$2,'Composed fixture','s','i','o','c',1000,1048576,'public','published')",
    [problemId, `composed-${suffix}`],
  );
});

afterAll(async () => {
  await pool.query(
    `DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR actor_user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))`,
    [[userA, userB]],
  );
  await pool.query(
    `DELETE FROM messages WHERE sender_user_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR conversation_id IN (SELECT id FROM conversations WHERE direct_user_low_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR direct_user_high_id IN (SELECT id FROM users WHERE username=ANY($1::text[])))`,
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM conversation_members WHERE user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM conversations WHERE direct_user_low_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR direct_user_high_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM friend_requests WHERE requester_user_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR target_user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM friendships WHERE user_low_id IN (SELECT id FROM users WHERE username=ANY($1::text[])) OR user_high_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM contest_registrations WHERE user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM contest_roles WHERE user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query(
    'DELETE FROM contests WHERE owner_user_id IN (SELECT id FROM users WHERE username=ANY($1::text[]))',
    [[userA, userB]],
  );
  await pool.query('DELETE FROM users WHERE username=ANY($1::text[])', [
    [userA, userB],
  ]);
  if (guestIdForCleanup)
    await pool.query('DELETE FROM users WHERE id=$1', [guestIdForCleanup]);
  await pool.query('DELETE FROM problems WHERE id=$1', [problemId]);
  await pool.end();
});

describe('product backend central runtime composition', () => {
  it('composes Auth V2, Guest, Contest, Social, Messaging, and Notifications against real dependencies', async () => {
    const app = await buildApp({
      logger: false,
      withInfrastructure: true,
      config,
    });
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).json()).toEqual({
      status: 'ok',
      dependencies: { postgres: 'ok', redis: 'ok', storage: 'ok' },
    });

    const capabilities = await app.inject('/api/auth/capabilities');
    expect(capabilities.json()).toMatchObject({
      guestLogin: { available: true },
    });
    const methods = await app.inject('/api/auth/methods');
    expect(methods.json()).toMatchObject({
      guestLogin: { available: true },
      providers: {
        google: 'not_configured',
        github: 'not_configured',
        qq: 'not_configured',
        wechat: 'not_configured',
      },
    });

    for (const [username, email] of [
      [userA, userAEmail],
      [userB, userBEmail],
    ]) {
      const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username,
          email,
          displayName: username,
          password: 'correct-password',
        },
      });
      expect(registered.statusCode).toBe(201);
    }
    const loginA = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: userAEmail, password: 'correct-password' },
    });
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identity: userBEmail, password: 'correct-password' },
    });
    const aCookie = cookie(loginA);
    const bCookie = cookie(loginB);
    expect(loginA.statusCode).toBe(200);
    expect(loginB.statusCode).toBe(200);

    const firstGuest = await app.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      payload: {},
    });
    expect(firstGuest.statusCode).toBe(200);
    const guestId = firstGuest.json().id as string;
    guestIdForCleanup = guestId;
    const guestResume = cookies(firstGuest.headers['set-cookie']).find(
      (value) => value.startsWith('oj_guest_resume='),
    )!;
    expect(firstGuest.json()).toMatchObject({ guest: true, resumed: false });
    const guestSession = cookies(firstGuest.headers['set-cookie']).find(
      (value) => value.startsWith('oj_session='),
    )!;
    expect(
      await pool.query(
        'SELECT count(*)::int AS count FROM auth_sessions WHERE user_id=$1',
        [guestId],
      ),
    ).toMatchObject({ rows: [{ count: 1 }] });
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `${guestSession}; ${guestResume}` },
      payload: {},
    });
    expect(logout.statusCode).toBe(204);
    const resumed = await app.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: guestResume },
      payload: {},
    });
    expect(resumed.json()).toMatchObject({ id: guestId, resumed: true });
    const resumedGuestSession = cookies(resumed.headers['set-cookie']).find(
      (value) => value.startsWith('oj_session='),
    )!;
    const repeatedResume = await app.inject({
      method: 'POST',
      url: '/api/auth/guest/continue',
      headers: { cookie: guestResume },
      payload: {},
    });
    expect(repeatedResume.statusCode).toBe(200);
    expect(repeatedResume.json()).toMatchObject({ id: guestId, resumed: true });

    const contest = await app.inject({
      method: 'POST',
      url: '/api/contests',
      headers: { cookie: aCookie },
      payload: {
        title: `Composed contest ${suffix}`,
        visibility: 'PUBLIC',
        startsAt: '2099-01-01T00:00:00.000Z',
        endsAt: '2099-01-01T01:00:00.000Z',
      },
    });
    expect(contest.statusCode).toBe(201);
    const contestId = contest.json().id as string;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/contests/${contestId}/problems`,
          headers: { cookie: aCookie },
          payload: { problems: [{ problemId, label: 'A' }] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/contests/${contestId}/publish`,
          headers: { cookie: aCookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/contests/${contestId}`,
          headers: { cookie: bCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/contests/home-summary',
          headers: { cookie: bCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject('/api/contests')).json().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: contestId })]),
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/contests/${contestId}/register`,
          headers: { cookie: bCookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/contests/${contestId}/standings`,
          headers: { cookie: bCookie },
        })
      ).json(),
    ).toMatchObject({
      available: false,
      reason: 'SCORING_ENGINE_NOT_INTEGRATED',
    });

    const search = await app.inject({
      method: 'GET',
      url: `/api/users/search?q=${userB.slice(0, 12)}`,
      headers: { cookie: aCookie },
    });
    const userBId = search.json().items[0].id as string;
    const userAId = loginA.json().id as string;
    await pool.query('UPDATE problems SET author_id=$2 WHERE id=$1', [
      problemId,
      userAId,
    ]);
    expect(
      (await app.inject('/api/profile/capabilities')).json(),
    ).toMatchObject({
      favorites: { available: false, reason: 'AUTHENTICATION_REQUIRED' },
      heatmap: { available: true },
      wrongbook: {
        available: false,
        reason: 'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
      },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/capabilities',
          headers: { cookie: aCookie },
        })
      ).json(),
    ).toMatchObject({
      favorites: { available: true },
      myContests: { available: true },
      myProblems: { available: true },
      activity: { available: true },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profile/favorites/${problemId}`,
          headers: { cookie: aCookie },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profile/favorites/${problemId}`,
          headers: { cookie: aCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/favorites',
          headers: { cookie: aCookie },
        })
      ).json().items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ problemId })]));
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/profile/favorites/${problemId}`,
          headers: { cookie: aCookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/profile/favorites/${problemId}`,
          headers: { cookie: aCookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profile/favorites/${problemId}`,
          headers: { cookie: aCookie },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/favorites',
          headers: { cookie: bCookie },
        })
      ).json().items,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/favorites',
          headers: { cookie: resumedGuestSession },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/profiles/${userA}`,
        })
      ).json(),
    ).toMatchObject({ username: userA, displayName: userA });
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${userA}` })).body,
    ).not.toContain(userAEmail);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/contests?kind=CREATED',
          headers: { cookie: aCookie },
        })
      ).json().items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: contestId })]),
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/contests?kind=REGISTERED',
          headers: { cookie: bCookie },
        })
      ).json().items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: contestId })]),
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/profile/problems',
          headers: { cookie: aCookie },
        })
      ).json().items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: problemId })]),
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/contests/${contestId}/participants`,
          headers: { cookie: aCookie },
        })
      ).json().items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: userBId })]),
    );
    const request = await app.inject({
      method: 'POST',
      url: '/api/friend-requests',
      headers: { cookie: aCookie },
      payload: { targetUserId: userBId },
    });
    expect(request.statusCode).toBe(201);
    const friendRequestId = request.json().id as string;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/notifications/unread-count',
          headers: { cookie: bCookie },
        })
      ).json(),
    ).toMatchObject({ count: 1 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/friend-requests/${friendRequestId}/accept`,
          headers: { cookie: bCookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    const conversation = await app.inject({
      method: 'POST',
      url: '/api/conversations/direct',
      headers: { cookie: aCookie },
      payload: { userId: userBId },
    });
    const conversationId = conversation.json().id as string;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/conversations/direct',
          headers: { cookie: aCookie },
          payload: { userId: userBId },
        })
      ).json().id,
    ).toBe(conversationId);
    const message = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conversationId}/messages`,
      headers: { cookie: aCookie },
      payload: { body: 'composed real message', clientMessageId: randomUUID() },
    });
    expect(message.statusCode).toBe(201);
    const messageId = message.json().id as string;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/messages/unread-count',
          headers: { cookie: bCookie },
        })
      ).json(),
    ).toMatchObject({ count: 1 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/conversations/${conversationId}/read`,
          headers: { cookie: bCookie },
          payload: { messageId },
        })
      ).statusCode,
    ).toBe(204);
    const notifications = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: bCookie },
    });
    expect(notifications.statusCode).toBe(200);
    const notificationId = notifications.json().items[0]?.id as string;
    expect(notificationId).toBeTruthy();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/notifications/${notificationId}/read`,
          headers: { cookie: bCookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(204);
    await app.close();

    const restarted = await buildApp({
      logger: false,
      withInfrastructure: true,
      config,
    });
    expect(
      (
        await restarted.inject({
          method: 'POST',
          url: '/api/auth/guest/continue',
          headers: { cookie: guestResume },
          payload: {},
        })
      ).json(),
    ).toMatchObject({ id: guestId, resumed: true });
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: `/api/conversations/${conversationId}/messages`,
          headers: { cookie: bCookie },
        })
      ).json().items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: messageId })]),
    );
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: '/api/profile/favorites',
          headers: { cookie: aCookie },
        })
      ).json().items,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ problemId })]));
    expect(
      (
        await restarted.inject({
          method: 'GET',
          url: '/api/profile/capabilities',
          headers: { cookie: aCookie },
        })
      ).json(),
    ).toMatchObject({ favorites: { available: true } });
    await restarted.close();
  });
});
