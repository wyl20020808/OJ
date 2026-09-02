import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type Auth = { userId: string; strength?: string };
type Row = Record<string, unknown>;
type Query = { rows: Row[]; rowCount?: number | null };
type Pool = { query(sql: string, values?: unknown[]): Promise<Query> };

export type ProfileModuleOptions = {
  pool: Pool;
  getAuth(request: FastifyRequest): Promise<Auth | undefined>;
};

const unavailable = (reason: string) => ({ available: false, reason });
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const decode = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return parsed &&
      typeof parsed.createdAt === 'string' &&
      typeof parsed.id === 'string'
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};
const page = (query: Record<string, unknown>) => {
  const limit = Number(query.limit ?? 20);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
};

export async function registerProfileModule(
  app: FastifyInstance,
  options: ProfileModuleOptions,
) {
  const error = (
    reply: FastifyReply,
    request: FastifyRequest,
    status: number,
    code: string,
    message: string,
  ) => reply.status(status).send({ code, message, requestId: request.id });
  const passwordUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await options.getAuth(request);
    if (!auth) {
      error(reply, request, 401, 'UNAUTHENTICATED', 'Authentication required');
      return undefined;
    }
    if (auth.strength !== 'password') {
      error(
        reply,
        request,
        403,
        'GUEST_ACCOUNT_REQUIRES_UPGRADE',
        'Upgrade the Guest account to use this profile capability',
      );
      return undefined;
    }
    return auth;
  };
  const profileCapabilities = (auth?: Auth) => ({
    contractVersion: 'profile-capabilities-v1',
    favorites:
      auth?.strength === 'password'
        ? { available: true }
        : unavailable(
            auth ? 'GUEST_ACCOUNT_REQUIRES_UPGRADE' : 'AUTHENTICATION_REQUIRED',
          ),
    myContests:
      auth?.strength === 'password'
        ? { available: true }
        : unavailable(
            auth ? 'GUEST_ACCOUNT_REQUIRES_UPGRADE' : 'AUTHENTICATION_REQUIRED',
          ),
    myProblems:
      auth?.strength === 'password'
        ? { available: true }
        : unavailable(
            auth ? 'GUEST_ACCOUNT_REQUIRES_UPGRADE' : 'AUTHENTICATION_REQUIRED',
          ),
    activity: unavailable('NO_AUTHORITATIVE_PRODUCT_ACTIVITY_SOURCE'),
    heatmap: unavailable(
      'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
    ),
    teams: unavailable('PRODUCT_DOMAIN_NOT_IMPLEMENTED'),
    homework: unavailable('PRODUCT_DOMAIN_NOT_IMPLEMENTED'),
    wrongbook: unavailable(
      'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
    ),
  });
  app.get('/api/profile/capabilities', async (request, reply) =>
    reply.send(profileCapabilities(await options.getAuth(request))),
  );
  app.get('/api/profiles/:username', async (request, reply) => {
    const username = (request.params as { username?: string }).username;
    if (!username || username.length > 32)
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid username');
    const result = await options.pool.query(
      "SELECT username,display_name,created_at FROM users WHERE username=$1 AND status='active'",
      [username.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user)
      return error(reply, request, 404, 'NOT_FOUND', 'Profile not found');
    return reply.send({
      username: String(user.username),
      displayName: String(user.display_name),
      createdAt: new Date(String(user.created_at)).toISOString(),
      capabilities: profileCapabilities(),
    });
  });
  app.get('/api/profile/favorites', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const query = request.query as Record<string, unknown>,
      limit = page(query),
      cursor = decode(query.cursor);
    if (!limit || (query.cursor !== undefined && !cursor))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    const result = await options.pool.query(
      `SELECT p.id,p.slug,p.title,p.time_limit_ms,p.memory_limit_bytes,pf.created_at
       FROM problem_favorites pf JOIN problems p ON p.id=pf.problem_id
       WHERE pf.user_id=$1 AND p.visibility='public' AND p.status='published'
       ${cursor ? 'AND (pf.created_at,pf.problem_id)<($2,$3)' : ''}
       ORDER BY pf.created_at DESC,pf.problem_id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [auth.userId, cursor.createdAt, cursor.id, limit]
        : [auth.userId, limit],
    );
    const count = await options.pool.query(
      "SELECT count(*)::int total FROM problem_favorites pf JOIN problems p ON p.id=pf.problem_id WHERE pf.user_id=$1 AND p.visibility='public' AND p.status='published'",
      [auth.userId],
    );
    const items = result.rows.map((row) => ({
      problemId: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      timeLimitMs: Number(row.time_limit_ms),
      memoryLimitBytes: Number(row.memory_limit_bytes),
      favoritedAt: new Date(String(row.created_at)).toISOString(),
    }));
    return reply.send({
      items,
      page: {
        limit,
        total: Number(count.rows[0]?.total ?? 0),
        ...(items.length === limit
          ? {
              nextCursor: encode({
                createdAt: items.at(-1)!.favoritedAt,
                id: items.at(-1)!.problemId,
              }),
            }
          : {}),
      },
    });
  });
  app.post('/api/profile/favorites/:problemId', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const problemId = (request.params as { problemId?: string }).problemId;
    if (!problemId)
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid problem');
    const problem = await options.pool.query(
      "SELECT id FROM problems WHERE id=$1 AND visibility='public' AND status='published'",
      [problemId],
    );
    if (!problem.rows[0])
      return error(reply, request, 404, 'NOT_FOUND', 'Problem not found');
    const inserted = await options.pool.query(
      'INSERT INTO problem_favorites(user_id,problem_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING created_at',
      [auth.userId, problemId],
    );
    return reply.status(inserted.rows[0] ? 201 : 200).send({
      problemId,
      favorited: true,
      createdAt: inserted.rows[0]
        ? new Date(String(inserted.rows[0].created_at)).toISOString()
        : undefined,
    });
  });
  app.delete('/api/profile/favorites/:problemId', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const problemId = (request.params as { problemId?: string }).problemId;
    if (!problemId)
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid problem');
    await options.pool.query(
      'DELETE FROM problem_favorites WHERE user_id=$1 AND problem_id=$2',
      [auth.userId, problemId],
    );
    return reply.status(204).send();
  });
  app.get('/api/profile/contests', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const query = request.query as Record<string, unknown>,
      limit = page(query),
      cursor = decode(query.cursor);
    const kind = query.kind;
    if (
      !limit ||
      (query.cursor !== undefined && !cursor) ||
      (kind !== undefined &&
        !['CREATED', 'MANAGED', 'REGISTERED'].includes(String(kind)))
    )
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid projection query',
      );
    const result = await options.pool.query(
      `WITH mine AS (
         SELECT c.*, 'CREATED' AS relationship, c.created_at AS relationship_at FROM contests c WHERE c.owner_user_id=$1
         UNION ALL
         SELECT c.*, 'MANAGED' AS relationship, cr.created_at AS relationship_at FROM contest_roles cr JOIN contests c ON c.id=cr.contest_id WHERE cr.user_id=$1 AND cr.role='MANAGER'
         UNION ALL
         SELECT c.*, 'REGISTERED' AS relationship, cr.registered_at AS relationship_at FROM contest_registrations cr JOIN contests c ON c.id=cr.contest_id WHERE cr.user_id=$1 AND cr.status='ACTIVE'
       ) SELECT * FROM mine WHERE ($2::text IS NULL OR relationship=$2)
       ${cursor ? 'AND (relationship_at,id)<($3,$4)' : ''}
       ORDER BY relationship_at DESC,id DESC LIMIT $${cursor ? 5 : 3}`,
      cursor
        ? [auth.userId, kind ?? null, cursor.createdAt, cursor.id, limit]
        : [auth.userId, kind ?? null, limit],
    );
    const items = result.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      visibility: String(row.visibility),
      lifecycle: String(row.lifecycle),
      startsAt: new Date(String(row.starts_at)).toISOString(),
      endsAt: new Date(String(row.ends_at)).toISOString(),
      relationship: String(row.relationship),
      relationshipAt: new Date(String(row.relationship_at)).toISOString(),
    }));
    return reply.send({
      items,
      page: {
        limit,
        ...(items.length === limit
          ? {
              nextCursor: encode({
                createdAt: items.at(-1)!.relationshipAt,
                id: items.at(-1)!.id,
              }),
            }
          : {}),
      },
    });
  });
  app.get('/api/profile/problems', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const query = request.query as Record<string, unknown>,
      limit = page(query),
      cursor = decode(query.cursor);
    if (!limit || (query.cursor !== undefined && !cursor))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    const result = await options.pool.query(
      `SELECT id,slug,title,status,visibility,created_at,updated_at FROM problems WHERE author_id=$1
       ${cursor ? 'AND (created_at,id)<($2,$3)' : ''} ORDER BY created_at DESC,id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [auth.userId, cursor.createdAt, cursor.id, limit]
        : [auth.userId, limit],
    );
    const count = await options.pool.query(
      'SELECT count(*)::int total FROM problems WHERE author_id=$1',
      [auth.userId],
    );
    const items = result.rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      status: String(row.status),
      visibility: String(row.visibility),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    }));
    return reply.send({
      items,
      page: {
        limit,
        total: Number(count.rows[0]?.total ?? 0),
        ...(items.length === limit
          ? {
              nextCursor: encode({
                createdAt: items.at(-1)!.createdAt,
                id: items.at(-1)!.id,
              }),
            }
          : {}),
      },
    });
  });
}
