import {
  ProblemNotFoundError,
  type AuthorizationPolicy,
  type AuthContext,
  type Problem,
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
  ) {}
  async list(query: {
    limit: number;
    offset?: number;
    context?: AuthContext;
    search?: string;
    status?: Problem['status'];
    visibility?: Problem['visibility'];
  }) {
    const filter = query.context ? {} : { publicOnly: true as const };
    return this.repository.list({
      limit: query.limit,
      ...(query.offset === undefined ? {} : { offset: query.offset }),
      ...filter,
      ...(query.search ? { search: query.search } : {}),
      ...(query.context && query.status ? { status: query.status } : {}),
      ...(query.context && query.visibility
        ? { visibility: query.visibility }
        : {}),
    });
  }
  async home() {
    const recent = await this.repository.list({
      limit: 6,
      offset: 0,
      publicOnly: true,
    });
    return { recentProblems: recent.items };
  }
  async detail(key: string, context?: AuthContext): Promise<Problem> {
    const row = await this.repository.get(key);
    if (!row) throw new ProblemNotFoundError();
    if (row.visibility === 'public' && row.status === 'published') return row;
    if (
      !(await this.policy.can('read', 'problem', context)) ||
      row.authorId !== context?.userId
    )
      throw new ProblemNotFoundError();
    return row;
  }
  async create(raw: unknown, context?: AuthContext) {
    if (!context || !(await this.policy.can('create', 'problem', context)))
      throw new Error('FORBIDDEN');
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
      current.authorId !== context.userId ||
      !(await this.policy.can('update', 'problem', context))
    )
      throw new Error('FORBIDDEN');
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
      current.authorId !== context.userId ||
      !(await this.policy.can('transition', 'problem', context))
    )
      throw new Error('FORBIDDEN');
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
      row.authorId !== context.userId ||
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
}
