/* eslint-disable @typescript-eslint/no-explicit-any -- This adapter translates untyped Fastify route payloads at the API boundary. */
import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

type Auth = { userId: string; sessionId?: string; strength?: string };
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
export type ContestModuleOptions = {
  pool: Pool;
  getAuth(request: FastifyRequest): Promise<Auth | undefined>;
  audit?: Audit;
  problemExists(id: string): Promise<boolean>;
  createSubmission?: (input: unknown, auth: Auth) => Promise<{ id: string }>;
  deleteSubmission?: (id: string, auth: Auth) => Promise<void>;
};
const page = (q: Record<string, unknown>) => {
  const limit = Number(q.limit ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('VALIDATION_ERROR');
  return limit;
};
const fail = (code: string) => Object.assign(new Error(code), { code });
const validContestId = (id: unknown): string => {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw fail('VALIDATION_ERROR');
  return id;
};
const contestId = (r: FastifyRequest) =>
  validContestId((r.params as { id?: unknown }).id);
const state = (r: Row) =>
  r.lifecycle === 'CANCELLED'
    ? 'CANCELLED'
    : r.lifecycle === 'DRAFT'
      ? 'DRAFT'
      : new Date(String(r.starts_at)) > new Date()
        ? 'UPCOMING'
        : new Date(String(r.ends_at)) <= new Date()
          ? 'ENDED'
          : 'RUNNING';
const json = (r: Row, auth?: Auth) => ({
  id: String(r.id),
  title: String(r.title),
  description: String(r.description),
  ownerUserId: String(r.owner_user_id),
  visibility: String(r.visibility),
  lifecycle: state(r),
  format: String(r.format),
  startsAt: new Date(String(r.starts_at)).toISOString(),
  endsAt: new Date(String(r.ends_at)).toISOString(),
  registrationOpenAt:
    r.registration_open_at &&
    new Date(String(r.registration_open_at)).toISOString(),
  registrationCloseAt:
    r.registration_close_at &&
    new Date(String(r.registration_close_at)).toISOString(),
  canManage: Boolean(
    auth && (String(r.owner_user_id) === auth.userId || r.can_manage),
  ),
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
});
const hash = (v: string) =>
  scryptSync(v, 'contest-access-code', 32).toString('base64');
const row = (result: Query): Row => {
  if (!result.rows[0]) throw new Error('INTERNAL_ERROR');
  return result.rows[0];
};

export async function registerContestModule(
  app: FastifyInstance,
  o: ContestModuleOptions,
) {
  const auth = (r: FastifyRequest) => o.getAuth(r);
  const err = (e: unknown, reply: any, r: FastifyRequest) => {
    const code =
      e instanceof Error ? ((e as any).code ?? e.message) : 'INTERNAL_ERROR';
    const map: Record<string, [number, string]> = {
      UNAUTHENTICATED: [401, 'Authentication required'],
      CONTEST_NOT_FOUND: [404, 'Contest not found'],
      CONTEST_FORBIDDEN: [403, 'Contest access is forbidden'],
      CONTEST_NOT_OPEN: [409, 'Contest is not open'],
      CONTEST_REGISTRATION_CLOSED: [409, 'Registration is closed'],
      CONTEST_ALREADY_ENDED: [409, 'Contest already ended'],
      CONTEST_PROBLEM_INVALID: [400, 'Invalid contest problem'],
      VALIDATION_ERROR: [400, 'Invalid request'],
      SCORING_ENGINE_NOT_INTEGRATED: [503, 'Scoring engine is not integrated'],
      SUBMISSION_BINDING_NOT_INTEGRATED: [
        503,
        'Submission binding is not integrated',
      ],
      SUBMISSION_BINDING_RECOVERY_FAILED: [
        503,
        'Submission binding recovery failed',
      ],
    };
    const [s, m] = map[code] ?? [500, 'Internal server error'];
    return reply.status(s).send({ code, message: m, requestId: r.id });
  };
  const get = async (id: string, a?: Auth, manage = false) => {
    const validId = validContestId(id);
    const x = await o.pool.query('SELECT * FROM contests WHERE id=$1', [
      validId,
    ]);
    const r = x.rows[0];
    if (!r) throw fail('CONTEST_NOT_FOUND');
    const own = a && String(r.owner_user_id) === a.userId;
    const role =
      a &&
      (await o.pool.query(
        "SELECT 1 FROM contest_roles WHERE contest_id=$1 AND user_id=$2 AND role IN ('OWNER','MANAGER')",
        [validId, a.userId],
      ));
    const registered =
      a &&
      (await o.pool.query(
        "SELECT 1 FROM contest_registrations WHERE contest_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [validId, a.userId],
      ));
    if (manage && !(own || role?.rowCount)) throw fail('CONTEST_FORBIDDEN');
    if (
      !manage &&
      !(r.visibility === 'PUBLIC' && r.lifecycle === 'PUBLISHED') &&
      !(own || role?.rowCount || registered?.rowCount)
    )
      throw fail('CONTEST_FORBIDDEN');
    return { ...r, can_manage: Boolean(own || role?.rowCount) } as Row;
  };
  const audit = async (
    a: Auth,
    action: string,
    id: string,
    r: FastifyRequest,
  ) =>
    o.audit?.record({
      actorUserId: a.userId,
      action,
      resource: 'contest',
      resourceId: id,
      outcome: 'allowed',
      requestId: r.id,
      occurredAt: new Date().toISOString(),
    });
  app.get('/api/contests', async (r, reply) => {
    try {
      const q = r.query as Record<string, unknown>,
        limit = page(q),
        a = await auth(r);
      const x = await o.pool.query(
        "SELECT c.*,EXISTS(SELECT 1 FROM contest_roles cr WHERE cr.contest_id=c.id AND cr.user_id=$2 AND cr.role IN ('OWNER','MANAGER')) can_manage FROM contests c WHERE lifecycle='PUBLISHED' AND visibility='PUBLIC' ORDER BY starts_at ASC,id ASC LIMIT $1",
        [limit, a?.userId ?? null],
      );
      return { items: x.rows.map((v: Row) => json(v, a)) };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.get('/api/contests/home-summary', async (r, reply) => {
    try {
      const a = await auth(r);
      const x = await o.pool.query(
        "SELECT c.*,EXISTS(SELECT 1 FROM contest_roles cr WHERE cr.contest_id=c.id AND cr.user_id=$1 AND cr.role IN ('OWNER','MANAGER')) can_manage FROM contests c WHERE lifecycle='PUBLISHED' AND visibility='PUBLIC' ORDER BY starts_at ASC,id ASC LIMIT 18",
        [a?.userId ?? null],
      );
      const all = x.rows.map((v: Row) => json(v, a));
      return {
        running: all.filter((v) => v.lifecycle === 'RUNNING').slice(0, 6),
        upcoming: all.filter((v) => v.lifecycle === 'UPCOMING').slice(0, 6),
        recentEnded: all.filter((v) => v.lifecycle === 'ENDED').slice(0, 6),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.post('/api/contests', async (r, reply) => {
    const client = await o.pool.connect();
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const b = r.body as any;
      if (
        !b ||
        typeof b.title !== 'string' ||
        typeof b.startsAt !== 'string' ||
        typeof b.endsAt !== 'string' ||
        !['PUBLIC', 'PRIVATE'].includes(b.visibility)
      )
        throw fail('VALIDATION_ERROR');
      const s = new Date(b.startsAt),
        e = new Date(b.endsAt);
      if (!(s < e) || Number.isNaN(+s) || !b.title.trim())
        throw fail('VALIDATION_ERROR');
      await client.query('BEGIN');
      const created = row(
        await client.query(
          'INSERT INTO contests(title,description,owner_user_id,visibility,starts_at,ends_at,registration_open_at,registration_close_at,access_code_hash,format) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            b.title.trim(),
            typeof b.description === 'string' ? b.description : '',
            a.userId,
            b.visibility,
            s,
            e,
            b.registrationOpenAt ?? null,
            b.registrationCloseAt ?? null,
            b.visibility === 'PRIVATE' && typeof b.privatePassword === 'string'
              ? hash(b.privatePassword)
              : null,
            b.format ?? 'ICPC',
          ],
        ),
      );
      await client.query(
        "INSERT INTO contest_roles(contest_id,user_id,role) VALUES($1,$2,'OWNER')",
        [created.id, a.userId],
      );
      await client.query('COMMIT');
      await audit(a, 'contest:create', String(created.id), r);
      return reply.status(201).send(json(created, a));
    } catch (e) {
      await client.query('ROLLBACK');
      return err(e, reply, r);
    } finally {
      client.release();
    }
  });
  app.get('/api/contests/:id', async (r, reply) => {
    try {
      return json(await get(contestId(r), await auth(r)), await auth(r));
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.patch('/api/contests/:id', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const old = await get(contestId(r), a, true);
      if (state(old) !== 'DRAFT') throw fail('CONTEST_NOT_OPEN');
      const b = r.body as any;
      if (
        !b ||
        Object.keys(b).some(
          (k) =>
            ![
              'title',
              'description',
              'startsAt',
              'endsAt',
              'visibility',
              'registrationOpenAt',
              'registrationCloseAt',
              'privatePassword',
            ].includes(k),
        )
      )
        throw fail('VALIDATION_ERROR');
      const starts = b.startsAt
          ? new Date(b.startsAt)
          : new Date(old.starts_at),
        ends = b.endsAt ? new Date(b.endsAt) : new Date(old.ends_at);
      if (!(starts < ends)) throw fail('VALIDATION_ERROR');
      const updated = row(
        await o.pool.query(
          'UPDATE contests SET title=$2,description=$3,visibility=$4,starts_at=$5,ends_at=$6,registration_open_at=$7,registration_close_at=$8,access_code_hash=$9,updated_at=now() WHERE id=$1 RETURNING *',
          [
            old.id,
            b.title ?? old.title,
            b.description ?? old.description,
            b.visibility ?? old.visibility,
            starts,
            ends,
            b.registrationOpenAt ?? old.registration_open_at,
            b.registrationCloseAt ?? old.registration_close_at,
            b.privatePassword === undefined
              ? old.access_code_hash
              : hash(b.privatePassword),
          ],
        ),
      );
      await audit(a, 'contest:update', String(old.id), r);
      return json({ ...updated, can_manage: true }, a);
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.post('/api/contests/:id/publish', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const c = await get(contestId(r), a, true);
      if (
        c.lifecycle !== 'DRAFT' ||
        !(
          await o.pool.query(
            'SELECT 1 FROM contest_problems WHERE contest_id=$1 LIMIT 1',
            [c.id],
          )
        ).rowCount
      )
        throw fail('VALIDATION_ERROR');
      const updated = row(
        await o.pool.query(
          "UPDATE contests SET lifecycle='PUBLISHED',updated_at=now() WHERE id=$1 RETURNING *",
          [c.id],
        ),
      );
      await audit(a, 'contest:publish', String(c.id), r);
      return json({ ...updated, can_manage: true }, a);
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.post('/api/contests/:id/cancel', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const c = await get(contestId(r), a, true);
      const updated = row(
        await o.pool.query(
          "UPDATE contests SET lifecycle='CANCELLED',updated_at=now() WHERE id=$1 RETURNING *",
          [c.id],
        ),
      );
      await audit(a, 'contest:cancel', String(c.id), r);
      return json({ ...updated, can_manage: true }, a);
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.put('/api/contests/:id/problems', async (r, reply) => {
    const client = await o.pool.connect();
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const c = await get(contestId(r), a, true);
      if (state(c) !== 'DRAFT') throw fail('CONTEST_NOT_OPEN');
      const items = (r.body as any)?.problems;
      if (
        !Array.isArray(items) ||
        !items.length ||
        items.some((v: any) => !v || typeof v.problemId !== 'string') ||
        new Set(items.map((z: any) => z.problemId)).size !== items.length
      )
        throw fail('CONTEST_PROBLEM_INVALID');
      for (const p of items)
        if (!(await o.problemExists(p.problemId)))
          throw fail('CONTEST_PROBLEM_INVALID');
      await client.query('BEGIN');
      await client.query('DELETE FROM contest_problems WHERE contest_id=$1', [
        c.id,
      ]);
      for (let i = 0; i < items.length; i++)
        await client.query(
          'INSERT INTO contest_problems(contest_id,problem_id,ordinal,label,points_config) VALUES($1,$2,$3,$4,$5)',
          [
            c.id,
            items[i].problemId,
            i + 1,
            items[i].label ?? null,
            items[i].score === undefined
              ? null
              : JSON.stringify({ score: items[i].score }),
          ],
        );
      await client.query('COMMIT');
      await audit(a, 'contest:problems:update', String(c.id), r);
      return { items };
    } catch (e) {
      await client.query('ROLLBACK');
      return err(e, reply, r);
    } finally {
      client.release();
    }
  });
  app.get('/api/contests/:id/problems', async (r, reply) => {
    try {
      const c = await get(contestId(r), await auth(r));
      const x = await o.pool.query(
        'SELECT cp.problem_id,cp.ordinal,cp.label,cp.points_config,p.title FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=$1 AND p.deleted_at IS NULL ORDER BY cp.ordinal',
        [c.id],
      );
      return {
        items: x.rows.map((v: Row) => ({
          problemId: v.problem_id,
          ordinal: v.ordinal,
          label: v.label,
          pointsConfig: v.points_config,
          title: v.title,
        })),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.post('/api/contests/:id/register', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const x = await o.pool.query('SELECT * FROM contests WHERE id=$1', [
        contestId(r),
      ]);
      const c = x.rows[0];
      if (!c) throw fail('CONTEST_NOT_FOUND');
      if (
        state(c) !== 'UPCOMING' ||
        (c.registration_open_at &&
          new Date(c.registration_open_at) > new Date()) ||
        (c.registration_close_at &&
          new Date(c.registration_close_at) < new Date())
      )
        throw fail('CONTEST_REGISTRATION_CLOSED');
      const code = (r.body as any)?.accessCode;
      if (
        c.visibility === 'PRIVATE' &&
        (!code ||
          !c.access_code_hash ||
          !timingSafeEqual(
            Buffer.from(hash(code)),
            Buffer.from(c.access_code_hash),
          ))
      )
        throw fail('CONTEST_FORBIDDEN');
      const registration = row(
        await o.pool.query(
          "INSERT INTO contest_registrations(contest_id,user_id,status) VALUES($1,$2,'ACTIVE') ON CONFLICT(contest_id,user_id) DO UPDATE SET status='ACTIVE',updated_at=now() RETURNING *",
          [c.id, a.userId],
        ),
      );
      return {
        contestId: String(c.id),
        userId: a.userId,
        status: 'REGISTERED',
        registeredAt: new Date(registration.registered_at).toISOString(),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.delete('/api/contests/:id/register', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const id = contestId(r);
      if (
        !(await o.pool.query('SELECT 1 FROM contests WHERE id=$1', [id]))
          .rowCount
      )
        throw fail('CONTEST_NOT_FOUND');
      await o.pool.query(
        "UPDATE contest_registrations SET status='WITHDRAWN',updated_at=now() WHERE contest_id=$1 AND user_id=$2",
        [id, a.userId],
      );
      return reply.status(204).send();
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.get('/api/contests/:id/registration', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const x = await o.pool.query(
        'SELECT * FROM contest_registrations WHERE contest_id=$1 AND user_id=$2',
        [contestId(r), a.userId],
      );
      if (!x.rows[0]) return { status: 'NOT_REGISTERED' };
      return {
        contestId: String(x.rows[0].contest_id),
        userId: a.userId,
        status: x.rows[0].status === 'ACTIVE' ? 'REGISTERED' : 'CANCELLED',
        registeredAt: new Date(x.rows[0].registered_at).toISOString(),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.get('/api/contests/:id/participants', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const c = await get(contestId(r), a, true);
      const limit = page(r.query as Record<string, unknown>);
      const x = await o.pool.query(
        "SELECT u.id,u.username,u.display_name,cr.registered_at FROM contest_registrations cr JOIN users u ON u.id=cr.user_id WHERE cr.contest_id=$1 AND cr.status='ACTIVE' ORDER BY cr.registered_at,u.id LIMIT $2",
        [c.id, limit],
      );
      return {
        items: x.rows.map((v: Row) => ({
          id: String(v.id),
          username: String(v.username),
          displayName: String(v.display_name),
          registeredAt: new Date(String(v.registered_at)).toISOString(),
        })),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.get('/api/contests/:id/submissions', async (r, reply) => {
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      const c = await get(contestId(r), a);
      const limit = page(r.query as Record<string, unknown>);
      const x = await o.pool.query(
        'SELECT s.* FROM contest_submission_bindings b JOIN submissions s ON s.id=b.submission_id WHERE b.contest_id=$1 AND b.user_id=$2 ORDER BY b.created_at DESC,b.submission_id DESC LIMIT $3',
        [c.id, a.userId, limit],
      );
      return {
        items: x.rows.map((v: Row) => ({
          id: String(v.id),
          problemId: String(v.problem_id),
          status: v.status,
          createdAt: new Date(String(v.created_at)).toISOString(),
        })),
      };
    } catch (e) {
      return err(e, reply, r);
    }
  });
  app.post('/api/contests/:id/submissions', async (r, reply) => {
    const client = await o.pool.connect();
    let submissionId: string | undefined;
    let submissionAuth: Auth | undefined;
    try {
      const a = await auth(r);
      if (!a) throw fail('UNAUTHENTICATED');
      submissionAuth = a;
      if (!o.createSubmission || !o.deleteSubmission)
        throw fail('SUBMISSION_BINDING_NOT_INTEGRATED');
      const c = row(
        await o.pool.query('SELECT * FROM contests WHERE id=$1', [
          contestId(r),
        ]),
      );
      if (state(c) !== 'RUNNING') throw fail('CONTEST_NOT_OPEN');
      const b = r.body as any;
      if (!b || typeof b.problemId !== 'string')
        throw fail('CONTEST_PROBLEM_INVALID');
      const reg = await o.pool.query(
        "SELECT 1 FROM contest_registrations WHERE contest_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [c.id, a.userId],
      );
      const p = await o.pool.query(
        'SELECT 1 FROM contest_problems WHERE contest_id=$1 AND problem_id=$2',
        [c.id, b.problemId],
      );
      if (!reg.rows[0] || !p.rows[0]) throw fail('CONTEST_PROBLEM_INVALID');
      const submission = await o.createSubmission(b, a);
      submissionId = submission.id;
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO contest_submission_bindings(contest_id,problem_id,submission_id,user_id) VALUES($1,$2,$3,$4)',
        [c.id, b.problemId, submission.id, a.userId],
      );
      await client.query('COMMIT');
      return reply
        .status(201)
        .send({ submissionId: submission.id, contestId: String(c.id) });
    } catch (e) {
      await client.query('ROLLBACK');
      if (typeof submissionId === 'string') {
        try {
          await o.deleteSubmission!(submissionId, submissionAuth!);
        } catch {
          return err(fail('SUBMISSION_BINDING_RECOVERY_FAILED'), reply, r);
        }
      }
      return err(e, reply, r);
    } finally {
      client.release();
    }
  });
  app.get('/api/contests/:id/standings', async (r, reply) => {
    try {
      await get(contestId(r), await auth(r));
      return reply.status(503).send({
        available: false,
        reason: 'SCORING_ENGINE_NOT_INTEGRATED',
        requestId: r.id,
      });
    } catch (e) {
      return err(e, reply, r);
    }
  });
}
