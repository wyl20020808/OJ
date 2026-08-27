import {
  ProblemNotFoundError,
  type AuthorizationPolicy,
  type AuthContext,
  type Problem,
  type ProblemCreateInput,
  type ProblemUpdateInput,
} from './model.js';
import { validateCreate, validateUpdate } from './validation.js';
import type { ProblemRepository } from './repository.js';

export class ProblemService {
  constructor(
    private readonly repository: ProblemRepository,
    private readonly policy: AuthorizationPolicy,
  ) {}
  async list(query: { limit: number; offset: number; context?: AuthContext }) {
    const filter = query.context ? {} : { publicOnly: true as const };
    return this.repository.list({
      limit: query.limit,
      offset: query.offset,
      ...filter,
    });
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
    return this.repository.create({ ...input, authorId: context.userId });
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
    return this.repository.update(key, validateUpdate(raw));
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
    if (
      transition.status === 'published' &&
      transition.visibility !== undefined &&
      transition.visibility !== 'public'
    )
      throw new Error('VALIDATION_ERROR');
    return this.repository.update(key, transition as ProblemUpdateInput);
  }
  static createInput(input: unknown): ProblemCreateInput {
    return validateCreate(input);
  }
}
