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
export type JudgeExecutionMode =
  'SAFE_FIXTURE_QUALIFICATION' | 'REAL_SANDBOXED_EXECUTION';
export type RawExecutionResult = {
  protocol_version: '2C.1';
  execution_request_id: string;
  judge_job_id: string;
  submission_id: string;
  attempt: number;
  execution_attempt_id?: string;
  compile_attempt_id?: string;
  runtime_attempt_id?: string;
  result_generation?: number;
  correlation_id: string;
  language_profile_id: 'cpp20-gcc-13-v1';
  source_sha256: string;
  pipeline_outcome:
    | 'PIPELINE_COMPLETED'
    | 'PIPELINE_COMPILE_FAILED'
    | 'PIPELINE_LIMIT_HIT'
    | 'PIPELINE_CANCELLED'
    | 'PIPELINE_INFRA_FAILURE';
  compile: Record<string, unknown>;
  artifact?: Record<string, unknown> | undefined;
  runtime?: Record<string, unknown> | undefined;
  started_at: string;
  completed_at: string;
  clean: boolean;
};
export type JudgeJob = {
  id: string;
  submissionId: string;
  idempotencyKey: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  executionMode: JudgeExecutionMode;
  languageProfileId?: 'cpp20-gcc-13-v1' | undefined;
  sourceSnapshotRef?: string | undefined;
  sourceBytes?: string | undefined;
  sourceSha256?: string | undefined;
  controlledInputId?: 'stdin-empty-v1' | 'stdin-echo-v1' | undefined;
  rawExecutionResult?: RawExecutionResult | undefined;
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
  executionRequestId?: string | undefined;
  executionAttemptId?: string | undefined;
  resultGeneration?: number | undefined;
  rawResultDigest?: string | undefined;
  cancellationGeneration?: number | undefined;
};
export type JudgeJobCreateInput = {
  submissionId: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string;
  languageId: string;
  executionMode?: JudgeExecutionMode;
  languageProfileId?: 'cpp20-gcc-13-v1';
  sourceSnapshotRef?: string;
  sourceBytes?: string;
  sourceSha256?: string;
  controlledInputId?: 'stdin-empty-v1' | 'stdin-echo-v1';
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
  claimById(
    id: string,
    workerId: string,
    leaseMs: number,
  ): Promise<JudgeJobClaim | undefined>;
  complete(id: string, token: string, fixtureId: string): Promise<JudgeJob>;
  completeReal?(
    id: string,
    token: string,
    result: RawExecutionResult,
  ): Promise<JudgeJob>;
  retry(id: string, token: string, reason: string): Promise<JudgeJob>;
  recoverStale(now?: Date): Promise<number>;
  failTerminal(id: string, token: string, reason: string): Promise<JudgeJob>;
  cancel?(id: string): Promise<JudgeJob>;
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
