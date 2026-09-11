import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { TeamService } from '../team/service.js';

type Auth = { userId: string; strength?: string };
type Row = Record<string, unknown>;
type Query = { rows: Row[]; rowCount?: number | null };
type Pool = { query(sql: string, values?: unknown[]): Promise<Query> };

export type ProfileModuleOptions = {
  pool: Pool;
  getAuth(request: FastifyRequest): Promise<Auth | undefined>;
  teamService?: TeamService;
  storage?: { client: S3Client; bucket: string };
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
  if (!app.hasContentTypeParser('multipart/form-data')) {
    app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (_request, body, done) => done(null, body));
  }
  const error = (
    reply: FastifyReply,
    request: FastifyRequest,
    status: number,
    code: string,
    message: string,
  ) => reply.status(status).send({ code, message, requestId: request.id });
  const csrf = (request: FastifyRequest) => {
    const token = request.headers['x-csrf-token'];
    return typeof token === 'string' && request.headers.cookie?.split(';').some((item) => item.trim() === `oj_csrf=${token}`);
  };
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
  const profileCapabilities = (auth?: Auth, isSelf = false) => ({
    contractVersion: 'profile-capabilities-v1',
    favorites:
      isSelf && auth?.strength === 'password'
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
      !isSelf || auth?.strength === 'password'
        ? { available: true }
        : unavailable(
            auth ? 'GUEST_ACCOUNT_REQUIRES_UPGRADE' : 'AUTHENTICATION_REQUIRED',
          ),
    activity: { available: true },
    heatmap: { available: true },
    teams: { available: Boolean(options.teamService) },
    homework: unavailable('PRODUCT_DOMAIN_NOT_IMPLEMENTED'),
    wrongbook: unavailable(
      'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
    ),
  });
  app.get('/api/profile/capabilities', async (request, reply) =>
    reply.send(profileCapabilities(await options.getAuth(request), true)),
  );
  const profileTarget = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const username = (request.params as { username?: string }).username;
    if (!username || username.length > 32) {
      error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid username');
      return undefined;
    }
    const result = await options.pool.query(
      "SELECT id,username,display_name,created_at FROM users WHERE username=$1 AND status='active'",
      [username.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user) {
      error(reply, request, 404, 'NOT_FOUND', 'Profile not found');
      return undefined;
    }
    const auth = await options.getAuth(request);
    const isSelf = auth?.userId === String(user.id);
    const metadata = await options.pool.query(
      'SELECT display_name,headline,bio,location,organization,website,github,avatar_object_key,background_object_key FROM user_profiles WHERE user_id=$1',
      [String(user.id)],
    );
    return { auth, isSelf, user, metadata: metadata.rows[0] ?? {} };
  };
  const publicProblemFilter = (isSelf: boolean) =>
    isSelf
      ? " AND p.deleted_at IS NULL"
      : " AND p.deleted_at IS NULL AND p.visibility='public' AND p.status='published'";
  app.get('/api/profiles/:username', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const { auth, isSelf, user } = target;
    const meta = target.metadata;
    const teams = options.teamService
      ? await options.teamService.profileTeams(String(user.id), auth?.userId)
      : [];
    return reply.send({
      username: String(user.username),
      displayName: String(meta.display_name ?? user.display_name),
      ...(meta.headline ? { headline: String(meta.headline) } : {}),
      ...(meta.bio ? { bio: String(meta.bio) } : {}),
      ...(meta.location ? { location: String(meta.location) } : {}),
      ...(meta.organization ? { organization: String(meta.organization) } : {}),
      ...(meta.website ? { website: String(meta.website) } : {}),
      ...(meta.github ? { github: String(meta.github) } : {}),
      ...(meta.avatar_object_key ? { avatarUrl: `/api/profile/media/${String(meta.avatar_object_key).split('/').map(encodeURIComponent).join('/')}` } : {}),
      ...(meta.background_object_key ? { backgroundUrl: `/api/profile/media/${String(meta.background_object_key).split('/').map(encodeURIComponent).join('/')}` } : {}),
      createdAt: new Date(String(user.created_at)).toISOString(),
      capabilities: profileCapabilities(auth, isSelf),
      isSelf,
      canCreateProblems: isSelf && auth?.strength === 'password',
      teams: teams.map((team) => ({
        name: team.name,
        slug: team.slug,
        role: team.role,
        visibility: team.visibility,
        ...(team.description ? { description: team.description } : {}),
      })),
    });
  });
  app.get('/api/profile/me', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    const result = await options.pool.query(
      `SELECT u.username,u.display_name,up.headline,up.bio,up.location,up.organization,up.website,up.github,up.avatar_object_key,up.background_object_key
       FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id WHERE u.id=$1 AND u.status='active'`,
      [auth.userId],
    );
    const row = result.rows[0];
    if (!row) return error(reply, request, 404, 'NOT_FOUND', 'Profile not found');
    return reply.send({
      username: String(row.username),
      displayName: String(row.display_name),
      headline: row.headline ? String(row.headline) : '',
      bio: row.bio ? String(row.bio) : '',
      location: row.location ? String(row.location) : '',
      organization: row.organization ? String(row.organization) : '',
      website: row.website ? String(row.website) : '',
      github: row.github ? String(row.github) : '',
      avatarUrl: row.avatar_object_key ? `/api/profile/media/${String(row.avatar_object_key).split('/').map(encodeURIComponent).join('/')}` : '',
      backgroundUrl: row.background_object_key ? `/api/profile/media/${String(row.background_object_key).split('/').map(encodeURIComponent).join('/')}` : '',
    });
  });
  app.patch('/api/profile/me', async (request, reply) => {
    const auth = await passwordUser(request, reply);
    if (!auth) return;
    if (!csrf(request)) return error(reply, request, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fields = ['displayName', 'headline', 'bio', 'location', 'organization', 'website', 'github'];
    if (Object.keys(body).some((key) => !fields.includes(key)))
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid profile data');
    const value = (key: string, max: number) => {
      const v = body[key] === undefined ? '' : body[key];
      if (typeof v !== 'string' || v.length > max) return null;
      return v.trim();
    };
    const displayName = value('displayName', 60);
    const headline = value('headline', 100);
    const bio = value('bio', 800);
    const location = value('location', 100);
    const organization = value('organization', 120);
    const website = value('website', 300);
    const github = value('github', 100);
    const details: Record<string, string> = {};
    if (!displayName) details.displayName = '请输入显示名称。';
    if (headline === null) details.headline = '个性标题过长。';
    if (bio === null) details.bio = '个人简介过长。';
    if (location === null) details.location = '地区过长。';
    if (organization === null) details.organization = '组织名称过长。';
    if (website === null) details.website = '个人网站过长。';
    if (github === null) details.github = 'GitHub 信息过长。';
    if (Object.keys(details).length) return reply.status(400).send({ code: 'VALIDATION_ERROR', message: '请检查输入。', details, requestId: request.id });
    if (website && !/^https?:\/\/[^\s]+$/i.test(website))
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: '网站链接格式不正确。', details: { website: '请输入 http 或 https 地址。' }, requestId: request.id });
    if (github && !/^(?:[A-Za-z0-9-]{1,39}|https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/?$)$/.test(github))
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'GitHub 信息格式不正确。', details: { github: '请输入 GitHub 用户名或主页地址。' }, requestId: request.id });
    const client = (options.pool as Pool & { connect?: () => Promise<Pool & { release(): void }> }).connect
      ? await (options.pool as Pool & { connect: () => Promise<Pool & { release(): void }> }).connect()
      : options.pool;
    try {
      if ('release' in client) await client.query('BEGIN');
      await client.query('UPDATE users SET display_name=$2,updated_at=now() WHERE id=$1 AND status=\'active\'', [auth.userId, displayName]);
      await client.query(`INSERT INTO user_profiles(user_id,display_name,headline,bio,location,organization,website,github,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,headline=EXCLUDED.headline,bio=EXCLUDED.bio,location=EXCLUDED.location,organization=EXCLUDED.organization,website=EXCLUDED.website,github=EXCLUDED.github,updated_at=now()`,
      [auth.userId, displayName, headline, bio, location, organization, website, github]);
      if ('release' in client) await client.query('COMMIT');
    } catch (e) {
      if ('release' in client) await client.query('ROLLBACK');
      throw e;
    } finally {
      if ('release' in client) (client as Pool & { release(): void }).release();
    }
    return reply.send({ username: (await options.pool.query('SELECT username FROM users WHERE id=$1', [auth.userId])).rows[0]?.username, displayName, headline, bio, location, organization, website, github });
  });
  const parseUpload = (body: unknown, contentType: string) => {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!match || !Buffer.isBuffer(body)) return undefined;
    const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
    const parts = body.toString('binary').split(boundary.toString('binary'));
    for (const part of parts) {
      const split = part.indexOf('\r\n\r\n');
      if (split < 0 || !/name="file"/i.test(part.slice(0, split))) continue;
      const header = part.slice(0, split);
      const raw = part.slice(split + 4).replace(/\r\n--?\s*$/g, '');
      const bytes = Buffer.from(raw, 'binary');
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim() ?? '';
      return { bytes, type };
    }
  };
  app.get('/api/profile/media/:owner/:kind/:id', async (request, reply) => {
    if (!options.storage) return error(reply, request, 404, 'NOT_FOUND', 'Media not found');
    const params = request.params as { owner: string; kind: string; id: string };
    const key = `profile/${params.owner}/${params.kind}/${params.id}`;
    if (!/^profile\/[a-f0-9-]+\/(avatar|background)\/[a-f0-9-]+$/.test(key)) return error(reply, request, 404, 'NOT_FOUND', 'Media not found');
    try {
      const result = await options.storage.client.send(new GetObjectCommand({ Bucket: options.storage.bucket, Key: key }));
      reply.header('cache-control', 'public, max-age=31536000, immutable').type(result.ContentType ?? 'image/*');
      return reply.send(result.Body);
    } catch { return error(reply, request, 404, 'NOT_FOUND', 'Media not found'); }
  });
  const upload = async (request: FastifyRequest, reply: FastifyReply, kind: 'avatar' | 'background') => {
    const auth = await passwordUser(request, reply); if (!auth) return;
    if (!csrf(request)) return error(reply, request, 403, 'CSRF_INVALID', 'CSRF validation failed');
    if (!options.storage) return error(reply, request, 503, 'STORAGE_UNAVAILABLE', 'Media storage unavailable');
    const file = parseUpload(request.body, String(request.headers['content-type'] ?? ''));
    const max = kind === 'avatar' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return error(reply, request, 400, 'UNSUPPORTED_MEDIA_TYPE', '文件格式不支持');
    if (file.bytes.length > max) return error(reply, request, 413, 'PAYLOAD_TOO_LARGE', '图片过大');
    const signature = file.type === 'image/png' ? file.bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : file.type === 'image/jpeg' ? file.bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) : file.bytes.subarray(0, 4).equals(Buffer.from('RIFF')) && file.bytes.subarray(8, 12).equals(Buffer.from('WEBP'));
    if (!signature) return error(reply, request, 400, 'UNSUPPORTED_MEDIA_TYPE', '文件格式不支持');
    const key = `profile/${auth.userId}/${kind}/${randomUUID()}`;
    await options.storage.client.send(new PutObjectCommand({ Bucket: options.storage.bucket, Key: key, Body: file.bytes, ContentType: file.type }));
    const column = kind === 'avatar' ? 'avatar_object_key' : 'background_object_key';
    await options.pool.query(`INSERT INTO user_profiles(user_id,display_name,${column},updated_at) SELECT $1,display_name,$2,now() FROM users WHERE id=$1 ON CONFLICT(user_id) DO UPDATE SET ${column}=EXCLUDED.${column},updated_at=now()`, [auth.userId, key]);
    return reply.send({ url: `/api/profile/media/${encodeURIComponent(key)}` });
  };
  app.post('/api/profile/me/avatar', (request, reply) => upload(request, reply, 'avatar'));
  app.post('/api/profile/me/background', (request, reply) => upload(request, reply, 'background'));
  const removeMedia = async (request: FastifyRequest, reply: FastifyReply, kind: 'avatar' | 'background') => {
    const auth = await passwordUser(request, reply); if (!auth) return;
    if (!csrf(request)) return error(reply, request, 403, 'CSRF_INVALID', 'CSRF validation failed');
    const column = kind === 'avatar' ? 'avatar_object_key' : 'background_object_key';
    const result = await options.pool.query(`SELECT ${column} AS key FROM user_profiles WHERE user_id=$1`, [auth.userId]);
    const key = result.rows[0]?.key;
    await options.pool.query(`UPDATE user_profiles SET ${column}=NULL,updated_at=now() WHERE user_id=$1`, [auth.userId]);
    if (key && options.storage && typeof key === 'string') await options.storage.client.send(new DeleteObjectCommand({ Bucket: options.storage.bucket, Key: key })).catch(() => undefined);
    return reply.status(204).send();
  };
  app.delete('/api/profile/me/avatar', (request, reply) => removeMedia(request, reply, 'avatar'));
  app.delete('/api/profile/me/background', (request, reply) => removeMedia(request, reply, 'background'));
  app.get('/api/profiles/:username/activity', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const filter = publicProblemFilter(target.isSelf);
    const result = await options.pool.query(
      `WITH days AS (SELECT generate_series((CURRENT_DATE AT TIME ZONE 'UTC')::date - 364, (CURRENT_DATE AT TIME ZONE 'UTC')::date, interval '1 day')::date AS day)
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
              COALESCE(count(s.id) FILTER (WHERE TRUE${filter}), 0)::int AS submission_count,
              COALESCE(count(s.id) FILTER (WHERE e.verdict='AC'${filter}), 0)::int AS accepted_count
       FROM days LEFT JOIN submissions s ON s.owner_user_id=$1 AND (s.created_at AT TIME ZONE 'UTC')::date=days.day
       LEFT JOIN problems p ON p.id=s.problem_id
       LEFT JOIN submission_evaluations e ON e.submission_id=s.id AND e.current=true
       GROUP BY days.day ORDER BY days.day`,
      [String(target.user.id)],
    );
    return reply.send({
      timezone: 'UTC',
      days: result.rows.map((row) => ({
        date: String(row.date),
        submissionCount: Number(row.submission_count),
        acceptedCount: Number(row.accepted_count),
      })),
    });
  });
  app.get('/api/profiles/:username/overview', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const filter = publicProblemFilter(target.isSelf);
    const overview = await options.pool.query(
      `SELECT
         (SELECT count(*)::int FROM problems p WHERE p.author_id=$1${filter}) AS created_problem_count,
         (SELECT count(DISTINCT s.problem_id)::int FROM submissions s
          JOIN submission_evaluations se ON se.submission_id=s.id
          JOIN problems p ON p.id=s.problem_id
          WHERE s.owner_user_id=$1 AND se.current=true
            AND se.status='COMPLETED_WITH_VERDICT' AND se.verdict='AC'${filter}) AS solved_problem_count,
         (SELECT count(*)::int FROM submissions s
          JOIN problems p ON p.id=s.problem_id
          WHERE s.owner_user_id=$1${filter}) AS submission_count,
         (SELECT count(*)::int FROM submissions s
          JOIN submission_evaluations se ON se.submission_id=s.id
          JOIN problems p ON p.id=s.problem_id
          WHERE s.owner_user_id=$1 AND se.current=true
            AND se.status='COMPLETED_WITH_VERDICT' AND se.verdict='AC'${filter}) AS accepted_submission_count`,
      [String(target.user.id)],
    );
    const row = overview.rows[0] ?? {};
    const result = {
      createdProblemCount: Number(row.created_problem_count ?? 0),
      solvedProblemCount: Number(row.solved_problem_count ?? 0),
      submissionCount: Number(row.submission_count ?? 0),
      acceptedSubmissionCount: Number(row.accepted_submission_count ?? 0),
    };
    if (target.isSelf && target.auth?.strength === 'password') {
      const favorites = await options.pool.query(
        "SELECT count(*)::int count FROM problem_favorites pf JOIN problems p ON p.id=pf.problem_id WHERE pf.user_id=$1 AND p.visibility='public' AND p.status='published'",
        [String(target.user.id)],
      );
      return reply.send({
        ...result,
        favoriteCount: Number(favorites.rows[0]?.count ?? 0),
      });
    }
    return reply.send(result);
  });
  app.get('/api/profiles/:username/solved', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const query = request.query as Record<string, unknown>;
    const limit = page(query),
      cursor = decode(query.cursor);
    if (!limit || (query.cursor !== undefined && !cursor))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    const filter = publicProblemFilter(target.isSelf);
    const result = await options.pool.query(
      `SELECT p.id,p.slug,p.title,max(se.completed_at) AS accepted_at
       FROM submissions s JOIN submission_evaluations se ON se.submission_id=s.id
       JOIN problems p ON p.id=s.problem_id
       WHERE s.owner_user_id=$1 AND se.current=true
         AND se.status='COMPLETED_WITH_VERDICT' AND se.verdict='AC'${filter}
       GROUP BY p.id,p.slug,p.title
       ${cursor ? 'HAVING (max(se.completed_at),p.id)<($2,$3)' : ''}
       ORDER BY max(se.completed_at) DESC,p.id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [String(target.user.id), cursor.createdAt, cursor.id, limit]
        : [String(target.user.id), limit],
    );
    const count = await options.pool.query(
      `SELECT count(DISTINCT s.problem_id)::int total FROM submissions s
       JOIN submission_evaluations se ON se.submission_id=s.id
       JOIN problems p ON p.id=s.problem_id
       WHERE s.owner_user_id=$1 AND se.current=true
         AND se.status='COMPLETED_WITH_VERDICT' AND se.verdict='AC'${filter}`,
      [String(target.user.id)],
    );
    const items = result.rows.map((row) => ({
      problemId: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      lastAcceptedAt: new Date(String(row.accepted_at)).toISOString(),
    }));
    return reply.send({
      items,
      page: {
        limit,
        total: Number(count.rows[0]?.total ?? 0),
        ...(items.length === limit
          ? {
              nextCursor: encode({
                createdAt: items.at(-1)!.lastAcceptedAt,
                id: items.at(-1)!.problemId,
              }),
            }
          : {}),
      },
    });
  });
  app.get('/api/profiles/:username/submissions', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const query = request.query as Record<string, unknown>;
    const limit = page(query);
    const cursor = decode(query.cursor);
    if (!limit || (query.cursor !== undefined && !cursor))
      return error(reply, request, 400, 'VALIDATION_ERROR', 'Invalid pagination');
    const filter = publicProblemFilter(target.isSelf);
    const result = await options.pool.query(
      `SELECT s.id,s.problem_id,s.language_id,s.status,s.created_at,p.slug,p.title,
              se.status AS evaluation_status,se.verdict
       FROM submissions s
       JOIN problems p ON p.id=s.problem_id
       LEFT JOIN submission_evaluations se ON se.submission_id=s.id AND se.current=true
       WHERE s.owner_user_id=$1${filter}
       ${cursor ? 'AND (s.created_at,s.id)<($2,$3)' : ''}
       ORDER BY s.created_at DESC,s.id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [String(target.user.id), cursor.createdAt, cursor.id, limit]
        : [String(target.user.id), limit],
    );
    const items = result.rows.map((row) => ({
      id: String(row.id),
      problemId: String(row.problem_id),
      slug: String(row.slug),
      title: String(row.title),
      languageId: String(row.language_id),
      status: String(row.evaluation_status ?? row.status),
      ...(row.verdict ? { verdict: String(row.verdict) } : {}),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
    return reply.send({
      items,
      page: {
        limit,
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
  app.get('/api/profiles/:username/problems', async (request, reply) => {
    const target = await profileTarget(request, reply);
    if (!target) return;
    const query = request.query as Record<string, unknown>;
    const limit = page(query),
      cursor = decode(query.cursor);
    if (!limit || (query.cursor !== undefined && !cursor))
      return error(
        reply,
        request,
        400,
        'VALIDATION_ERROR',
        'Invalid pagination',
      );
    const filter = target.isSelf
      ? ''
      : " AND visibility='public' AND status='published'";
    const result = await options.pool.query(
        `SELECT id,public_number,slug,title,status,visibility,created_at,updated_at FROM problems WHERE deleted_at IS NULL AND author_id=$1${filter}
       ${cursor ? 'AND (created_at,id)<($2,$3)' : ''} ORDER BY created_at DESC,id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [String(target.user.id), cursor.createdAt, cursor.id, limit]
        : [String(target.user.id), limit],
    );
    const count = await options.pool.query(
      `SELECT count(*)::int total FROM problems WHERE deleted_at IS NULL AND author_id=$1${filter}`,
      [String(target.user.id)],
    );
    const items = result.rows.map((row) => ({
      id: String(row.id),
      publicNumber: Number(row.public_number),
      publicId: `P${String(row.public_number).padStart(4, '0')}`,
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
       WHERE pf.user_id=$1 AND p.deleted_at IS NULL AND p.visibility='public' AND p.status='published'
       ${cursor ? 'AND (pf.created_at,pf.problem_id)<($2,$3)' : ''}
       ORDER BY pf.created_at DESC,pf.problem_id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [auth.userId, cursor.createdAt, cursor.id, limit]
        : [auth.userId, limit],
    );
    const count = await options.pool.query(
      "SELECT count(*)::int total FROM problem_favorites pf JOIN problems p ON p.id=pf.problem_id WHERE pf.user_id=$1 AND p.deleted_at IS NULL AND p.visibility='public' AND p.status='published'",
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
      `SELECT id,public_number,slug,title,status,visibility,created_at,updated_at FROM problems WHERE deleted_at IS NULL AND author_id=$1
       ${cursor ? 'AND (created_at,id)<($2,$3)' : ''} ORDER BY created_at DESC,id DESC LIMIT $${cursor ? 4 : 2}`,
      cursor
        ? [auth.userId, cursor.createdAt, cursor.id, limit]
        : [auth.userId, limit],
    );
    const count = await options.pool.query(
      'SELECT count(*)::int total FROM problems WHERE deleted_at IS NULL AND author_id=$1',
      [auth.userId],
    );
    const items = result.rows.map((row) => ({
      id: String(row.id),
      publicNumber: Number(row.public_number),
      publicId: `P${String(row.public_number).padStart(4, '0')}`,
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
