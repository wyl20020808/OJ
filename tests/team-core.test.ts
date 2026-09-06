import { describe, expect, it } from 'vitest';
import { InMemoryTeamRepository } from '../apps/api/src/modules/team/repository.js';
import { TeamService } from '../apps/api/src/modules/team/service.js';

describe('team core service', () => {
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
});
