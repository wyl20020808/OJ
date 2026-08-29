export type JudgeJobStatus =
  | 'QUEUED'
  | 'LEASED_FAKE'
  | 'SUCCEEDED_FAKE'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL'
  | 'CANCELLED'
  | 'LEASED'
  | 'COMPLETED'
  | 'RETRYABLE_FAILURE'
  | 'TERMINAL_FAILURE';
export type JudgeJob = {
  id: string;
  submissionId: string;
  idempotencyKey: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  status: JudgeJobStatus;
  attempt: number;
  maxAttempts: number;
  leaseOwner?: string | undefined;
  leaseToken?: string | undefined;
  leaseExpiresAt?: string | undefined;
  failureReason?: string | undefined;
  syntheticFixtureId?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};
export type JudgeJobCreateInput = {
  submissionId: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  idempotencyKey?: string;
  maxAttempts?: number;
};
export type JudgeJobClaim = { job: JudgeJob; leaseToken: string };
export type SyntheticJudgeResult = {
  kind: 'SYNTHETIC_QUALIFICATION_ONLY';
  outcome: 'FIXTURE_PASS' | 'FIXTURE_FAIL';
  jobId: string;
  attempt: number;
  fixtureId: string;
};
export type JudgeJobRepository = {
  enqueue(
    input: JudgeJobCreateInput,
  ): Promise<{ job: JudgeJob; created: boolean }>;
  getById(id: string): Promise<JudgeJob | undefined>;
  getBySubmissionId(id: string): Promise<JudgeJob | undefined>;
  claim(workerId: string, leaseMs: number): Promise<JudgeJobClaim | undefined>;
  complete(id: string, token: string, fixtureId: string): Promise<JudgeJob>;
  retry(id: string, token: string, reason: string): Promise<JudgeJob>;
  recoverStale(now?: Date): Promise<number>;
  failTerminal(id: string, token: string, reason: string): Promise<JudgeJob>;
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
export class JudgeJobPayloadError extends Error {
  constructor(message = 'Malformed judge job payload') {
    super(message);
    this.name = 'JudgeJobPayloadError';
  }
}
