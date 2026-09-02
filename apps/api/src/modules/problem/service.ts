import {
  ProblemNotFoundError,
  type AuthorizationPolicy,
  type AuthContext,
  type Problem,
  type ProblemProjection,
  type ProblemCreateInput,
  type ProblemUpdateInput,
  type AuditHook,
  type ProblemStatus,
} from './model.js';
import { validateCreate, validateUpdate } from './validation.js';
import type { ProblemRepository } from './repository.js';

export class ProblemService {
  constructor(
    private readonly repository: ProblemRepository,
    private readonly policy: AuthorizationPolicy,
    private readonly audit?: AuditHook,
    private readonly guardGuestMutation?: (
      action: 'create' | 'update' | 'transition',
      context: AuthContext,
    ) => Promise<void>,
  ) {}
  async list(query: {
    limit: number;
    offset?: number;
    context?: AuthContext;
    search?: string;
    status?: Problem['status'];
    visibility?: Problem['visibility'];
  }) {
    const filter = query.context
      ? { ownedOrPublicBy: query.context.userId }
      : { publicOnly: true as const };
    const result = await this.repository.list({
      limit: query.limit,
      ...(query.offset === undefined ? {} : { offset: query.offset }),
      ...filter,
      ...(query.search ? { search: query.search } : {}),
      ...(query.context && query.status ? { status: query.status } : {}),
      ...(query.context && query.visibility
        ? { visibility: query.visibility }
        : {}),
    });
    return {
      ...result,
      items: await Promise.all(
        result.items.map((problem) => this.project(problem, query.context)),
      ),
    };
  }
  async home() {
    const recent = await this.repository.list({
      limit: 6,
      offset: 0,
      publicOnly: true,
    });
    return { recentProblems: recent.items };
  }
  async detail(key: string, context?: AuthContext): Promise<ProblemProjection> {
    const row = await this.repository.get(key);
    if (!row) throw new ProblemNotFoundError();
    if (row.visibility === 'public' && row.status === 'published')
      return this.project(row, context);
    if (
      !context ||
      !(await this.policy.can('read', 'problem', context, {
        id: row.id,
        type: 'problem',
      }))
    )
      throw new ProblemNotFoundError();
    return this.project(row, context);
  }
  async create(raw: unknown, context?: AuthContext) {
    if (!context || !(await this.policy.can('create', 'problem', context)))
      throw new Error('FORBIDDEN');
    await this.guardGuestMutation?.('create', context);
    const input = validateCreate(raw);
    if (input.status === 'published' && input.visibility !== 'public')
      throw new Error('VALIDATION_ERROR');
    const result = await this.repository.create({
      ...input,
      authorId: context.userId,
      visibility: input.visibility ?? 'private',
    });
    await this.audit?.record({
      actorUserId: context.userId,
      action: 'problem:create',
      resource: 'problem',
      resourceId: result.id,
      outcome: 'success',
      occurredAt: new Date().toISOString(),
    });
    return result;
  }
  async update(key: string, raw: unknown, context?: AuthContext) {
    const current = await this.repository.get(key);
    if (!current) throw new ProblemNotFoundError();
    if (
      !context ||
      !(await this.policy.can('update', 'problem', context, {
        id: current.id,
        type: 'problem',
      }))
    )
      throw new Error('FORBIDDEN');
    await this.guardGuestMutation?.('update', context);
    const patch = validateUpdate(raw);
    const result =
      current.status === 'published'
        ? await this.repository.createRevision(key, patch, context.userId)
        : await this.repository.update(key, patch);
    await this.audit?.record({
      actorUserId: context.userId,
      action: 'problem:update',
      resource: 'problem',
      resourceId: current.id,
      outcome: 'success',
      occurredAt: new Date().toISOString(),
    });
    return result;
  }
  async transition(
    key: string,
    transition: {
      visibility?: Problem['visibility'];
      status?: Problem['status'];
    },
    context?: AuthContext,
  ) {
    const current = await this.repository.get(key);
    if (!current) throw new ProblemNotFoundError();
    if (
      !context ||
      !(await this.policy.can('transition', 'problem', context, {
        id: current.id,
        type: 'problem',
      }))
    )
      throw new Error('FORBIDDEN');
    await this.guardGuestMutation?.('transition', context);
    const allowed: Record<ProblemStatus, ProblemStatus[]> = {
      draft: ['published', 'archived'],
      published: ['archived'],
      archived: [],
    };
    if (
      transition.status &&
      !allowed[current.status].includes(transition.status)
    )
      throw new Error('INVALID_TRANSITION');
    if (
      transition.status === 'published' &&
      (transition.visibility ?? current.visibility) !== 'public'
    )
      throw new Error('VALIDATION_ERROR');
    const result = await this.repository.update(
      key,
      transition as ProblemUpdateInput,
    );
    await this.audit?.record({
      actorUserId: context.userId,
      action: `problem:${transition.status ?? 'visibility'}`,
      resource: 'problem',
      resourceId: current.id,
      outcome: 'success',
      occurredAt: new Date().toISOString(),
    });
    return result;
  }
  async history(key: string, context?: AuthContext) {
    const row = await this.repository.get(key);
    if (!row) throw new ProblemNotFoundError();
    if (
      !context ||
      !(await this.policy.can('read', 'problem', context, {
        id: row.id,
        type: 'problem',
      }))
    )
      throw new Error('FORBIDDEN');
    return this.repository.revisions(key);
  }
  static createInput(input: unknown): ProblemCreateInput {
    return validateCreate(input);
  }
  private async project(
    problem: Problem,
    context?: AuthContext,
  ): Promise<ProblemProjection> {
    const canEdit = Boolean(
      context &&
      (await this.policy.can('update', 'problem', context, {
        id: problem.id,
        type: 'problem',
      })),
    );
    return { ...problem, capabilities: { canEdit } };
  }
}
