export type IntakeStatus = 'PENDING' | 'QUEUED';

export type Submission = {
  id: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  source: string;
  status: IntakeStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionCreateInput = {
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  source: string;
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
