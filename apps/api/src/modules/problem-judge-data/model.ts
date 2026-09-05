import { createHash, randomUUID } from 'node:crypto';
import type { JudgeArtifactReference } from '@ojplatform/judge-runtime';
import { MAX_TESTCASE_PAYLOAD_BYTES } from './limits.js';
import {
  BUILTIN_CHECKER_VERSION,
  builtinCheckerConfigSha256,
  testcaseSetManifestHash,
  TESTCASE_SET_PROTOCOL_VERSION,
} from '../judge/testcase-set.js';

export type Checker = 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
export type ExecutionProfileId = 'cpp20-gcc-13-v1';
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
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  executionProfileId: ExecutionProfileId;
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
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  executionProfileId: ExecutionProfileId;
  allowedLanguageProfiles: string[];
};
export type JudgeDataHandoff = {
  problemId: string;
  judgeDataVersionId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  manifestSha256: string;
  checker: Checker;
  executionProfileId: ExecutionProfileId;
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
  saveArtifact(
    artifact: JudgeArtifactReference,
  ): Promise<JudgeArtifactReference>;
  getArtifact(id: string): Promise<JudgeArtifactReference | undefined>;
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
    profiles.length < 1 ||
    profiles.some((p) => typeof p !== 'string' || p.length > 128)
  )
    throw new JudgeDataError('VALIDATION_FAILED', 'Invalid language profiles');
  if (profiles.some((p) => p !== 'cpp20-gcc-13-v1'))
    throw new JudgeDataError(
      'VALIDATION_FAILED',
      'Unsupported language profile',
    );
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
export const validateObjectRef = (value: unknown): ObjectRef => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new JudgeDataError('INVALID_PAIR', 'Invalid object reference');
  const v = value as Record<string, unknown>;
  if (
    typeof v.objectId !== 'string' ||
    !v.objectId ||
    typeof v.key !== 'string' ||
    !v.key ||
    typeof v.fileName !== 'string' ||
    !v.fileName ||
    v.fileName.length > 255 ||
    v.fileName.includes('\\') ||
    v.fileName.includes('\0') ||
    v.fileName.startsWith('/') ||
    v.fileName
      .split('/')
      .some((part) => part === '.' || part === '..' || part === '') ||
    typeof v.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.sha256)
  )
    throw new JudgeDataError('INVALID_PAIR', 'Invalid object reference');
  if (
    typeof v.sizeBytes !== 'number' ||
    !Number.isSafeInteger(v.sizeBytes) ||
    v.sizeBytes < 0 ||
    v.sizeBytes > MAX_TESTCASE_PAYLOAD_BYTES
  )
    throw new JudgeDataError('INVALID_PAIR', 'Invalid object reference');
  const size = v.sizeBytes;
  return {
    objectId: v.objectId,
    key: v.key,
    fileName: v.fileName,
    sizeBytes: size,
    sha256: v.sha256,
  };
};
export const canonicalManifestHash = (
  identity: Pick<
    JudgeDraft,
    | 'problemId'
    | 'problemRevisionId'
    | 'testdataVersionId'
    | 'testcaseSetId'
    | 'executionProfileId'
    | 'defaults'
  >,
  cases: readonly DraftTestcase[],
) =>
  testcaseSetManifestHash({
    problemId: identity.problemId,
    problemRevisionId: identity.problemRevisionId,
    testdataVersionId: identity.testdataVersionId,
    testcaseSetId: identity.testcaseSetId,
    executionProfileId: identity.executionProfileId,
    entries: cases
      .slice()
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((c, index) => ({
        index,
        testcaseId: c.testcaseId,
        testdataVersionId: identity.testdataVersionId,
        input: '',
        inputSha256: c.input.sha256,
        executionProfileId: identity.executionProfileId,
        expectedOutputSha256: c.expectedOutput.sha256,
        checkerType: identity.defaults.checker,
        checkerVersion: BUILTIN_CHECKER_VERSION,
        checkerConfigSha256: builtinCheckerConfigSha256(
          identity.defaults.checker,
        ),
      })),
  });
export const manifestProtocolVersion = TESTCASE_SET_PROTOCOL_VERSION;
