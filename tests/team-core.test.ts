import { describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { InMemoryTeamRepository } from '../apps/api/src/modules/team/repository.js';
import { TeamService } from '../apps/api/src/modules/team/service.js';

describe('team core service', () => {
  it('qualifies Team routes through the real API app', async () => {
    const app = await buildApp({ logger: false });
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'team-owner',
        email: 'team-owner@example.com',
        displayName: 'Team Owner',
        password: 'correct horse battery staple',
      },
    });
    expect(registration.statusCode).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identity: 'team-owner',
        password: 'correct horse battery staple',
      },
    });
    expect(login.statusCode).toBe(200);
    const setCookies = login.headers['set-cookie'];
    const cookie = (
      Array.isArray(setCookies) ? setCookies : [String(setCookies)]
    )
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    const csrf = /oj_csrf=([^;,]+)/.exec(cookie)?.[1];
    expect(csrf).toBeTruthy();
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { cookie },
      payload: { name: 'Route Team', slug: 'route-team' },
    });
    expect(noCsrf.statusCode).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { cookie, 'x-csrf-token': decodeURIComponent(csrf!) },
      payload: {
        name: 'Route Team',
        slug: 'route-team',
        visibility: 'PUBLIC',
        joinPolicy: 'OPEN',
      },
    });
    expect(created.statusCode).toBe(201);
    const listed = await app.inject({ method: 'GET', url: '/api/teams' });
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .items.filter((item: { id: string }) => item.id === created.json().id),
    ).toHaveLength(1);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'route-team' })]),
    );
    const detail = await app.inject({
      method: 'GET',
      url: '/api/teams/route-team',
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      memberCount: 1,
      membershipState: 'OWNER',
    });
    await app.close();
  });

  it('creates owner and supports idempotent open join', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Alpha',
      slug: 'alpha',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      ownerId: 'u1',
    });
    expect(repo.teams.size).toBe(1);
    expect(repo.membersMap.size).toBe(1);
    expect(
      (await repo.member((await repo.getTeam('alpha'))!.id, 'u1'))?.role,
    ).toBe('OWNER');
    expect((await service.join('alpha', 'u2')).status).toBe('JOINED');
    expect((await service.join('alpha', 'u2')).status).toBe('ALREADY_MEMBER');
  });
  it('protects manager boundaries and sole owner leave', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Alpha',
      slug: 'alpha',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      ownerId: 'u1',
    });
    await service.join('alpha', 'u2');
    await service.changeRole('alpha', 'u1', 'u2', 'MANAGER');
    await service.join('alpha', 'u3');
    await expect(
      service.changeRole('alpha', 'u2', 'u1', 'MEMBER'),
    ).rejects.toMatchObject({ code: 'TEAM_FORBIDDEN' });
    expect((await service.remove('alpha', 'u2', 'u3')).status).toBe('REMOVED');
    await expect(service.leave('alpha', 'u1')).rejects.toMatchObject({
      code: 'TEAM_OWNER_TRANSFER_REQUIRED',
    });
  });
  it('handles request join and invite code limits', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Req',
      slug: 'req',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'REQUEST',
      ownerId: 'u1',
    });
    expect((await service.join('req', 'u2')).status).toBe('REQUESTED');
    const request = (
      await repo.listJoinRequests((await repo.getTeam('req'))!.id)
    )[0]!;
    await service.reviewRequest('req', 'u1', request.id, true);
    expect(
      (await repo.member((await repo.getTeam('req'))!.id, 'u2'))?.role,
    ).toBe('MEMBER');
    const code = await service.inviteCode('req', 'u1', {
      expiresAt: null,
      maxUses: 1,
    });
    await service.joinCode(code.code, 'u3');
    await expect(service.joinCode(code.code, 'u4')).rejects.toMatchObject({
      code: 'INVALID_INVITE_CODE',
    });
  });
  it('does not approve a request after it is rejected', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Review',
      slug: 'review',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'REQUEST',
      ownerId: 'u1',
    });
    const team = (await repo.getTeam('review'))!;
    await service.join('review', 'u2');
    const request = (await repo.listJoinRequests(team.id))[0]!;
    await service.reviewRequest('review', 'u1', request.id, false);
    expect(await repo.approveJoinRequest(request.id, 'u1')).toBeNull();
    expect(await repo.member(team.id, 'u2')).toBeNull();
  });
  it('reports total members independently from member page size', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Scale',
      slug: 'scale',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      ownerId: 'u1',
    });
    await Promise.all(
      Array.from({ length: 24 }, (_, i) => service.join('scale', `u${i + 2}`)),
    );
    const detail = await service.detail('scale', 'u1');
    expect(detail.memberCount).toBe(25);
    expect((await service.members('scale', 'u1', 10)).items).toHaveLength(10);
  });
  it('records management audit events without secrets', async () => {
    const events: Array<{ action: string; metadata?: Record<string, string> }> =
      [];
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo, {
      record: (event) => {
        events.push(event);
      },
    });
    await service.create({
      name: 'Audited',
      slug: 'audited',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      ownerId: 'u1',
    });
    const code = await service.inviteCode('audited', 'u1', {
      expiresAt: null,
      maxUses: 1,
    });
    expect(events.map((event) => event.action)).toContain('TEAM_CREATED');
    expect(events.map((event) => event.action)).toContain(
      'TEAM_INVITE_CODE_CREATED',
    );
    expect(
      events.some((event) => JSON.stringify(event).includes(code.code)),
    ).toBe(false);
  });
  it('enforces owner, manager, member, private, and IDOR boundaries', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Private',
      slug: 'private',
      description: '',
      visibility: 'PRIVATE',
      joinPolicy: 'OPEN',
      ownerId: 'owner',
    });
    await expect(service.detail('private', 'outsider')).rejects.toMatchObject({
      code: 'TEAM_NOT_FOUND',
    });
    await service.join('private', 'member');
    await service.changeRole('private', 'owner', 'member', 'MANAGER');
    await service.join('private', 'ordinary');
    await expect(
      service.invite('private', 'ordinary', { invitedUserId: 'x' }),
    ).rejects.toMatchObject({ code: 'TEAM_FORBIDDEN' });
    await expect(
      service.remove('private', 'member', 'owner'),
    ).rejects.toMatchObject({ code: 'TEAM_FORBIDDEN' });
    await expect(
      service.update('private', 'ordinary', { description: 'x' }),
    ).rejects.toMatchObject({ code: 'TEAM_FORBIDDEN' });
    const invite = await service.invite('private', 'owner', {
      invitedUserId: 'invitee',
    });
    await expect(
      service.acceptInvitation(invite.id, 'other-user'),
    ).rejects.toMatchObject({ code: 'INVITATION_NOT_FOUND' });
    await service.acceptInvitation(invite.id, 'invitee');
    await expect(
      service.revokeInvitation(invite.id, 'owner'),
    ).rejects.toMatchObject({ code: 'INVITATION_CONFLICT' });
  });
  it('keeps invite-code max uses atomic under duplicate calls', async () => {
    const repo = new InMemoryTeamRepository();
    const service = new TeamService(repo);
    await service.create({
      name: 'Codes',
      slug: 'codes',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'INVITE_ONLY',
      ownerId: 'owner',
    });
    const code = await service.inviteCode('codes', 'owner', {
      expiresAt: null,
      maxUses: 1,
    });
    const results = await Promise.allSettled([
      service.joinCode(code.code, 'u1'),
      service.joinCode(code.code, 'u2'),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await repo.countMembers((await repo.getTeam('codes'))!.id)).toBe(2);
  });
});
