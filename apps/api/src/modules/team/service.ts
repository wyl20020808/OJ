import { createHash } from 'node:crypto';
import type { TeamRepository } from './repository.js';
import { roleRank, type TeamRole } from './model.js';

export class TeamService {
  constructor(public readonly repository: TeamRepository) {}
  private async team(slug: string) {
    const t = await this.repository.getTeam(slug);
    if (!t)
      throw Object.assign(new Error('TEAM_NOT_FOUND'), {
        code: 'TEAM_NOT_FOUND',
        status: 404,
      });
    return t;
  }
  private async actor(slug: string, userId: string) {
    const t = await this.team(slug);
    const m = await this.repository.member(t.id, userId);
    return { team: t, member: m };
  }
  private require(
    m: Awaited<ReturnType<TeamService['actor']>>['member'],
    min: TeamRole,
  ) {
    if (!m || roleRank(m.role) < roleRank(min))
      throw Object.assign(new Error('TEAM_FORBIDDEN'), {
        code: 'TEAM_FORBIDDEN',
        status: 403,
      });
    return m;
  }
  async create(input: Parameters<TeamRepository['createTeam']>[0]) {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,48}$/.test(slug))
      throw Object.assign(new Error('INVALID_TEAM_SLUG'), {
        code: 'INVALID_TEAM_SLUG',
        status: 400,
      });
    if (
      !['PUBLIC', 'PRIVATE'].includes(input.visibility) ||
      !['OPEN', 'REQUEST', 'INVITE_ONLY'].includes(input.joinPolicy)
    )
      throw Object.assign(new Error('INVALID_TEAM_POLICY'), {
        code: 'INVALID_TEAM_POLICY',
        status: 400,
      });
    return this.repository.createTeam({ ...input, slug });
  }
  async detail(slug: string, userId?: string) {
    const team = await this.team(slug);
    const member = userId
      ? await this.repository.member(team.id, userId)
      : null;
    if (team.visibility === 'PRIVATE' && !member)
      throw Object.assign(new Error('TEAM_NOT_FOUND'), {
        code: 'TEAM_NOT_FOUND',
        status: 404,
      });
    return {
      ...team,
      membershipState: member?.role ?? 'NOT_MEMBER',
      memberCount: await this.repository.countMembers(team.id),
    };
  }
  async update(
    slug: string,
    userId: string,
    patch: Parameters<TeamRepository['updateTeam']>[1],
  ) {
    const { member } = await this.actor(slug, userId);
    this.require(member, 'OWNER');
    const allowed = [
      'name',
      'description',
      'avatarUrl',
      'visibility',
      'joinPolicy',
    ];
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([key]) => allowed.includes(key)),
    );
    return this.repository.updateTeam(
      slug,
      clean as Parameters<TeamRepository['updateTeam']>[1],
    );
  }
  async join(slug: string, userId: string) {
    const team = await this.team(slug);
    const existing = await this.repository.member(team.id, userId);
    if (existing) return { status: 'ALREADY_MEMBER', member: existing };
    if (team.joinPolicy === 'OPEN')
      return {
        status: 'JOINED',
        member: await this.repository.addMember(team.id, userId, 'MEMBER'),
      };
    if (team.joinPolicy === 'REQUEST') {
      const pending = await this.repository.pendingJoinRequest(team.id, userId);
      if (pending)
        throw Object.assign(new Error('JOIN_REQUEST_PENDING'), {
          code: 'JOIN_REQUEST_PENDING',
          status: 409,
        });
      return {
        status: 'REQUESTED',
        request: await this.repository.createJoinRequest({
          teamId: team.id,
          userId,
          message: null,
        }),
      };
    }
    throw Object.assign(new Error('INVITE_ONLY'), {
      code: 'INVITE_ONLY',
      status: 403,
    });
  }
  async leave(slug: string, userId: string) {
    const { team, member } = await this.actor(slug, userId);
    if (!member)
      throw Object.assign(new Error('NOT_MEMBER'), {
        code: 'NOT_MEMBER',
        status: 409,
      });
    if (
      member.role === 'OWNER' &&
      (await this.repository.countOwners(team.id)) <= 1
    )
      throw Object.assign(new Error('TEAM_OWNER_TRANSFER_REQUIRED'), {
        code: 'TEAM_OWNER_TRANSFER_REQUIRED',
        status: 409,
      });
    await this.repository.removeMember(team.id, userId);
    return { status: 'LEFT' };
  }
  async members(slug: string, userId: string, limit: number, cursor?: string) {
    const { team, member } = await this.actor(slug, userId);
    this.require(member, 'MEMBER');
    return this.repository.members(team.id, limit, cursor);
  }
  async changeRole(
    slug: string,
    actorId: string,
    targetId: string,
    role: TeamRole,
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'OWNER');
    if (!['OWNER', 'MANAGER', 'MEMBER'].includes(role))
      throw Object.assign(new Error('INVALID_TEAM_ROLE'), {
        code: 'INVALID_TEAM_ROLE',
        status: 400,
      });
    const target = await this.repository.member(team.id, targetId);
    if (!target)
      throw Object.assign(new Error('MEMBER_NOT_FOUND'), {
        code: 'MEMBER_NOT_FOUND',
        status: 404,
      });
    if (
      target.role === 'OWNER' &&
      role !== 'OWNER' &&
      (await this.repository.countOwners(team.id)) <= 1
    )
      throw Object.assign(new Error('LAST_OWNER'), {
        code: 'LAST_OWNER',
        status: 409,
      });
    if (role === 'OWNER' && target.role !== 'OWNER')
      throw Object.assign(new Error('OWNERSHIP_TRANSFER_REQUIRED'), {
        code: 'OWNERSHIP_TRANSFER_REQUIRED',
        status: 409,
      });
    return this.repository.setRole(team.id, targetId, role);
  }
  async remove(slug: string, actorId: string, targetId: string) {
    const { team, member } = await this.actor(slug, actorId);
    const actorMember = this.require(member, 'MANAGER');
    const target = await this.repository.member(team.id, targetId);
    if (!target)
      throw Object.assign(new Error('MEMBER_NOT_FOUND'), {
        code: 'MEMBER_NOT_FOUND',
        status: 404,
      });
    if (roleRank(target.role) >= roleRank(actorMember.role))
      throw Object.assign(new Error('TEAM_FORBIDDEN'), {
        code: 'TEAM_FORBIDDEN',
        status: 403,
      });
    await this.repository.removeMember(team.id, targetId);
    return { status: 'REMOVED' };
  }
  async invite(
    slug: string,
    actorId: string,
    input: { invitedUserId: string; expiresAt?: string },
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    if (await this.repository.member(team.id, input.invitedUserId))
      throw Object.assign(new Error('ALREADY_MEMBER'), {
        code: 'ALREADY_MEMBER',
        status: 409,
      });
    if (await this.repository.pendingInvitation(team.id, input.invitedUserId))
      throw Object.assign(new Error('INVITATION_PENDING'), {
        code: 'INVITATION_PENDING',
        status: 409,
      });
    return this.repository.createInvitation({
      teamId: team.id,
      invitedUserId: input.invitedUserId,
      invitedBy: actorId,
      expiresAt:
        input.expiresAt ?? new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  }
  async acceptInvitation(id: string, userId: string) {
    const invite = await this.repository.invitation(id);
    if (!invite || invite.invitedUserId !== userId)
      throw Object.assign(new Error('INVITATION_NOT_FOUND'), {
        code: 'INVITATION_NOT_FOUND',
        status: 404,
      });
    if (invite.status !== 'PENDING' || new Date(invite.expiresAt) <= new Date())
      throw Object.assign(new Error('INVITATION_EXPIRED'), {
        code: 'INVITATION_EXPIRED',
        status: 409,
      });
    const m = await this.repository.addMember(invite.teamId, userId, 'MEMBER');
    await this.repository.updateInvitation(id, 'ACCEPTED');
    return m;
  }
  async declineInvitation(id: string, userId: string) {
    const invite = await this.repository.invitation(id);
    if (!invite || invite.invitedUserId !== userId)
      throw Object.assign(new Error('INVITATION_NOT_FOUND'), {
        code: 'INVITATION_NOT_FOUND',
        status: 404,
      });
    return this.repository.updateInvitation(id, 'DECLINED');
  }
  async revokeInvitation(id: string, actorId: string) {
    const invite = await this.repository.invitation(id);
    if (!invite)
      throw Object.assign(new Error('INVITATION_NOT_FOUND'), {
        code: 'INVITATION_NOT_FOUND',
        status: 404,
      });
    const team = await this.repository.getTeamById(invite.teamId);
    if (!team)
      throw Object.assign(new Error('TEAM_NOT_FOUND'), {
        code: 'TEAM_NOT_FOUND',
        status: 404,
      });
    const { member } = await this.actor(team.slug, actorId);
    this.require(member, 'MANAGER');
    return this.repository.updateInvitation(id, 'REVOKED');
  }
  async reviewRequest(
    slug: string,
    actorId: string,
    id: string,
    approve: boolean,
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    const request = await this.repository.joinRequest(id);
    if (!request || request.teamId !== team.id)
      throw Object.assign(new Error('JOIN_REQUEST_NOT_FOUND'), {
        code: 'JOIN_REQUEST_NOT_FOUND',
        status: 404,
      });
    if (request.status !== 'PENDING') return request;
    const updated = await this.repository.updateJoinRequest(
      id,
      approve ? 'APPROVED' : 'REJECTED',
      actorId,
    );
    if (approve)
      await this.repository.addMember(team.id, request.userId, 'MEMBER');
    return updated;
  }
  async cancelJoinRequest(id: string, userId: string) {
    const request = await this.repository.joinRequest(id);
    if (!request || request.userId !== userId)
      throw Object.assign(new Error('JOIN_REQUEST_NOT_FOUND'), {
        code: 'JOIN_REQUEST_NOT_FOUND',
        status: 404,
      });
    if (request.status !== 'PENDING') return request;
    return this.repository.updateJoinRequest(id, 'CANCELLED', userId);
  }
  async inviteCode(
    slug: string,
    actorId: string,
    input: { expiresAt: string | null; maxUses: number | null },
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    return this.repository.createInviteCode({
      teamId: team.id,
      createdBy: actorId,
      ...input,
    });
  }
  async joinCode(code: string, userId: string) {
    const record = await this.repository.findInviteCode(
      createHash('sha256').update(code).digest('hex'),
    );
    if (!record)
      throw Object.assign(new Error('INVALID_INVITE_CODE'), {
        code: 'INVALID_INVITE_CODE',
        status: 409,
      });
    if (await this.repository.member(record.teamId, userId))
      throw Object.assign(new Error('ALREADY_MEMBER'), {
        code: 'ALREADY_MEMBER',
        status: 409,
      });
    const claimed = await this.repository.useInviteCode(record.id);
    if (!claimed)
      throw Object.assign(new Error('INVALID_INVITE_CODE'), {
        code: 'INVALID_INVITE_CODE',
        status: 409,
      });
    const member = await this.repository.addMember(
      record.teamId,
      userId,
      'MEMBER',
    );
    return member;
  }
  async revokeInviteCode(slug: string, actorId: string, id: string) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    const code = await this.repository.getInviteCode(id);
    if (!code || code.teamId !== team.id)
      throw Object.assign(new Error('INVITE_CODE_NOT_FOUND'), {
        code: 'INVITE_CODE_NOT_FOUND',
        status: 404,
      });
    return this.repository.revokeInviteCode(id);
  }
}
