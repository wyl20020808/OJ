/* eslint-disable @typescript-eslint/no-explicit-any -- This adapter translates untyped Fastify route payloads at the API boundary. */
import type { FastifyInstance, FastifyRequest } from 'fastify';

type Auth = { userId: string };
type Row = Record<string, any>;
type Query = { rows: Row[]; rowCount?: number | null };
type Client = {
  query(sql: string, values?: unknown[]): Promise<Query>;
  release(): void;
};
type Pool = {
  query(sql: string, values?: unknown[]): Promise<Query>;
  connect(): Promise<Client>;
};
type Limiter = {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
};
type Audit = {
  record(e: {
    actorUserId: string;
    action: string;
    resource: string;
    resourceId?: string;
    outcome: 'allowed' | 'denied';
    requestId: string;
    occurredAt: string;
  }): Promise<void> | void;
};
export type SocialModuleOptions = {
  pool: Pool;
  getAuth(r: FastifyRequest): Promise<Auth | undefined>;
  limiter: Limiter;
  audit?: Audit;
};
const fail = (code: string) => Object.assign(new Error(code), { code });
const cursor = (value: string | undefined) =>
  value
    ? JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    : undefined;
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export async function registerSocialModule(
  app: FastifyInstance,
  o: SocialModuleOptions,
) {
  const auth = (r: FastifyRequest) => o.getAuth(r);
  const check = async (key: string, limit: number) => {
    try {
      if (!(await o.limiter.consume(key, limit, 60)))
        throw fail('RATE_LIMITED');
    } catch (e) {
      if (e instanceof Error && (e as any).code === 'RATE_LIMITED') throw e;
      throw fail('RATE_LIMITED');
    }
  };
  const error = (e: unknown, reply: any, r: FastifyRequest) => {
    const rawCode =
      e instanceof Error ? ((e as any).code ?? e.message) : 'INTERNAL_ERROR';
    const code = rawCode === '23505' ? 'FRIEND_REQUEST_EXISTS' : rawCode;
    const m: Record<string, [number, string]> = {
      UNAUTHENTICATED: [401, 'Authentication required'],
      USER_NOT_FOUND: [404, 'User not found'],
      SELF_FRIEND_REQUEST: [400, 'Cannot request yourself'],
      FRIEND_REQUEST_EXISTS: [409, 'Friend request exists'],
      ALREADY_FRIENDS: [409, 'Already friends'],
      FRIEND_REQUEST_NOT_FOUND: [404, 'Friend request not found'],
      NOT_FRIENDS: [403, 'Users are not friends'],
      CONVERSATION_NOT_FOUND: [404, 'Conversation not found'],
      NOT_CONVERSATION_MEMBER: [403, 'Not a conversation member'],
      MESSAGE_TOO_LONG: [400, 'Invalid message body'],
      RATE_LIMITED: [429, 'Request rate limited'],
      VALIDATION_ERROR: [400, 'Invalid request'],
      NOTIFICATION_NOT_FOUND: [404, 'Notification not found'],
    };
    const [s, msg] = m[code] ?? [500, 'Internal server error'];
    return reply.status(s).send({ code, message: msg, requestId: r.id });
  };
  const need = async (r: FastifyRequest) => {
    const a = await auth(r);
    if (!a) throw fail('UNAUTHENTICATED');
    return a;
  };
  const user = async (id: string) => {
    const x = await o.pool.query(
      "SELECT id,username,display_name,created_at FROM users WHERE id=$1 AND status='active'",
      [id],
    );
    if (!x.rows[0]) throw fail('USER_NOT_FOUND');
    return x.rows[0];
  };
  const friendly = async (a: string, b: string) => {
    const [lo, hi] = pair(a, b);
    return Boolean(
      (
        await o.pool.query(
          'SELECT 1 FROM friendships WHERE user_low_id=$1 AND user_high_id=$2',
          [lo, hi],
        )
      ).rowCount,
    );
  };
  const audit = (a: Auth, action: string, id: string, r: FastifyRequest) =>
    o.audit?.record({
      actorUserId: a.userId,
      action,
      resource: 'social',
      resourceId: id,
      outcome: 'allowed',
      requestId: r.id,
      occurredAt: new Date().toISOString(),
    });
  app.get('/api/users/search', async (r, reply) => {
    try {
      const a = await need(r),
        q = (r.query as any).q;
      if (typeof q !== 'string' || q.trim().length < 2 || q.length > 64)
        throw fail('VALIDATION_ERROR');
      await check(`search:${a.userId}`, 30);
      const x = await o.pool.query(
        "SELECT id,username,display_name FROM users WHERE status='active' AND (username ILIKE $1 OR display_name ILIKE $1) ORDER BY username,id LIMIT 20",
        [`%${q.trim()}%`],
      );
      return {
        items: x.rows.map((v) => ({
          id: String(v.id),
          username: String(v.username),
          displayName: String(v.display_name),
        })),
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/friend-requests', async (r, reply) => {
    const c = await o.pool.connect();
    try {
      const a = await need(r),
        b = r.body as any,
        target = typeof b?.targetUserId === 'string' ? b.targetUserId : '';
      if (!target) throw fail('VALIDATION_ERROR');
      if (target === a.userId) throw fail('SELF_FRIEND_REQUEST');
      await check(`friend:${a.userId}:${target}`, 10);
      await user(target);
      if (await friendly(a.userId, target)) throw fail('ALREADY_FRIENDS');
      await c.query('BEGIN');
      const existing = await c.query(
        "SELECT * FROM friend_requests WHERE state='PENDING' AND ((requester_user_id=$1 AND target_user_id=$2) OR (requester_user_id=$2 AND target_user_id=$1)) FOR UPDATE",
        [a.userId, target],
      );
      if (existing.rows[0]) {
        await c.query('ROLLBACK');
        throw fail('FRIEND_REQUEST_EXISTS');
      }
      const request = (
        await c.query(
          'INSERT INTO friend_requests(requester_user_id,target_user_id,note) VALUES($1,$2,$3) RETURNING *',
          [a.userId, target, typeof b.note === 'string' ? b.note : null],
        )
      ).rows[0]!;
      await c.query(
        "INSERT INTO notifications(user_id,category,title,body,target_route,actor_user_id,entity_type,entity_id) VALUES($1,'FRIEND_REQUEST',$2,$3,'/notifications',$4,'friend_request',$5)",
        [
          target,
          'New friend request',
          'You have a new friend request.',
          a.userId,
          String(request.id),
        ],
      );
      await c.query('COMMIT');
      await audit(a, 'friend-request:create', String(request.id), r);
      return reply
        .status(201)
        .send({ id: String(request.id), state: 'PENDING' });
    } catch (e) {
      await c.query('ROLLBACK');
      return error(e, reply, r);
    } finally {
      c.release();
    }
  });
  app.get('/api/friend-requests', async (r, reply) => {
    try {
      const a = await need(r),
        d = (r.query as any).direction;
      if (d !== 'incoming' && d !== 'outgoing') throw fail('VALIDATION_ERROR');
      const field = d === 'incoming' ? 'target_user_id' : 'requester_user_id';
      const x = await o.pool.query(
        `SELECT fr.*,u.id user_id,u.username,u.display_name FROM friend_requests fr JOIN users u ON u.id=CASE WHEN fr.requester_user_id=$1 THEN fr.target_user_id ELSE fr.requester_user_id END WHERE fr.${field}=$1 ORDER BY fr.created_at DESC,fr.id DESC LIMIT 100`,
        [a.userId],
      );
      return {
        items: x.rows.map((v) => ({
          id: String(v.id),
          direction: d === 'incoming' ? 'RECEIVED' : 'SENT',
          user: {
            id: String(v.user_id),
            username: String(v.username),
            displayName: String(v.display_name),
          },
          note: v.note ?? undefined,
          state: v.state,
        })),
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/friend-requests/:id/:action', async (r, reply) => {
    const c = await o.pool.connect();
    try {
      const a = await need(r),
        p = r.params as any;
      if (!['accept', 'reject'].includes(p.action))
        throw fail('VALIDATION_ERROR');
      await c.query('BEGIN');
      const x = await c.query(
        'SELECT * FROM friend_requests WHERE id=$1 FOR UPDATE',
        [p.id],
      );
      const fr = x.rows[0];
      if (!fr || String(fr.target_user_id) !== a.userId)
        throw fail('FRIEND_REQUEST_NOT_FOUND');
      if (fr.state === 'PENDING') {
        if (p.action === 'accept') {
          const [lo, hi] = pair(String(fr.requester_user_id), a.userId);
          await c.query(
            'INSERT INTO friendships(user_low_id,user_high_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [lo, hi],
          );
          await c.query(
            "UPDATE friend_requests SET state='ACCEPTED',resolved_at=now() WHERE id=$1",
            [fr.id],
          );
          await c.query(
            "INSERT INTO notifications(user_id,category,title,body,target_route,actor_user_id,entity_type,entity_id) VALUES($1,'FRIEND_ACCEPTED',$2,$3,'/messages',$4,'friend_request',$5)",
            [
              fr.requester_user_id,
              'Friend request accepted',
              'Your friend request was accepted.',
              a.userId,
              String(fr.id),
            ],
          );
        } else
          await c.query(
            "UPDATE friend_requests SET state='REJECTED',resolved_at=now() WHERE id=$1",
            [fr.id],
          );
      }
      await c.query('COMMIT');
      await audit(a, `friend-request:${p.action}`, String(fr.id), r);
      return {
        id: String(fr.id),
        state:
          fr.state === 'PENDING'
            ? p.action === 'accept'
              ? 'ACCEPTED'
              : 'REJECTED'
            : fr.state,
      };
    } catch (e) {
      await c.query('ROLLBACK');
      return error(e, reply, r);
    } finally {
      c.release();
    }
  });
  app.delete('/api/friend-requests/:id', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          "UPDATE friend_requests SET state='CANCELLED',resolved_at=now() WHERE id=$1 AND requester_user_id=$2 AND state='PENDING' RETURNING id",
          [(r.params as any).id, a.userId],
        );
      if (!x.rows[0]) throw fail('FRIEND_REQUEST_NOT_FOUND');
      await audit(a, 'friend-request:cancel', String(x.rows[0].id), r);
      return reply.status(204).send();
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.get('/api/friends', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          'SELECT u.id,u.username,u.display_name FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low_id=$1 THEN f.user_high_id ELSE f.user_low_id END WHERE f.user_low_id=$1 OR f.user_high_id=$1 ORDER BY u.username,u.id',
          [a.userId],
        );
      return {
        items: x.rows.map((v) => ({
          id: String(v.id),
          username: String(v.username),
          displayName: String(v.display_name),
        })),
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.delete('/api/friends/:userId', async (r, reply) => {
    try {
      const a = await need(r),
        [lo, hi] = pair(a.userId, (r.params as any).userId),
        x = await o.pool.query(
          'DELETE FROM friendships WHERE user_low_id=$1 AND user_high_id=$2 RETURNING user_low_id',
          [lo, hi],
        );
      if (!x.rows[0]) throw fail('NOT_FRIENDS');
      await audit(a, 'friendship:remove', String((r.params as any).userId), r);
      return reply.status(204).send();
    } catch (e) {
      return error(e, reply, r);
    }
  });
  const member = async (
    id: string,
    a: string,
    db: Pick<Pool, 'query'> = o.pool,
  ) => {
    const x = await db.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',
      [id, a],
    );
    if (!x.rows[0]) throw fail('NOT_CONVERSATION_MEMBER');
  };
  app.post('/api/conversations/direct', async (r, reply) => {
    const c = await o.pool.connect();
    try {
      const a = await need(r),
        target = (r.body as any)?.userId;
      if (typeof target !== 'string' || target === a.userId)
        throw fail('VALIDATION_ERROR');
      await check(`conversation:${a.userId}:${target}`, 20);
      await user(target);
      if (!(await friendly(a.userId, target))) throw fail('NOT_FRIENDS');
      const [lo, hi] = pair(a.userId, target);
      await c.query('BEGIN');
      const conv = (
        await c.query(
          "INSERT INTO conversations(kind,direct_user_low_id,direct_user_high_id) VALUES('DIRECT',$1,$2) ON CONFLICT(direct_user_low_id,direct_user_high_id) DO UPDATE SET id=conversations.id RETURNING *",
          [lo, hi],
        )
      ).rows[0]!;
      await c.query(
        'INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING',
        [conv.id, lo, hi],
      );
      await c.query('COMMIT');
      await audit(a, 'conversation:direct', String(conv.id), r);
      return reply.status(201).send({ id: String(conv.id), kind: 'DIRECT' });
    } catch (e) {
      await c.query('ROLLBACK');
      return error(e, reply, r);
    } finally {
      c.release();
    }
  });
  app.get('/api/conversations', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          'SELECT c.*,u.id peer_id,u.username,u.display_name FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id JOIN users u ON u.id=CASE WHEN c.direct_user_low_id=$1 THEN c.direct_user_high_id ELSE c.direct_user_low_id END WHERE cm.user_id=$1 ORDER BY c.last_message_at DESC NULLS LAST,c.id DESC LIMIT 100',
          [a.userId],
        );
      return {
        items: x.rows.map((v) => ({
          id: String(v.id),
          kind: 'DIRECT',
          peer: {
            id: String(v.peer_id),
            username: String(v.username),
            displayName: String(v.display_name),
          },
          lastMessageAt:
            v.last_message_at && new Date(v.last_message_at).toISOString(),
        })),
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/conversations/:id/messages', async (r, reply) => {
    const c = await o.pool.connect();
    try {
      const a = await need(r),
        id = (r.params as any).id,
        b = r.body as any;
      if (
        !b ||
        typeof b.body !== 'string' ||
        b.body.length < 1 ||
        b.body.length > 4000 ||
        typeof b.clientMessageId !== 'string' ||
        b.clientMessageId.length > 128
      )
        throw fail('MESSAGE_TOO_LONG');
      await check(`message:${a.userId}:${id}`, 60);
      await c.query('BEGIN');
      await member(id, a.userId, c);
      const inserted = await c.query(
        'INSERT INTO messages(conversation_id,sender_user_id,client_message_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,sender_user_id,client_message_id) DO NOTHING RETURNING *',
        [id, a.userId, b.clientMessageId, b.body],
      );
      const message =
        inserted.rows[0] ??
        (
          await c.query(
            'SELECT * FROM messages WHERE conversation_id=$1 AND sender_user_id=$2 AND client_message_id=$3',
            [id, a.userId, b.clientMessageId],
          )
        ).rows[0]!;
      if (inserted.rows[0]) {
        await c.query(
          'UPDATE conversations SET last_message_at=now() WHERE id=$1',
          [id],
        );
        const peers = await c.query(
          'SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2',
          [id, a.userId],
        );
        for (const p of peers.rows)
          await c.query(
            "INSERT INTO notifications(user_id,category,title,body,target_route,actor_user_id,entity_type,entity_id) VALUES($1,'DIRECT_MESSAGE',$2,$3,$4,$5,'message',$6)",
            [
              p.user_id,
              'New message',
              'You have a new message.',
              '/messages',
              a.userId,
              String(message.id),
            ],
          );
      }
      await c.query('COMMIT');
      if (inserted.rows[0])
        await audit(a, 'message:create', String(message.id), r);
      return reply.status(inserted.rows[0] ? 201 : 200).send({
        id: String(message.id),
        conversationId: id,
        senderId: a.userId,
        type: 'TEXT',
        content: String(message.body),
        sentAt: new Date(message.created_at).toISOString(),
        clientCorrelationId: String(message.client_message_id),
      });
    } catch (e) {
      await c.query('ROLLBACK');
      return error(e, reply, r);
    } finally {
      c.release();
    }
  });
  app.get('/api/conversations/:id/messages', async (r, reply) => {
    try {
      const a = await need(r),
        id = (r.params as any).id,
        q = r.query as any,
        limit = Number(q.limit ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw fail('VALIDATION_ERROR');
      await member(id, a.userId);
      const cur = typeof q.cursor === 'string' ? cursor(q.cursor) : undefined;
      const x = await o.pool.query(
        `SELECT * FROM messages WHERE conversation_id=$1 ${cur ? 'AND (created_at,id)<($2,$3)' : ''} ORDER BY created_at DESC,id DESC LIMIT $${cur ? 4 : 2}`,
        cur ? [id, cur.createdAt, cur.id, limit] : [id, limit],
      );
      const items = x.rows.map((v) => ({
        id: String(v.id),
        conversationId: id,
        senderId: String(v.sender_user_id),
        type: 'TEXT',
        content: String(v.body),
        sentAt: new Date(v.created_at).toISOString(),
        clientCorrelationId: String(v.client_message_id),
      }));
      return {
        items,
        nextCursor:
          items.length === limit
            ? encode({ createdAt: items.at(-1)!.sentAt, id: items.at(-1)!.id })
            : undefined,
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/conversations/:id/read', async (r, reply) => {
    try {
      const a = await need(r),
        id = (r.params as any).id,
        b = r.body as any;
      await member(id, a.userId);
      await o.pool.query(
        'UPDATE conversation_members SET last_read_message_id=$3,last_read_at=now() WHERE conversation_id=$1 AND user_id=$2',
        [id, a.userId, typeof b?.messageId === 'string' ? b.messageId : null],
      );
      return reply.status(204).send();
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.get('/api/messages/unread-count', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          'SELECT count(*)::int count FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE cm.user_id=$1 AND m.sender_user_id<>$1 AND (cm.last_read_at IS NULL OR m.created_at>cm.last_read_at)',
          [a.userId],
        );
      return { count: Number(x.rows[0]?.count ?? 0) };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.get('/api/notifications', async (r, reply) => {
    try {
      const a = await need(r),
        q = r.query as any,
        limit = Number(q.limit ?? 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw fail('VALIDATION_ERROR');
      const cur = typeof q.cursor === 'string' ? cursor(q.cursor) : undefined;
      const x = await o.pool.query(
        `SELECT * FROM notifications WHERE user_id=$1 ${cur ? 'AND (created_at,id)<($2,$3)' : ''} ORDER BY created_at DESC,id DESC LIMIT $${cur ? 4 : 2}`,
        cur ? [a.userId, cur.createdAt, cur.id, limit] : [a.userId, limit],
      );
      const items = x.rows.map((v) => ({
        id: String(v.id),
        category: v.category,
        title: v.title,
        body: v.body,
        targetRoute: v.target_route ?? undefined,
        createdAt: new Date(v.created_at).toISOString(),
        read: Boolean(v.read_at),
      }));
      return {
        items,
        nextCursor:
          items.length === limit
            ? encode({
                createdAt: items.at(-1)!.createdAt,
                id: items.at(-1)!.id,
              })
            : undefined,
      };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.get('/api/notifications/unread-count', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          'SELECT count(*)::int count FROM notifications WHERE user_id=$1 AND read_at IS NULL',
          [a.userId],
        );
      return { count: Number(x.rows[0]?.count ?? 0) };
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/notifications/:id/read', async (r, reply) => {
    try {
      const a = await need(r),
        x = await o.pool.query(
          'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',
          [(r.params as any).id, a.userId],
        );
      if (!x.rows[0]) throw fail('NOTIFICATION_NOT_FOUND');
      return reply.status(204).send();
    } catch (e) {
      return error(e, reply, r);
    }
  });
  app.post('/api/notifications/read-all', async (r, reply) => {
    try {
      const a = await need(r);
      await o.pool.query(
        'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1',
        [a.userId],
      );
      return reply.status(204).send();
    } catch (e) {
      return error(e, reply, r);
    }
  });
}
