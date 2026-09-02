export type IntakeStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'LEASED'
  | 'RETRYABLE_FAILURE'
  | 'PROTOCOL_FAILURE'
  | 'CANCELLED'
  | 'EXECUTION_COMPLETED'
  | 'SYNTHETIC_COMPLETED';

export type SubmissionVerdict = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
export type SubmissionEvaluationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED_WITH_VERDICT'
  | 'CANCELLED'
  | 'INFRA_FAILED'
  | 'NO_VERDICT'
  | 'INCOMPLETE'
  | 'REJUDGE_PENDING'
  | 'REJUDGING';

export type SubmissionEvaluation = {
  submissionId: string;
  evaluationGeneration: number;
  attemptGeneration: number;
  judgeJobId: string;
  testcaseSetId?: string;
  manifestHash?: string;
  verdictRecordDigest?: string;
  evaluationRecordDigest: string;
  status: SubmissionEvaluationStatus;
  verdict?: SubmissionVerdict;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  current: boolean;
};

export type SubmissionOutcome = Pick<
  SubmissionEvaluation,
  'submissionId' | 'evaluationGeneration' | 'status' | 'verdict' | 'completedAt'
> & {
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
};

export type Submission = {
  id: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  judgeDataVersionId?: string;
  judgeDataVersionNumber?: number;
  judgeDataManifestSha256?: string;
  languageId: string;
  source: string;
  status: IntakeStatus;
  createdAt: string;
  updatedAt: string;
  judgeJobId?: string;
  attempt?: number;
  maxAttempts?: number;
  retryAt?: string | null;
  failureCode?: string | null;
  synthetic?: boolean;
};

export type SubmissionCreateInput = {
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  source: string;
};

export type SubmissionCreateRequest = Omit<
  SubmissionCreateInput,
  'testdataVersionRef'
> & { testdataVersionRef?: string };

export type SubmissionJudgeBinding = {
  judgeDataVersionId: string;
  judgeDataVersionNumber: number;
  judgeDataManifestSha256: string;
  testdataVersionRef: string;
};

export type SubmissionListQuery = {
  limit: number;
  cursor?: string;
  ownerUserId?: string;
  problemId?: string;
};

export type AuthContext = {
  userId: string;
  sessionId?: string;
  strength?: string;
};

export type SubmissionAuthorizationPolicy = {
  canSubmit(
    user: AuthContext,
    problemRevision: { problemId: string; revisionId: string },
  ): Promise<boolean> | boolean;
  canViewSubmission(
    user: AuthContext,
    submission: Pick<Submission, 'id' | 'ownerUserId' | 'problemId'>,
  ): Promise<boolean> | boolean;
  listOwnSubmissions(user: AuthContext): Promise<boolean> | boolean;
};

export type ProblemRevisionReference = {
  problemId: string;
  revisionId: string;
  testdataVersionRef: string | null;
};

export type ProblemRevisionResolver = {
  getRevision(
    problemId: string,
    revisionId: string,
  ): Promise<ProblemRevisionReference | undefined>;
};

export type SubmissionJudgeDataResolver = {
  bind(
    problemId: string,
    problemRevisionId: string,
    languageId: string,
  ): Promise<SubmissionJudgeBinding>;
};

export class SubmissionValidationError extends Error {
  readonly details: Record<string, string>;
  constructor(details: Record<string, string>) {
    super('Submission validation failed');
    this.name = 'SubmissionValidationError';
    this.details = details;
  }
}

export class SubmissionNotFoundError extends Error {
  constructor() {
    super('Submission not found');
    this.name = 'SubmissionNotFoundError';
  }
}

export class SubmissionConflictError extends Error {
  constructor() {
    super('Submission already exists');
    this.name = 'SubmissionConflictError';
  }
}
