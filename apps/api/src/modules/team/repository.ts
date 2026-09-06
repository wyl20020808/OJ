import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  Team,
  TeamInvitation,
  TeamInviteCode,
  TeamJoinRequest,
  TeamMember,
  TeamRole,
  TeamVisibility,
  TeamJoinPolicy,
  InvitationStatus,
  JoinRequestStatus,
} from './model.js';

export type TeamRepository = {
  createTeam(input: {
    name: string;
    slug: string;
    description: string;
    avatarUrl?: string | null;
    visibility: TeamVisibility;
    joinPolicy: TeamJoinPolicy;
    ownerId: string;
  }): Promise<Team>;
  getTeam(slug: string): Promise<Team | null>;
  getTeamById(id: string): Promise<Team | null>;
  listPublic(
    limit: number,
    cursor?: string,
  ): Promise<{ items: Team[]; nextCursor?: string }>;
  listMine(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{
    items: Array<Team & { role: TeamRole; memberCount: number }>;
    nextCursor?: string;
  }>;
  updateTeam(
    slug: string,
    patch: Partial<
      Pick<
        Team,
        'name' | 'description' | 'avatarUrl' | 'visibility' | 'joinPolicy'
      >
    >,
  ): Promise<Team | null>;
  member(teamId: string, userId: string): Promise<TeamMember | null>;
  countMembers(teamId: string): Promise<number>;
  members(
    teamId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: TeamMember[]; nextCursor?: string }>;
  addMember(
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<TeamMember>;
  removeMember(teamId: string, userId: string): Promise<boolean>;
  setRole(
    teamId: string,
    userId: string,
    role: TeamRole,
  ): Promise<TeamMember | null>;
  countOwners(teamId: string): Promise<number>;
  createInvitation(
    input: Omit<TeamInvitation, 'id' | 'createdAt' | 'status'>,
  ): Promise<TeamInvitation>;
  invitation(id: string): Promise<TeamInvitation | null>;
  updateInvitation(
    id: string,
    status: InvitationStatus,
  ): Promise<TeamInvitation | null>;
  pendingInvitation(
    teamId: string,
    invitedUserId: string,
  ): Promise<TeamInvitation | null>;
  createJoinRequest(
    input: Omit<
      TeamJoinRequest,
      'id' | 'createdAt' | 'status' | 'reviewedBy' | 'reviewedAt'
    >,
  ): Promise<TeamJoinRequest>;
  joinRequest(id: string): Promise<TeamJoinRequest | null>;
  pendingJoinRequest(
    teamId: string,
    userId: string,
  ): Promise<TeamJoinRequest | null>;
  listJoinRequests(
    teamId: string,
    status?: JoinRequestStatus,
  ): Promise<TeamJoinRequest[]>;
  updateJoinRequest(
    id: string,
    status: JoinRequestStatus,
    reviewer: string,
  ): Promise<TeamJoinRequest | null>;
  createInviteCode(input: {
    teamId: string;
    createdBy: string;
    expiresAt: string | null;
    maxUses: number | null;
  }): Promise<{ record: TeamInviteCode; code: string }>;
  findInviteCode(hash: string): Promise<TeamInviteCode | null>;
  getInviteCode(id: string): Promise<TeamInviteCode | null>;
  useInviteCode(id: string): Promise<TeamInviteCode | null>;
  revokeInviteCode(id: string): Promise<TeamInviteCode | null>;
  approveJoinRequest(
    id: string,
    reviewer: string,
  ): Promise<{ request: TeamJoinRequest; member: TeamMember } | null>;
  acceptInvitation(id: string, userId: string): Promise<TeamMember | null>;
  joinWithInviteCode(id: string, userId: string): Promise<TeamMember | null>;
};

const cursorEncode = (value: string) =>
  Buffer.from(value).toString('base64url');
const cursorDecode = (value?: string) => {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return decoded && decoded.length <= 128 ? decoded : undefined;
  } catch {
    return undefined;
  }
};

export class InMemoryTeamRepository implements TeamRepository {
  readonly teams = new Map<string, Team>();
  readonly membersMap = new Map<string, TeamMember>();
  readonly invitations = new Map<string, TeamInvitation>();
  readonly requests = new Map<string, TeamJoinRequest>();
  readonly codes = new Map<string, TeamInviteCode>();
  async createTeam(input: Parameters<TeamRepository['createTeam']>[0]) {
    const now = new Date().toISOString();
    const team: Team = {
      id: randomUUID(),
      slug: input.slug,
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl ?? null,
      visibility: input.visibility,
      joinPolicy: input.joinPolicy,
      ownerId: input.ownerId,
      createdAt: now,
      updatedAt: now,
    };
    if ([...this.teams.values()].some((t) => t.slug === team.slug))
      throw Object.assign(new Error('TEAM_SLUG_CONFLICT'), {
        code: 'TEAM_SLUG_CONFLICT',
      });
    this.teams.set(team.slug, team);
    await this.addMember(team.id, input.ownerId, 'OWNER');
    return team;
  }
  async getTeam(slug: string) {
    return [...this.teams.values()].find((t) => t.slug === slug) ?? null;
  }
  async getTeamById(id: string) {
    return [...this.teams.values()].find((t) => t.id === id) ?? null;
  }
  async listPublic(limit: number, cursor?: string) {
    const all = [...this.teams.values()]
      .filter((t) => t.visibility === 'PUBLIC')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const decodedCursor = cursorDecode(cursor);
    const start = decodedCursor
      ? Math.max(0, all.findIndex((x) => x.id === decodedCursor) + 1)
      : 0;
    const items = all.slice(start, start + limit);
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.id) }
        : {}),
    };
  }
  async listMine(userId: string, limit: number, cursor?: string) {
    const all = [...this.teams.values()]
      .filter((t) =>
        [...this.membersMap.values()].some(
          (m) => m.teamId === t.id && m.userId === userId,
        ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const decodedCursor = cursorDecode(cursor);
    const start = decodedCursor
      ? Math.max(0, all.findIndex((x) => x.id === decodedCursor) + 1)
      : 0;
    const items = all.slice(start, start + limit).map((t) => ({
      ...t,
      role: [...this.membersMap.values()].find(
        (m) => m.teamId === t.id && m.userId === userId,
      )!.role,
      memberCount: [...this.membersMap.values()].filter(
        (m) => m.teamId === t.id,
      ).length,
    }));
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.id) }
        : {}),
    };
  }
  async updateTeam(
    slug: string,
    patch: Partial<
      Pick<
        Team,
        'name' | 'description' | 'avatarUrl' | 'visibility' | 'joinPolicy'
      >
    >,
  ) {
    const t = await this.getTeam(slug);
    if (!t) return null;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    return t;
  }
  async member(teamId: string, userId: string) {
    return (
      [...this.membersMap.values()].find(
        (m) => m.teamId === teamId && m.userId === userId,
      ) ?? null
    );
  }
  async countMembers(teamId: string) {
    return [...this.membersMap.values()].filter((m) => m.teamId === teamId)
      .length;
  }
  async members(teamId: string, limit: number, cursor?: string) {
    const all = [...this.membersMap.values()]
      .filter((m) => m.teamId === teamId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    const decodedCursor = cursorDecode(cursor);
    const start = decodedCursor
      ? Math.max(0, all.findIndex((x) => x.userId === decodedCursor) + 1)
      : 0;
    const items = all.slice(start, start + limit);
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.userId) }
        : {}),
    };
  }
  async addMember(teamId: string, userId: string, role: TeamRole) {
    const existing = await this.member(teamId, userId);
    if (existing) return existing;
    const member: TeamMember = {
      teamId,
      userId,
      username: userId,
      displayName: userId,
      role,
      joinedAt: new Date().toISOString(),
    };
    this.membersMap.set(`${teamId}:${userId}`, member);
    return member;
  }
  async removeMember(teamId: string, userId: string) {
    return this.membersMap.delete(`${teamId}:${userId}`);
  }
  async setRole(teamId: string, userId: string, role: TeamRole) {
    const m = await this.member(teamId, userId);
    if (!m) return null;
    m.role = role;
    return m;
  }
  async countOwners(teamId: string) {
    return [...this.membersMap.values()].filter(
      (m) => m.teamId === teamId && m.role === 'OWNER',
    ).length;
  }
  async createInvitation(
    input: Omit<TeamInvitation, 'id' | 'createdAt' | 'status'>,
  ) {
    const x = {
      ...input,
      id: randomUUID(),
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };
    this.invitations.set(x.id, x);
    return x;
  }
  async invitation(id: string) {
    return this.invitations.get(id) ?? null;
  }
  async updateInvitation(id: string, status: InvitationStatus) {
    const x = await this.invitation(id);
    if (!x) return null;
    x.status = status;
    return x;
  }
  async pendingInvitation(teamId: string, invitedUserId: string) {
    return (
      [...this.invitations.values()].find(
        (x) =>
          x.teamId === teamId &&
          x.invitedUserId === invitedUserId &&
          x.status === 'PENDING' &&
          new Date(x.expiresAt) > new Date(),
      ) ?? null
    );
  }
  async createJoinRequest(
    input: Omit<
      TeamJoinRequest,
      'id' | 'createdAt' | 'status' | 'reviewedBy' | 'reviewedAt'
    >,
  ) {
    const x = {
      ...input,
      id: randomUUID(),
      status: 'PENDING' as const,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.requests.set(x.id, x);
    return x;
  }
  async joinRequest(id: string) {
    return this.requests.get(id) ?? null;
  }
  async pendingJoinRequest(teamId: string, userId: string) {
    return (
      [...this.requests.values()].find(
        (x) =>
          x.teamId === teamId && x.userId === userId && x.status === 'PENDING',
      ) ?? null
    );
  }
  async listJoinRequests(teamId: string, status?: JoinRequestStatus) {
    return [...this.requests.values()].filter(
      (x) => x.teamId === teamId && (!status || x.status === status),
    );
  }
  async updateJoinRequest(
    id: string,
    status: JoinRequestStatus,
    reviewer: string,
  ) {
    const x = await this.joinRequest(id);
    if (!x) return null;
    x.status = status;
    x.reviewedBy = reviewer;
    x.reviewedAt = new Date().toISOString();
    return x;
  }
  async createInviteCode(input: {
    teamId: string;
    createdBy: string;
    expiresAt: string | null;
    maxUses: number | null;
  }) {
    const code = randomBytes(24).toString('base64url');
    const record: TeamInviteCode = {
      id: randomUUID(),
      ...input,
      codeHash: createHash('sha256').update(code).digest('hex'),
      usedCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.codes.set(record.id, record);
    return { record, code };
  }
  async findInviteCode(hash: string) {
    return (
      [...this.codes.values()].find(
        (x) =>
          x.codeHash === hash &&
          x.isActive &&
          (!x.expiresAt || new Date(x.expiresAt) > new Date()) &&
          (x.maxUses === null || x.usedCount < x.maxUses),
      ) ?? null
    );
  }
  async getInviteCode(id: string) {
    return this.codes.get(id) ?? null;
  }
  async useInviteCode(id: string) {
    const x = this.codes.get(id);
    if (
      !x ||
      !x.isActive ||
      (x.expiresAt !== null && new Date(x.expiresAt) <= new Date()) ||
      (x.maxUses !== null && x.usedCount >= x.maxUses)
    )
      return null;
    x.usedCount++;
    if (x.maxUses !== null && x.usedCount >= x.maxUses) x.isActive = false;
    return x;
  }
  async revokeInviteCode(id: string) {
    const x = this.codes.get(id);
    if (!x) return null;
    x.isActive = false;
    return x;
  }
  async approveJoinRequest(id: string, reviewer: string) {
    const request = await this.joinRequest(id);
    if (!request || request.status !== 'PENDING') return null;
    const member = await this.addMember(
      request.teamId,
      request.userId,
      'MEMBER',
    );
    await this.updateJoinRequest(id, 'APPROVED', reviewer);
    return { request: (await this.joinRequest(id))!, member };
  }
  async acceptInvitation(id: string, userId: string) {
    const invite = await this.invitation(id);
    if (
      !invite ||
      invite.invitedUserId !== userId ||
      invite.status !== 'PENDING'
    )
      return null;
    const member = await this.addMember(invite.teamId, userId, 'MEMBER');
    await this.updateInvitation(id, 'ACCEPTED');
    return member;
  }
  async joinWithInviteCode(id: string, userId: string) {
    const code = await this.getInviteCode(id);
    if (
      !code ||
      !code.isActive ||
      (code.expiresAt !== null && new Date(code.expiresAt) <= new Date()) ||
      (code.maxUses !== null && code.usedCount >= code.maxUses)
    )
      return null;
    const existing = await this.member(code.teamId, userId);
    if (existing) return existing;
    if (!(await this.useInviteCode(id))) return null;
    return this.addMember(code.teamId, userId, 'MEMBER');
  }
}

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
};
type QueryClient = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
  release(): void;
};
type QueryPool = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
  connect(): Promise<QueryClient>;
};
export class PostgresTeamRepository implements TeamRepository {
  constructor(private readonly pool: QueryPool) {}
  async createTeam(input: Parameters<TeamRepository['createTeam']>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        'INSERT INTO teams(slug,name,description,avatar_url,visibility,join_policy,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          input.slug,
          input.name,
          input.description,
          input.avatarUrl ?? null,
          input.visibility,
          input.joinPolicy,
          input.ownerId,
        ],
      );
      const row = r.rows[0]!;
      await client.query(
        "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'OWNER')",
        [row.id, input.ownerId],
      );
      await client.query('COMMIT');
      return mapTeam(row);
    } catch (e) {
      await client.query('ROLLBACK');
      if ((e as { code?: string }).code === '23505')
        throw Object.assign(new Error('TEAM_SLUG_CONFLICT'), {
          code: 'TEAM_SLUG_CONFLICT',
        });
      throw e;
    } finally {
      client.release();
    }
  }
  async getTeam(slug: string) {
    const r = await this.pool.query('SELECT * FROM teams WHERE slug=$1', [
      slug,
    ]);
    return r.rows[0] ? mapTeam(r.rows[0]) : null;
  }
  async getTeamById(id: string) {
    const r = await this.pool.query('SELECT * FROM teams WHERE id=$1', [id]);
    return r.rows[0] ? mapTeam(r.rows[0]) : null;
  }
  async listPublic(limit: number, cursor?: string) {
    const decodedCursor = cursorDecode(cursor);
    const r = await this.pool.query(
      "SELECT * FROM teams WHERE visibility='PUBLIC' AND ($1::uuid IS NULL OR id<$1) ORDER BY id DESC LIMIT $2",
      [decodedCursor ?? null, limit],
    );
    const items = r.rows.map(mapTeam);
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.id) }
        : {}),
    };
  }
  async listMine(userId: string, limit: number, cursor?: string) {
    const decodedCursor = cursorDecode(cursor);
    const r = await this.pool.query(
      'SELECT t.*,m.role,(SELECT count(*) FROM team_members x WHERE x.team_id=t.id)::int member_count FROM teams t JOIN team_members m ON m.team_id=t.id AND m.user_id=$1 WHERE ($2::uuid IS NULL OR t.id<$2) ORDER BY t.id DESC LIMIT $3',
      [userId, decodedCursor ?? null, limit],
    );
    const items = r.rows.map((x) => ({
      ...mapTeam(x),
      role: x.role as TeamRole,
      memberCount: Number(x.member_count),
    }));
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.id) }
        : {}),
    };
  }
  async updateTeam(
    slug: string,
    patch: Partial<
      Pick<
        Team,
        'name' | 'description' | 'avatarUrl' | 'visibility' | 'joinPolicy'
      >
    >,
  ) {
    const t = await this.getTeam(slug);
    if (!t) return null;
    const keys = Object.keys(patch);
    if (!keys.length) return t;
    const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
    const cols = keys.map(
      (k) =>
        (
          ({ avatarUrl: 'avatar_url', joinPolicy: 'join_policy' }) as Record<
            string,
            string
          >
        )[k] ?? k,
    );
    const r = await this.pool.query(
      `UPDATE teams SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(',')},updated_at=now() WHERE slug=$${keys.length + 1} RETURNING *`,
      [...values, slug],
    );
    return r.rows[0] ? mapTeam(r.rows[0]) : null;
  }
  async member(teamId: string, userId: string) {
    const r = await this.pool.query(
      'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2',
      [teamId, userId],
    );
    return r.rows[0] ? mapMember(r.rows[0]) : null;
  }
  async countMembers(teamId: string) {
    const r = await this.pool.query(
      'SELECT count(*)::int count FROM team_members WHERE team_id=$1',
      [teamId],
    );
    return Number(r.rows[0]?.count ?? 0);
  }
  async members(teamId: string, limit: number, cursor?: string) {
    const decodedCursor = cursorDecode(cursor);
    const r = await this.pool.query(
      'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND ($2::uuid IS NULL OR m.user_id>$2) ORDER BY m.user_id LIMIT $3',
      [teamId, decodedCursor ?? null, limit],
    );
    const items = r.rows.map(mapMember);
    return {
      items,
      ...(items.length === limit
        ? { nextCursor: cursorEncode(items.at(-1)!.userId) }
        : {}),
    };
  }
  async addMember(teamId: string, userId: string, role: TeamRole) {
    const r = await this.pool.query(
      'INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO UPDATE SET role=team_members.role RETURNING *',
      [teamId, userId, role],
    );
    return (await this.member(teamId, userId)) ?? mapMember(r.rows[0]!);
  }
  async removeMember(teamId: string, userId: string) {
    const r = await this.pool.query(
      'DELETE FROM team_members WHERE team_id=$1 AND user_id=$2',
      [teamId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async setRole(teamId: string, userId: string, role: TeamRole) {
    await this.pool.query(
      'UPDATE team_members SET role=$3 WHERE team_id=$1 AND user_id=$2',
      [teamId, userId, role],
    );
    return this.member(teamId, userId);
  }
  async countOwners(teamId: string) {
    const r = await this.pool.query(
      "SELECT count(*)::int count FROM team_members WHERE team_id=$1 AND role='OWNER'",
      [teamId],
    );
    return Number(r.rows[0]?.count ?? 0);
  }
  async createInvitation(
    input: Omit<TeamInvitation, 'id' | 'createdAt' | 'status'>,
  ) {
    const r = await this.pool.query(
      'INSERT INTO team_invitations(team_id,invited_user_id,invited_by,expires_at) VALUES($1,$2,$3,$4) RETURNING *',
      [input.teamId, input.invitedUserId, input.invitedBy, input.expiresAt],
    );
    return mapInvitation(r.rows[0]!);
  }
  async invitation(id: string) {
    const r = await this.pool.query(
      'SELECT * FROM team_invitations WHERE id=$1',
      [id],
    );
    return r.rows[0] ? mapInvitation(r.rows[0]) : null;
  }
  async updateInvitation(id: string, status: InvitationStatus) {
    const r = await this.pool.query(
      'UPDATE team_invitations SET status=$2 WHERE id=$1 RETURNING *',
      [id, status],
    );
    return r.rows[0] ? mapInvitation(r.rows[0]) : null;
  }
  async pendingInvitation(teamId: string, invitedUserId: string) {
    const r = await this.pool.query(
      "SELECT * FROM team_invitations WHERE team_id=$1 AND invited_user_id=$2 AND status='PENDING' AND expires_at>now() LIMIT 1",
      [teamId, invitedUserId],
    );
    return r.rows[0] ? mapInvitation(r.rows[0]) : null;
  }
  async createJoinRequest(
    input: Omit<
      TeamJoinRequest,
      'id' | 'createdAt' | 'status' | 'reviewedBy' | 'reviewedAt'
    >,
  ) {
    const r = await this.pool.query(
      'INSERT INTO team_join_requests(team_id,user_id,message) VALUES($1,$2,$3) RETURNING *',
      [input.teamId, input.userId, input.message],
    );
    return mapRequest(r.rows[0]!);
  }
  async joinRequest(id: string) {
    const r = await this.pool.query(
      'SELECT * FROM team_join_requests WHERE id=$1',
      [id],
    );
    return r.rows[0] ? mapRequest(r.rows[0]) : null;
  }
  async pendingJoinRequest(teamId: string, userId: string) {
    const r = await this.pool.query(
      "SELECT * FROM team_join_requests WHERE team_id=$1 AND user_id=$2 AND status='PENDING' LIMIT 1",
      [teamId, userId],
    );
    return r.rows[0] ? mapRequest(r.rows[0]) : null;
  }
  async listJoinRequests(teamId: string, status?: JoinRequestStatus) {
    const r = await this.pool.query(
      'SELECT * FROM team_join_requests WHERE team_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC',
      [teamId, status ?? null],
    );
    return r.rows.map(mapRequest);
  }
  async updateJoinRequest(
    id: string,
    status: JoinRequestStatus,
    reviewer: string,
  ) {
    const r = await this.pool.query(
      'UPDATE team_join_requests SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 RETURNING *',
      [id, status, reviewer],
    );
    return r.rows[0] ? mapRequest(r.rows[0]) : null;
  }
  async createInviteCode(input: {
    teamId: string;
    createdBy: string;
    expiresAt: string | null;
    maxUses: number | null;
  }) {
    const code = randomBytes(24).toString('base64url');
    const hash = createHash('sha256').update(code).digest('hex');
    const r = await this.pool.query(
      'INSERT INTO team_invite_codes(team_id,created_by,code_hash,expires_at,max_uses) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [input.teamId, input.createdBy, hash, input.expiresAt, input.maxUses],
    );
    return { record: mapCode(r.rows[0]!), code };
  }
  async findInviteCode(hash: string) {
    const r = await this.pool.query(
      'SELECT * FROM team_invite_codes WHERE code_hash=$1 AND is_active AND (expires_at IS NULL OR expires_at>now()) AND (max_uses IS NULL OR used_count<max_uses)',
      [hash],
    );
    return r.rows[0] ? mapCode(r.rows[0]) : null;
  }
  async getInviteCode(id: string) {
    const r = await this.pool.query(
      'SELECT * FROM team_invite_codes WHERE id=$1',
      [id],
    );
    return r.rows[0] ? mapCode(r.rows[0]) : null;
  }
  async useInviteCode(id: string) {
    const r = await this.pool.query(
      'UPDATE team_invite_codes SET used_count=used_count+1,is_active=CASE WHEN max_uses IS NOT NULL AND used_count+1>=max_uses THEN false ELSE is_active END WHERE id=$1 AND is_active AND (expires_at IS NULL OR expires_at>now()) AND (max_uses IS NULL OR used_count<max_uses) RETURNING *',
      [id],
    );
    return r.rows[0] ? mapCode(r.rows[0]) : null;
  }
  async revokeInviteCode(id: string) {
    const r = await this.pool.query(
      'UPDATE team_invite_codes SET is_active=false WHERE id=$1 RETURNING *',
      [id],
    );
    return r.rows[0] ? mapCode(r.rows[0]) : null;
  }
  async approveJoinRequest(id: string, reviewer: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT * FROM team_join_requests WHERE id=$1 FOR UPDATE',
        [id],
      );
      const requestRow = found.rows[0];
      if (!requestRow) {
        await client.query('ROLLBACK');
        return null;
      }
      if (requestRow.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'MEMBER') ON CONFLICT(team_id,user_id) DO NOTHING",
        [requestRow.team_id, requestRow.user_id],
      );
      await client.query(
        "UPDATE team_join_requests SET status='APPROVED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",
        [id, reviewer],
      );
      const memberResult = await client.query(
        'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2',
        [requestRow.team_id, requestRow.user_id],
      );
      const requestResult = await client.query(
        'SELECT * FROM team_join_requests WHERE id=$1',
        [id],
      );
      await client.query('COMMIT');
      return {
        request: mapRequest(requestResult.rows[0]!),
        member: mapMember(memberResult.rows[0]!),
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async acceptInvitation(id: string, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT * FROM team_invitations WHERE id=$1 AND invited_user_id=$2 FOR UPDATE',
        [id, userId],
      );
      const invite = found.rows[0];
      if (
        !invite ||
        invite.status !== 'PENDING' ||
        new Date(String(invite.expires_at)) <= new Date()
      ) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'MEMBER') ON CONFLICT(team_id,user_id) DO NOTHING",
        [invite.team_id, userId],
      );
      await client.query(
        "UPDATE team_invitations SET status='ACCEPTED' WHERE id=$1",
        [id],
      );
      const memberResult = await client.query(
        'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2',
        [invite.team_id, userId],
      );
      await client.query('COMMIT');
      return mapMember(memberResult.rows[0]!);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async joinWithInviteCode(id: string, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const codeResult = await client.query(
        'SELECT * FROM team_invite_codes WHERE id=$1 FOR UPDATE',
        [id],
      );
      const code = codeResult.rows[0];
      if (
        !code ||
        !code.is_active ||
        (code.expires_at && new Date(String(code.expires_at)) <= new Date()) ||
        (code.max_uses !== null &&
          Number(code.used_count) >= Number(code.max_uses))
      ) {
        await client.query('ROLLBACK');
        return null;
      }
      const existing = await client.query(
        'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2',
        [code.team_id, userId],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return mapMember(existing.rows[0]);
      }
      await client.query(
        'UPDATE team_invite_codes SET used_count=used_count+1,is_active=CASE WHEN max_uses IS NOT NULL AND used_count+1>=max_uses THEN false ELSE is_active END WHERE id=$1',
        [id],
      );
      await client.query(
        "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'MEMBER')",
        [code.team_id, userId],
      );
      const memberResult = await client.query(
        'SELECT m.*,u.username,u.display_name FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 AND m.user_id=$2',
        [code.team_id, userId],
      );
      await client.query('COMMIT');
      return mapMember(memberResult.rows[0]!);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
const mapTeam = (r: Record<string, unknown>): Team => ({
  id: String(r.id),
  slug: String(r.slug),
  name: String(r.name),
  description: String(r.description ?? ''),
  avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
  visibility: r.visibility as TeamVisibility,
  joinPolicy: r.join_policy as TeamJoinPolicy,
  ownerId: String(r.owner_id),
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
});
const mapMember = (r: Record<string, unknown>): TeamMember => ({
  teamId: String(r.team_id),
  userId: String(r.user_id),
  username: String(r.username ?? r.user_id),
  displayName: String(r.display_name ?? r.user_id),
  role: r.role as TeamRole,
  joinedAt: new Date(String(r.joined_at)).toISOString(),
});
const mapInvitation = (r: Record<string, unknown>): TeamInvitation => ({
  id: String(r.id),
  teamId: String(r.team_id),
  invitedUserId: String(r.invited_user_id),
  invitedBy: String(r.invited_by),
  status: r.status as InvitationStatus,
  expiresAt: new Date(String(r.expires_at)).toISOString(),
  createdAt: new Date(String(r.created_at)).toISOString(),
});
const mapRequest = (r: Record<string, unknown>): TeamJoinRequest => ({
  id: String(r.id),
  teamId: String(r.team_id),
  userId: String(r.user_id),
  status: r.status as JoinRequestStatus,
  message: r.message ? String(r.message) : null,
  reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
  reviewedAt: r.reviewed_at
    ? new Date(String(r.reviewed_at)).toISOString()
    : null,
  createdAt: new Date(String(r.created_at)).toISOString(),
});
const mapCode = (r: Record<string, unknown>): TeamInviteCode => ({
  id: String(r.id),
  teamId: String(r.team_id),
  createdBy: String(r.created_by),
  codeHash: String(r.code_hash),
  expiresAt: r.expires_at ? new Date(String(r.expires_at)).toISOString() : null,
  maxUses: r.max_uses === null ? null : Number(r.max_uses),
  usedCount: Number(r.used_count),
  isActive: Boolean(r.is_active),
  createdAt: new Date(String(r.created_at)).toISOString(),
});
