import type {
  SubmissionAuthorizationPolicy,
  AuthContext,
  ProblemRevisionResolver,
  Submission,
  SubmissionCreateRequest,
  SubmissionJudgeDataResolver,
  GlobalSubmissionListQuery,
} from './model.js';
import { SubmissionNotFoundError } from './model.js';
import { validateCreate } from './validation.js';
import type { SubmissionRepository } from './repository.js';

export class SubmissionService {
  constructor(
    private readonly repository: SubmissionRepository,
    private readonly policy: SubmissionAuthorizationPolicy,
    private readonly problems: ProblemRevisionResolver,
    private readonly judgeData?: SubmissionJudgeDataResolver,
    private readonly guardCreate?: (context: AuthContext) => Promise<void>,
  ) {}
  async create(raw: unknown, context?: AuthContext) {
    if (!context) throw new Error('UNAUTHENTICATED');
    await this.guardCreate?.(context);
    const input = validateCreate(raw);
    const revision = await this.problems.getRevision(
      input.problemId,
      input.problemRevisionId,
    );
    if (!revision || revision.problemId !== input.problemId)
      throw new Error('VALIDATION_ERROR');
    if (
      !(await this.policy.canSubmit(context, {
        problemId: revision.problemId,
        revisionId: revision.revisionId,
      }))
    )
      throw new Error('FORBIDDEN');
    const binding = this.judgeData
      ? await this.judgeData.bind(
          input.problemId,
          input.problemRevisionId,
          input.languageId,
        )
      : undefined;
    const testdataVersionRef =
      binding?.testdataVersionRef ?? revision.testdataVersionRef;
    if (
      !testdataVersionRef ||
      (input.testdataVersionRef &&
        input.testdataVersionRef !== testdataVersionRef)
    )
      throw new Error('VALIDATION_ERROR');
    return this.repository.create({
      ...input,
      testdataVersionRef,
      ...binding,
      ownerUserId: context.userId,
    });
  }
  async list(
    query: { limit: number; cursor?: string; problemId?: string },
    context?: AuthContext,
  ) {
    if (!context) throw new Error('UNAUTHENTICATED');
    if (query.cursor && !/^[A-Za-z0-9_-]+$/.test(query.cursor))
      throw new Error('VALIDATION_ERROR');
    if (!(await this.policy.listOwnSubmissions(context)))
      throw new Error('FORBIDDEN');
    return this.repository.list({ ...query, ownerUserId: context.userId });
  }
  async detail(id: string, context?: AuthContext): Promise<Submission> {
    if (!context) throw new Error('UNAUTHENTICATED');
    const submission = await this.repository.get(id);
    if (!submission) throw new SubmissionNotFoundError();
    if (!(await this.policy.canViewSubmission(context, submission)))
      throw new Error('FORBIDDEN');
    return submission;
  }
  async listGlobal(query: GlobalSubmissionListQuery, context?: AuthContext) {
    if (query.cursor && !/^[A-Za-z0-9_-]+$/.test(query.cursor))
      throw new Error('VALIDATION_ERROR');
    if (context &&
      !(await (this.policy.canListGlobalSubmissions?.(context) ??
        this.policy.listOwnSubmissions(context)))
    )
      throw new Error('FORBIDDEN');
    try {
      return await this.repository.listGlobal(query);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CURSOR')
        throw new Error('VALIDATION_ERROR');
      throw error;
    }
  }
  async problemHistory(
    problemId: string,
    query: { limit: number; cursor?: string },
    context?: AuthContext,
  ) {
    return this.list({ ...query, problemId }, context);
  }
  static createInput(input: unknown): SubmissionCreateRequest {
    return validateCreate(input);
  }
}
