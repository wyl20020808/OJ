export type JudgeJobStatus =
  'QUEUED' | 'LEASED' | 'COMPLETED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE';

export type JudgeJob = {
  id: string;
  submissionId: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  status: JudgeJobStatus;
  attempt: number;
  maxAttempts: number;
  leaseToken?: string | undefined;
  leaseExpiresAt?: string | undefined;
  workerId?: string | undefined;
  failureReason?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type JudgeJobCreateInput = Omit<
  JudgeJob,
  | 'id'
  | 'status'
  | 'attempt'
  | 'maxAttempts'
  | 'leaseToken'
  | 'leaseExpiresAt'
  | 'workerId'
  | 'failureReason'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
> & { maxAttempts?: number };

export type JudgeJobClaim = { job: JudgeJob; leaseToken: string };

export type SyntheticJudgeResult = {
  kind: 'SYNTHETIC_QUALIFICATION_ONLY';
  outcome: 'FIXTURE_PASS' | 'FIXTURE_FAIL';
  jobId: string;
  attempt: number;
};

export type JudgeJobRepository = {
  enqueue(
    input: JudgeJobCreateInput,
  ): Promise<{ job: JudgeJob; created: boolean }>;
  getById(id: string): Promise<JudgeJob | undefined>;
  getBySubmissionId(submissionId: string): Promise<JudgeJob | undefined>;
  claim(workerId: string, leaseMs: number): Promise<JudgeJobClaim | undefined>;
  complete(id: string, leaseToken: string): Promise<JudgeJob>;
  retry(id: string, leaseToken: string, reason: string): Promise<JudgeJob>;
  recoverStale(now?: Date): Promise<number>;
  failTerminal(
    id: string,
    leaseToken: string,
    reason: string,
  ): Promise<JudgeJob>;
};

export class JudgeJobConflictError extends Error {
  constructor(message = 'Judge job lease conflict') {
    super(message);
    this.name = 'JudgeJobConflictError';
  }
}

export class JudgeJobNotFoundError extends Error {
  constructor() {
    super('Judge job not found');
    this.name = 'JudgeJobNotFoundError';
  }
}
