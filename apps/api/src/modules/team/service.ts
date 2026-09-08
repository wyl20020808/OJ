import { createHash } from 'node:crypto';
import type { TeamRepository } from './repository.js';
import { roleRank, type TeamRole } from './model.js';
import type { AuditHook } from '../authz/types.js';
type AuditContext = { requestId?: string };

export class TeamService {
  constructor(
    public readonly repository: TeamRepository,
    private readonly audit?: AuditHook,
  ) {}
  private async record(
    actorUserId: string,
    action: string,
    teamId: string,
    requestId?: string,
    resourceId?: string,
  ) {
    await this.audit?.record({
      actorUserId,
      action,
      resource: 'team',
      resourceId: resourceId ?? teamId,
      outcome: 'allowed',
      requestId: requestId ?? 'internal',
      occurredAt: new Date().toISOString(),
      metadata: { teamId },
    });
  }
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
  async listPublic(limit: number, cursor?: string) {
    return this.repository.listPublic(limit, cursor);
  }
  async listMine(userId: string, limit: number, cursor?: string) {
    return this.repository.listMine(userId, limit, cursor);
  }
  async profileTeams(targetUserId: string, viewerUserId?: string) {
    const result = await this.repository.listMine(targetUserId, 100);
    return result.items.filter(
      (team) => team.visibility === 'PUBLIC' || viewerUserId === targetUserId,
    );
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
  async create(
    input: Parameters<TeamRepository['createTeam']>[0],
    context?: AuditContext,
  ) {
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
    const team = await this.repository.createTeam({ ...input, slug });
    await this.record(
      input.ownerId,
      'TEAM_CREATED',
      team.id,
      context?.requestId,
    );
    return team;
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
    context?: AuditContext,
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
    const result = await this.repository.updateTeam(
      slug,
      clean as Parameters<TeamRepository['updateTeam']>[1],
    );
    await this.record(
      userId,
      'TEAM_SETTINGS_UPDATED',
      result?.id ?? slug,
      context?.requestId,
    );
    return result;
  }
  async join(slug: string, userId: string, context?: AuditContext) {
    const team = await this.team(slug);
    const existing = await this.repository.member(team.id, userId);
    if (existing) return { status: 'ALREADY_MEMBER', member: existing };
    if (team.joinPolicy === 'OPEN') {
      const result = {
        status: 'JOINED' as const,
        member: await this.repository.addMember(team.id, userId, 'MEMBER'),
      };
      await this.record(
        userId,
        'TEAM_MEMBER_JOINED',
        team.id,
        context?.requestId,
      );
      return result;
    }
    if (team.joinPolicy === 'REQUEST') {
      const pending = await this.repository.pendingJoinRequest(team.id, userId);
      if (pending)
        throw Object.assign(new Error('JOIN_REQUEST_PENDING'), {
          code: 'JOIN_REQUEST_PENDING',
          status: 409,
        });
      const result = {
        status: 'REQUESTED',
        request: await this.repository.createJoinRequest({
          teamId: team.id,
          userId,
          message: null,
        }),
      };
      return result;
    }
    throw Object.assign(new Error('INVITE_ONLY'), {
      code: 'INVITE_ONLY',
      status: 403,
    });
  }
  async leave(slug: string, userId: string, context?: AuditContext) {
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
    await this.record(
      userId,
      'TEAM_MEMBER_LEFT',
      team.id,
      context?.requestId,
      userId,
    );
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
    context?: AuditContext,
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
    const result = await this.repository.setRole(team.id, targetId, role);
    await this.record(
      actorId,
      'TEAM_ROLE_CHANGED',
      team.id,
      context?.requestId,
      targetId,
    );
    return result;
  }
  async remove(
    slug: string,
    actorId: string,
    targetId: string,
    context?: AuditContext,
  ) {
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
    await this.record(
      actorId,
      'TEAM_MEMBER_REMOVED',
      team.id,
      context?.requestId,
      targetId,
    );
    return { status: 'REMOVED' };
  }
  async invite(
    slug: string,
    actorId: string,
    input: { invitedUserId: string; expiresAt?: string },
    context?: AuditContext,
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
    const result = await this.repository.createInvitation({
      teamId: team.id,
      invitedUserId: input.invitedUserId,
      invitedBy: actorId,
      expiresAt:
        input.expiresAt ?? new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    await this.record(
      actorId,
      'TEAM_INVITATION_CREATED',
      team.id,
      context?.requestId,
      result.id,
    );
    return result;
  }
  async acceptInvitation(id: string, userId: string, context?: AuditContext) {
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
    const m = await this.repository.acceptInvitation(id, userId);
    if (!m)
      throw Object.assign(new Error('INVITATION_CONFLICT'), {
        code: 'INVITATION_CONFLICT',
        status: 409,
      });
    await this.record(
      userId,
      'TEAM_INVITATION_ACCEPTED',
      invite.teamId,
      context?.requestId,
      id,
    );
    return m;
  }
  async declineInvitation(id: string, userId: string, context?: AuditContext) {
    const invite = await this.repository.invitation(id);
    if (!invite || invite.invitedUserId !== userId)
      throw Object.assign(new Error('INVITATION_NOT_FOUND'), {
        code: 'INVITATION_NOT_FOUND',
        status: 404,
      });
    const result = await this.repository.updateInvitation(id, 'DECLINED');
    await this.record(
      userId,
      'TEAM_INVITATION_DECLINED',
      invite.teamId,
      context?.requestId,
      id,
    );
    return result;
  }
  async revokeInvitation(id: string, actorId: string, context?: AuditContext) {
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
    if (invite.status !== 'PENDING')
      throw Object.assign(new Error('INVITATION_CONFLICT'), {
        code: 'INVITATION_CONFLICT',
        status: 409,
      });
    const { member } = await this.actor(team.slug, actorId);
    this.require(member, 'MANAGER');
    const result = await this.repository.updateInvitation(id, 'REVOKED');
    await this.record(
      actorId,
      'TEAM_INVITATION_REVOKED',
      team.id,
      context?.requestId,
      id,
    );
    return result;
  }
  async reviewRequest(
    slug: string,
    actorId: string,
    id: string,
    approve: boolean,
    context?: AuditContext,
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
    if (approve) {
      const result = await this.repository.approveJoinRequest(id, actorId);
      if (!result) {
        const current = await this.repository.joinRequest(id);
        if (current) return current;
        throw Object.assign(new Error('JOIN_REQUEST_NOT_FOUND'), {
          code: 'JOIN_REQUEST_NOT_FOUND',
          status: 404,
        });
      }
      await this.record(
        actorId,
        'TEAM_JOIN_REQUEST_APPROVED',
        team.id,
        context?.requestId,
        id,
      );
      return result.request;
    }
    const result = await this.repository.updateJoinRequest(
      id,
      'REJECTED',
      actorId,
    );
    await this.record(
      actorId,
      'TEAM_JOIN_REQUEST_REJECTED',
      team.id,
      context?.requestId,
      id,
    );
    return result;
  }
  async cancelJoinRequest(id: string, userId: string, context?: AuditContext) {
    const request = await this.repository.joinRequest(id);
    if (!request || request.userId !== userId)
      throw Object.assign(new Error('JOIN_REQUEST_NOT_FOUND'), {
        code: 'JOIN_REQUEST_NOT_FOUND',
        status: 404,
      });
    if (request.status !== 'PENDING') return request;
    const result = await this.repository.updateJoinRequest(
      id,
      'CANCELLED',
      userId,
    );
    await this.record(
      userId,
      'TEAM_JOIN_REQUEST_CANCELLED',
      request.teamId,
      context?.requestId,
      id,
    );
    return result;
  }
  async inviteCode(
    slug: string,
    actorId: string,
    input: { expiresAt: string | null; maxUses: number | null },
    context?: AuditContext,
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    const result = await this.repository.createInviteCode({
      teamId: team.id,
      createdBy: actorId,
      ...input,
    });
    await this.record(
      actorId,
      'TEAM_INVITE_CODE_CREATED',
      team.id,
      context?.requestId,
      result.record.id,
    );
    return result;
  }
  async joinCode(code: string, userId: string, context?: AuditContext) {
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
    const member = await this.repository.joinWithInviteCode(record.id, userId);
    if (!member)
      throw Object.assign(new Error('INVALID_INVITE_CODE'), {
        code: 'INVALID_INVITE_CODE',
        status: 409,
      });
    await this.record(
      userId,
      'TEAM_MEMBER_JOINED',
      record.teamId,
      context?.requestId,
    );
    return member;
  }
  async revokeInviteCode(
    slug: string,
    actorId: string,
    id: string,
    context?: AuditContext,
  ) {
    const { team, member } = await this.actor(slug, actorId);
    this.require(member, 'MANAGER');
    const code = await this.repository.getInviteCode(id);
    if (!code || code.teamId !== team.id)
      throw Object.assign(new Error('INVITE_CODE_NOT_FOUND'), {
        code: 'INVITE_CODE_NOT_FOUND',
        status: 404,
      });
    const result = await this.repository.revokeInviteCode(id);
    await this.record(
      actorId,
      'TEAM_INVITE_CODE_REVOKED',
      team.id,
      context?.requestId,
      id,
    );
    return result;
  }
}
