import { createHash, randomUUID } from 'node:crypto';

export type Checker = 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
export type ObjectRef = {
  objectId: string;
  key: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
};
export type JudgeDefaults = {
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
  checker: Checker;
  allowedLanguageProfiles: string[];
};
export type DraftTestcase = {
  testcaseId: string;
  ordinal: number;
  label: string | null;
  input: ObjectRef;
  expectedOutput: ObjectRef;
  timeLimitMsOverride: number | null;
  memoryLimitBytesOverride: number | null;
  outputLimitBytesOverride: number | null;
  effectiveTimeLimitMs: number;
  effectiveMemoryLimitBytes: number;
  effectiveOutputLimitBytes: number;
  createdAt: string;
  updatedAt: string;
};
export type JudgeDraft = {
  problemId: string;
  status: 'DRAFT' | 'VALIDATED';
  revision: number;
  defaults: JudgeDefaults;
  testcases: DraftTestcase[];
  updatedAt: string;
  updatedBy: string;
  manifestSha256?: string;
};
export type JudgeDataVersion = {
  versionId: string;
  problemId: string;
  versionNumber: number;
  manifestSha256: string;
  testcaseCount: number;
  checker: Checker;
  createdAt: string;
  publishedAt: string;
  publishedBy: string;
  testcases: DraftTestcase[];
  problemRevisionId?: string;
  testdataVersionId?: string;
  testcaseSetId?: string;
};
export type JudgeDataHandoff = {
  problemId: string;
  judgeDataVersionId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  manifestSha256: string;
  checker: Checker;
  executionProfileId: 'cpp20-gcc-13-v1';
  allowedLanguageProfiles: readonly string[];
  testcases: readonly {
    testcaseId: string;
    ordinal: number;
    input: ObjectRef;
    expectedOutput: ObjectRef;
    inputSha256: string;
    expectedOutputSha256: string;
    timeLimitMs: number;
    memoryLimitBytes: number;
    outputLimitBytes: number;
  }[];
};
export type JudgeDataRepository = {
  getDraft(problemId: string): Promise<JudgeDraft | undefined>;
  saveDraft(draft: JudgeDraft, expectedRevision?: number): Promise<JudgeDraft>;
  getVersion(
    problemId: string,
    versionId: string,
  ): Promise<JudgeDataVersion | undefined>;
  listVersions(problemId: string): Promise<JudgeDataVersion[]>;
  publish(
    draft: JudgeDraft,
    actor: string,
    expectedRevision?: number,
  ): Promise<JudgeDataVersion>;
};
export class JudgeDataError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'JudgeDataError';
  }
}
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export const validateLimit = (value: unknown, max = 1_073_741_824): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > max
  )
    throw new JudgeDataError('INVALID_LIMIT', 'Invalid limit');
  return value;
};
export const validateDefaults = (value: unknown): JudgeDefaults => {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== 'object') throw new JudgeDataError('INVALID_LIMIT');
  const checker = v.checker;
  if (checker !== 'EXACT_BYTES' && checker !== 'TOKEN_WHITESPACE')
    throw new JudgeDataError('VALIDATION_FAILED', 'Invalid checker');
  const profiles = v.allowedLanguageProfiles;
  if (
    !Array.isArray(profiles) ||
    profiles.some((p) => typeof p !== 'string' || p.length > 128)
  )
    throw new JudgeDataError('VALIDATION_FAILED', 'Invalid language profiles');
  return {
    timeLimitMs: validateLimit(v.timeLimitMs, 600_000),
    memoryLimitBytes: validateLimit(v.memoryLimitBytes),
    outputLimitBytes: validateLimit(v.outputLimitBytes),
    checker,
    allowedLanguageProfiles: [...new Set(profiles)],
  };
};
export const effective = (
  override: number | null | undefined,
  fallback: number,
) => override ?? fallback;
export const manifestHash = (
  problemId: string,
  version: number,
  defaults: JudgeDefaults,
  cases: readonly DraftTestcase[],
) =>
  sha256(
    [
      '2C.4',
      problemId,
      String(version),
      defaults.checker,
      ...defaults.allowedLanguageProfiles,
      ...cases
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal)
        .flatMap((c) => [
          String(c.ordinal),
          c.testcaseId,
          c.input.sha256,
          c.expectedOutput.sha256,
          String(c.effectiveTimeLimitMs),
          String(c.effectiveMemoryLimitBytes),
          String(c.effectiveOutputLimitBytes),
        ]),
    ].join('\0'),
  );
