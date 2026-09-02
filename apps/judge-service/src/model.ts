import type {
  JudgeExecutionMode,
  JudgeJobCreateInput,
  TestcaseSetManifest,
} from '@ojplatform/judge-runtime';

export const JUDGE_SERVICE_API_VERSION = 'v1' as const;
export type JudgeServiceVerdict = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
export type JudgeServiceStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED_WITH_VERDICT'
  | 'CANCELLED'
  | 'INFRA_FAILED'
  | 'NO_VERDICT';

export type JudgeServiceTestcaseDetail = {
  ordinal: number;
  verdict: JudgeServiceVerdict;
  timeMs?: number;
  memoryBytes?: number;
  exitCode?: number;
  runtimeReasonCode?: string;
  runtimeReason?: string;
};

export type JudgeServiceDetail = {
  testcaseCount: number;
  completedTestcaseCount: number;
  totalTimeMs?: number;
  peakMemoryBytes?: number;
  compile?: {
    status: 'FAILED';
    durationMs?: number;
    diagnostics?: string;
    truncated: boolean;
  };
  testcases: JudgeServiceTestcaseDetail[];
};

export type SubmitJudgeJobRequest = Omit<
  JudgeJobCreateInput,
  'submissionId' | 'ownerUserId' | 'idempotencyKey'
> & {
  clientRequestId: string;
  externalSubmissionId: string;
  opaqueMetadata?: Record<string, string>;
};

export type JudgeServiceResult = {
  apiVersion: typeof JUDGE_SERVICE_API_VERSION;
  judgeJobId: string;
  externalSubmissionId: string;
  evaluationGeneration: number;
  status: JudgeServiceStatus;
  attemptGeneration: number;
  languageId: string;
  executionMode: JudgeExecutionMode;
  testcaseSetId?: string;
  manifestHash?: string;
  verdict?: JudgeServiceVerdict;
  resultDigest?: string;
  completedAt?: string;
  detail?: JudgeServiceDetail;
  acceptedAt: string;
  updatedAt: string;
};

export type StoredJudgeServiceJob = {
  clientRequestId: string;
  request: SubmitJudgeJobRequest;
  result: JudgeServiceResult;
};

export type JudgeServiceCapabilities = {
  apiVersion: typeof JUDGE_SERVICE_API_VERSION;
  languages: readonly ['cpp20'];
  languageProfiles: readonly ['cpp20-gcc-13-v1'];
  checkers: readonly ['EXACT_BYTES', 'TOKEN_WHITESPACE'];
  verdicts: readonly JudgeServiceVerdict[];
  multiNodeDynamicManagement: 'NOT_YET_QUALIFIED';
  advancedFeatures: {
    specialJudge: false;
    interactive: false;
    scoring: false;
    multiLanguage: false;
  };
};

export type StoredQueueRequest = JudgeJobCreateInput & {
  testcaseSet?: TestcaseSetManifest;
};
