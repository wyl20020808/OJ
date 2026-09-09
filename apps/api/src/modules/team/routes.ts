/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { TeamService } from './service.js';
type Auth = { userId: string; strength?: string };
export async function registerTeamModule(
  app: FastifyInstance,
  options: {
    service: TeamService;
    getAuth: (request: FastifyRequest) => Promise<Auth | undefined>;
  },
) {
  const auth = async (request: FastifyRequest) => {
    const a = await options.getAuth(request);
    if (!a)
      throw Object.assign(new Error('UNAUTHENTICATED'), {
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    return a;
  };
  const body = (r: FastifyRequest) => r.body as Record<string, unknown>;
  const p = (r: FastifyRequest) =>
    r.params as Record<string, string> & {
      slug: string;
      userId: string;
      id: string;
    };
  const q = (r: FastifyRequest) =>
    r.query as Record<string, string | undefined>;
  const requireCsrf = (r: FastifyRequest) => {
    const token = r.headers['x-csrf-token'];
    const valid =
      typeof token === 'string' &&
      Boolean(
        r.headers.cookie
          ?.split(';')
          .some((item) => item.trim() === `oj_csrf=${token}`),
      );
    if (!valid)
      throw Object.assign(new Error('CSRF_INVALID'), {
        code: 'CSRF_INVALID',
        status: 403,
      });
  };
  app.post('/api/teams', async (r, reply) => {
    const a = await auth(r);
    const b = body(r);
    try {
      requireCsrf(r);
      return reply.status(201).send(
        await options.service.create(
          {
            name: String(b.name ?? ''),
            slug: String(b.slug ?? b.name ?? ''),
            description: String(b.description ?? ''),
            avatarUrl: b.avatarUrl ? String(b.avatarUrl) : null,
            visibility: (b.visibility ?? 'PUBLIC') as any,
            joinPolicy: (b.joinPolicy ?? 'OPEN') as any,
            ownerId: a.userId,
          },
          { requestId: r.id },
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.get('/api/teams', async (r) =>
    options.service.listPublic(
      Math.min(Number(q(r).limit ?? 20), 100),
      q(r).cursor,
    ),
  );
  app.get('/api/teams/mine', async (r) => {
    const a = await auth(r);
    return options.service.listMine(
      a.userId,
      Math.min(Number(q(r).limit ?? 20), 100),
      q(r).cursor,
    );
  });
  app.get('/api/teams/:slug', async (r, reply) => {
    try {
      return reply.send(
        await options.service.detail(
          p(r).slug,
          (await options.getAuth(r))?.userId,
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 404).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.patch('/api/teams/:slug', async (r, reply) => {
    try {
      requireCsrf(r);
      const a = await auth(r);
      return reply.send(
        await options.service.update(p(r).slug, a.userId, body(r) as any, {
          requestId: r.id,
        }),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 403).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.post('/api/teams/:slug/join', async (r, reply) => {
    try {
      requireCsrf(r);
      return reply.send(
        await options.service.join(p(r).slug, (await auth(r)).userId, {
          requestId: r.id,
        }),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.post('/api/teams/:slug/join-by-code', async (r, reply) => {
    try {
      requireCsrf(r);
      return reply.send(
        await options.service.joinCode(
          String(body(r).code ?? ''),
          (await auth(r)).userId,
          { requestId: r.id },
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.post('/api/teams/:slug/leave', async (r, reply) => {
    try {
      requireCsrf(r);
      return reply.send(
        await options.service.leave(p(r).slug, (await auth(r)).userId, {
          requestId: r.id,
        }),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.get('/api/teams/:slug/members', async (r) => {
    const a = await auth(r);
    return options.service.members(
      p(r).slug,
      a.userId,
      Math.min(Number(q(r).limit ?? 50), 100),
      q(r).cursor,
    );
  });
  app.get('/api/teams/:slug/join-requests', async (r, reply) => {
    try {
      return reply.send({
        items: await options.service.listJoinRequests(
          p(r).slug,
          (await auth(r)).userId,
        ),
      });
    } catch (e) {
      return reply.status((e as any).status ?? 403).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.patch('/api/teams/:slug/members/:userId', async (r, reply) => {
    try {
      requireCsrf(r);
      const a = await auth(r);
      return reply.send(
        await options.service.changeRole(
          p(r).slug,
          a.userId,
          p(r).userId,
          String(body(r).role) as any,
          { requestId: r.id },
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 403).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.delete('/api/teams/:slug/members/:userId', async (r, reply) => {
    try {
      requireCsrf(r);
      const a = await auth(r);
      return reply.send(
        await options.service.remove(p(r).slug, a.userId, p(r).userId, {
          requestId: r.id,
        }),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 403).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.post('/api/teams/:slug/invitations', async (r, reply) => {
    try {
      requireCsrf(r);
      const a = await auth(r);
      const expiresAt = body(r).expiresAt
        ? String(body(r).expiresAt)
        : undefined;
      return reply.status(201).send(
        await options.service.invite(
          p(r).slug,
          a.userId,
          {
            invitedUserId: String(body(r).invitedUserId),
            ...(expiresAt ? { expiresAt } : {}),
          },
          { requestId: r.id },
        ),
      );
    } catch (e) {
      return reply.status((e as any).status ?? 409).send({
        code: (e as any).code ?? 'TEAM_ERROR',
        message: (e as Error).message,
        requestId: r.id,
      });
    }
  });
  app.post('/api/team-invitations/:id/accept', async (r) => {
    requireCsrf(r);
    return options.service.acceptInvitation(p(r).id, (await auth(r)).userId, {
      requestId: r.id,
    });
  });
  app.post('/api/team-invitations/:id/decline', async (r) => {
    requireCsrf(r);
    return options.service.declineInvitation(p(r).id, (await auth(r)).userId, {
      requestId: r.id,
    });
  });
  app.delete('/api/team-invitations/:id', async (r) => {
    requireCsrf(r);
    return options.service.revokeInvitation(p(r).id, (await auth(r)).userId, {
      requestId: r.id,
    });
  });
  app.post('/api/teams/:slug/join-requests/:id/approve', async (r) => {
    requireCsrf(r);
    return options.service.reviewRequest(
      p(r).slug,
      (await auth(r)).userId,
      p(r).id,
      true,
      { requestId: r.id },
    );
  });
  app.post('/api/teams/:slug/join-requests/:id/reject', async (r) => {
    requireCsrf(r);
    return options.service.reviewRequest(
      p(r).slug,
      (await auth(r)).userId,
      p(r).id,
      false,
      { requestId: r.id },
    );
  });
  app.post('/api/team-join-requests/:id/cancel', async (r) => {
    requireCsrf(r);
    return options.service.cancelJoinRequest(p(r).id, (await auth(r)).userId, {
      requestId: r.id,
    });
  });
  app.post('/api/teams/:slug/invite-codes', async (r) => {
    requireCsrf(r);
    return options.service.inviteCode(
      p(r).slug,
      (await auth(r)).userId,
      {
        expiresAt: body(r).expiresAt ? String(body(r).expiresAt) : null,
        maxUses: body(r).maxUses == null ? null : Number(body(r).maxUses),
      },
      { requestId: r.id },
    );
  });
  app.delete('/api/teams/:slug/invite-codes/:id', async (r) => {
    requireCsrf(r);
    return options.service.revokeInviteCode(
      p(r).slug,
      (await auth(r)).userId,
      p(r).id,
      { requestId: r.id },
    );
  });
}
