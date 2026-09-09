import type { Problem, ProblemRepository } from '../problem/index.js';
import type { SubmissionRepository } from '../submission/index.js';
import type { TeamService } from '../team/index.js';
import type {
  Assignment,
  AssignmentDetail,
  AssignmentListItem,
  AssignmentStatus,
} from './model.js';
import type { AssignmentRepository } from './repository.js';

type Actor = { userId: string };
const error = (code: string, status: number) =>
  Object.assign(new Error(code), { code, status });

export class AssignmentService {
  constructor(
    public readonly repository: AssignmentRepository,
    private readonly teams: TeamService,
    private readonly problems: ProblemRepository,
    private readonly submissions: SubmissionRepository,
  ) {}

  private async teamActor(slug: string, userId: string) {
    const actor = await this.teams.assignmentActor(slug, userId);
    if (!actor.member) throw error('TEAM_FORBIDDEN', 403);
    return { team: actor.team, member: actor.member };
  }
  private requireManager(role: string) {
    if (role !== 'OWNER' && role !== 'MANAGER')
      throw error('ASSIGNMENT_FORBIDDEN', 403);
  }
  private validateTimes(startsAt: string | null, dueAt: string | null) {
    if (
      (startsAt && Number.isNaN(Date.parse(startsAt))) ||
      (dueAt && Number.isNaN(Date.parse(dueAt)))
    )
      throw error('INVALID_ASSIGNMENT_TIME', 400);
    if (startsAt && dueAt && Date.parse(dueAt) <= Date.parse(startsAt))
      throw error('INVALID_ASSIGNMENT_TIME', 400);
  }
  private async resolveProblems(
    ids: string[],
    actorId: string,
  ): Promise<Problem[]> {
    if (!ids.length) throw error('ASSIGNMENT_REQUIRES_PROBLEM', 400);
    if (new Set(ids).size !== ids.length)
      throw error('DUPLICATE_ASSIGNMENT_PROBLEM', 409);
    const values: Problem[] = [];
    for (const key of ids) {
      const problem = await this.problems.get(key);
      if (
        !problem ||
        problem.deletedAt ||
        problem.status !== 'published' ||
        (problem.visibility !== 'public' && problem.authorId !== actorId)
      )
        throw error('PROBLEM_NOT_ASSIGNABLE', 403);
      values.push(problem);
    }
    return values;
  }
  private async loadProblems(ids: string[]) {
    if (!ids.length) return [];
    if (this.problems.getMany) return this.problems.getMany(ids);
    return Promise.all(ids.map((id) => this.problems.get(id))).then((rows) =>
      rows.filter((row): row is Problem => Boolean(row)),
    );
  }
  async create(
    slug: string,
    actor: Actor,
    input: {
      title: string;
      description?: string;
      startsAt?: string | null;
      dueAt?: string | null;
      problemIds: string[];
      status?: AssignmentStatus;
    },
  ) {
    const { team, member } = await this.teamActor(slug, actor.userId);
    this.requireManager(member.role);
    const title = input.title.trim();
    if (!title || title.length > 120)
      throw error('INVALID_ASSIGNMENT_TITLE', 400);
    const startsAt = input.startsAt ?? null;
    const dueAt = input.dueAt ?? null;
    this.validateTimes(startsAt, dueAt);
    const status = input.status ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PUBLISHED')
      throw error('ASSIGNMENT_INVALID_STATE', 400);
    if (status === 'PUBLISHED' && !input.problemIds.length)
      throw error('ASSIGNMENT_REQUIRES_PROBLEM', 400);
    const resolvedProblems = input.problemIds.length
      ? await this.resolveProblems(input.problemIds, actor.userId)
      : [];
    const assignment = await this.repository.create({
      teamId: team.id,
      title,
      description: input.description ?? '',
      startsAt,
      dueAt,
      status,
      createdBy: actor.userId,
    });
    await this.repository.replaceProblems(
      assignment.id,
      resolvedProblems.map((problem) => problem.id),
    );
    return this.detailFor(assignment, actor.userId);
  }
  async listTeam(slug: string, userId: string) {
    const { team, member } = await this.teamActor(slug, userId);
    const rows = await this.repository.listByTeam(team.id);
    const accepted = await this.acceptedProblems(userId);
    return Promise.all(
      rows
        .filter((row) => row.status !== 'DRAFT' || member.role !== 'MEMBER')
        .map((row) => this.detailFor(row, userId, team, accepted)),
    );
  }
  async listMine(userId: string) {
    const rows = await this.repository.listMine(userId);
    const accepted = await this.acceptedProblems(userId);
    const result: AssignmentListItem[] = [];
    for (const row of rows) {
      const team = await this.teams.teamById(row.teamId);
      const member = team
        ? await this.teams.assignmentActor(team.slug, userId)
        : undefined;
      if (!team || !member?.member || row.status === 'DRAFT') continue;
      result.push(await this.detailFor(row, userId, team, accepted));
    }
    return result;
  }
  async get(publicId: string, userId: string) {
    const row = await this.repository.getByPublicId(publicId);
    if (!row) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const team = await this.teams.teamById(row.teamId);
    if (!team) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const { member } = await this.teamActor(team.slug, userId);
    if (row.status === 'DRAFT' && member.role === 'MEMBER')
      throw error('ASSIGNMENT_NOT_FOUND', 404);
    return this.detailFor(row, userId, team);
  }
  async update(
    publicId: string,
    userId: string,
    patch: {
      title?: string;
      description?: string;
      startsAt?: string | null;
      dueAt?: string | null;
      problemIds?: string[];
    },
  ) {
    const row = await this.repository.getByPublicId(publicId);
    if (!row) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const team = await this.teams.teamById(row.teamId);
    if (!team) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const { member } = await this.teamActor(team.slug, userId);
    this.requireManager(member.role);
    if (row.status === 'CLOSED') throw error('ASSIGNMENT_CLOSED', 409);
    const startsAt =
      patch.startsAt === undefined ? row.startsAt : patch.startsAt;
    const dueAt = patch.dueAt === undefined ? row.dueAt : patch.dueAt;
    this.validateTimes(startsAt, dueAt);
    if (patch.title !== undefined && !patch.title.trim())
      throw error('INVALID_ASSIGNMENT_TITLE', 400);
    const resolvedProblems = patch.problemIds
      ? await this.resolveProblems(patch.problemIds, userId)
      : undefined;
    await this.repository.update(row.id, {
      ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
      ...(patch.description === undefined
        ? {}
        : { description: patch.description }),
      startsAt,
      dueAt,
    });
    if (resolvedProblems)
      await this.repository.replaceProblems(
        row.id,
        resolvedProblems.map((problem) => problem.id),
      );
    return this.get(publicId, userId);
  }
  async setStatus(
    publicId: string,
    userId: string,
    status: 'PUBLISHED' | 'CLOSED',
  ) {
    const row = await this.repository.getByPublicId(publicId);
    if (!row) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const team = await this.teams.teamById(row.teamId);
    if (!team) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const { member } = await this.teamActor(team.slug, userId);
    this.requireManager(member.role);
    if (status === 'PUBLISHED' && row.status !== 'DRAFT')
      throw error('ASSIGNMENT_INVALID_STATE', 409);
    if (status === 'CLOSED' && row.status !== 'PUBLISHED')
      throw error('ASSIGNMENT_INVALID_STATE', 409);
    if (status === 'PUBLISHED') {
      const relations = await this.repository.problems(row.id);
      await this.resolveProblems(
        relations.map((item) => item.problemId),
        userId,
      );
    }
    await this.repository.setStatus(row.id, status);
    return this.get(publicId, userId);
  }
  private async acceptedProblems(userId: string) {
    const accepted = new Set<string>();
    const submissions = await this.submissions.listGlobal({
      ownerUserId: userId,
      verdict: 'AC',
      limit: 1000,
    });
    for (const submission of submissions.items)
      accepted.add(submission.problemId);
    return accepted;
  }
  private async detailFor(
    row: Assignment,
    userId: string,
    knownTeam?: { id: string; slug: string; name: string },
    acceptedSet?: Set<string>,
  ): Promise<AssignmentDetail> {
    const team = knownTeam ?? (await this.teams.teamById(row.teamId));
    if (!team) throw error('ASSIGNMENT_NOT_FOUND', 404);
    const { member } = await this.teams.assignmentActor(team.slug, userId);
    const canManage = member?.role === 'OWNER' || member?.role === 'MANAGER';
    const relations = await this.repository.problems(row.id);
    const accepted =
      acceptedSet ??
      (relations.length
        ? await this.acceptedProblems(userId)
        : new Set<string>());
    const loaded = await this.loadProblems(relations.map((item) => item.problemId));
    const byId = new Map(loaded.map((problem) => [problem.id, problem]));
    const problemItems = relations.flatMap((relation) => {
      const problem = byId.get(relation.problemId);
      return problem
        ? [{
            publicId: problem.publicId,
            title: problem.title,
            problemId: problem.id,
            displayOrder: relation.displayOrder,
            completed: accepted.has(problem.id),
          }]
        : [];
    });
    const completedCount = problemItems.filter((item) => item.completed).length;
    return {
      ...row,
      team: { slug: team.slug, name: team.name },
      problemCount: problemItems.length,
      completedCount,
      capabilities: {
        canView: true,
        canEdit: Boolean(canManage && row.status !== 'CLOSED'),
        canPublish: Boolean(canManage && row.status === 'DRAFT'),
        canClose: Boolean(canManage && row.status === 'PUBLISHED'),
      },
      problems: problemItems,
    };
  }
}
