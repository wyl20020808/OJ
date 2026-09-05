import { createHash } from 'node:crypto';
import {
  builtinCheckerConfigSha256,
  testcaseSetManifestHash,
} from './testcase-set.js';

export const JUDGE_ARTIFACT_FORMAT = 'judge-artifact-v1' as const;
export const JUDGE_ARTIFACT_JOB_CONTRACT = 'judge-artifact-job-v1' as const;
export const ARTIFACT_EXECUTION_CONTRACT = 'artifact-execution-v1' as const;
export const ARTIFACT_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const ARTIFACT_MAX_TOTAL_INPUT_BYTES = 256 * 1024 * 1024;
export const ARTIFACT_MAX_TOTAL_OUTPUT_BYTES = 256 * 1024 * 1024;
export const ARTIFACT_MAX_MANIFEST_BYTES = 256 * 1024;
export type ArtifactObject = {
  objectId: string;
  sizeBytes: number;
  sha256: string;
};
export type ArtifactTestcase = {
  index: number;
  testcaseId: string;
  testdataVersionId: string;
  input: ArtifactObject;
  expectedOutput: ArtifactObject;
  inputSha256: string;
  expectedOutputSha256: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  checkerType: 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
  checkerVersion: 'builtin-v1';
  checkerConfigSha256: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
};
export type ArtifactManifest = {
  formatVersion: typeof JUDGE_ARTIFACT_FORMAT;
  judgeDataVersionId: string;
  createdAt: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  manifestHash: string;
  entries: readonly ArtifactTestcase[];
};
export type JudgeArtifactReference = {
  id: string;
  reference: string;
  formatVersion: typeof JUDGE_ARTIFACT_FORMAT;
  judgeDataVersionId: string;
  contentLength: number;
  sha256: string;
  createdAt: string;
  inputBytes: number;
  outputBytes: number;
  testcaseCount: number;
  manifest: ArtifactManifest;
};
export class JudgeArtifactContractError extends Error {
  readonly code = 'INVALID_ARTIFACT_CONTRACT';
  readonly status = 409;
  readonly retryable = false;
  constructor() {
    super('INVALID_ARTIFACT_CONTRACT');
    this.name = 'JudgeArtifactContractError';
  }
}
const fail = (): never => {
  throw new JudgeArtifactContractError();
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
};
const opaque = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const digest = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const size = (value: unknown, max: number, min = 0) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
// Stable across PostgreSQL jsonb and Go's sorted JSON object serialization.
function canonicalMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalMetadata);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalMetadata(item)]),
    );
  return value;
}
export const artifactManifestBytes = (value: ArtifactManifest) =>
  Buffer.from(JSON.stringify(canonicalMetadata(value)));
const hash = (value: Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

export function createJudgeArtifact(
  manifest: ArtifactManifest,
): JudgeArtifactReference {
  const bytes = artifactManifestBytes(manifest);
  const sha256 = hash(bytes);
  const reference: JudgeArtifactReference = {
    id: sha256,
    reference: `judge-artifact:${sha256}`,
    formatVersion: JUDGE_ARTIFACT_FORMAT,
    judgeDataVersionId: manifest.judgeDataVersionId,
    contentLength: bytes.length,
    sha256,
    createdAt: manifest.createdAt,
    inputBytes: manifest.entries.reduce((s, e) => s + e.input.sizeBytes, 0),
    outputBytes: manifest.entries.reduce(
      (s, e) => s + e.expectedOutput.sizeBytes,
      0,
    ),
    testcaseCount: manifest.entries.length,
    manifest,
  };
  assertJudgeArtifact(reference);
  return reference;
}

export function assertJudgeArtifact(
  value: unknown,
): asserts value is JudgeArtifactReference {
  const ref = record(value);
  keys(ref, [
    'id',
    'reference',
    'formatVersion',
    'judgeDataVersionId',
    'contentLength',
    'sha256',
    'createdAt',
    'inputBytes',
    'outputBytes',
    'testcaseCount',
    'manifest',
  ]);
  if (
    !digest(ref.id) ||
    ref.sha256 !== ref.id ||
    ref.reference !== `judge-artifact:${String(ref.id)}` ||
    ref.formatVersion !== JUDGE_ARTIFACT_FORMAT ||
    !opaque(ref.judgeDataVersionId) ||
    !size(ref.contentLength, ARTIFACT_MAX_MANIFEST_BYTES, 1) ||
    !size(ref.inputBytes, ARTIFACT_MAX_TOTAL_INPUT_BYTES) ||
    !size(ref.outputBytes, ARTIFACT_MAX_TOTAL_OUTPUT_BYTES) ||
    !size(ref.testcaseCount, 64, 1)
  )
    fail();
  const m = record(ref.manifest);
  keys(m, [
    'formatVersion',
    'judgeDataVersionId',
    'createdAt',
    'problemId',
    'problemRevisionId',
    'testdataVersionId',
    'testcaseSetId',
    'executionProfileId',
    'manifestHash',
    'entries',
  ]);
  if (
    m.formatVersion !== JUDGE_ARTIFACT_FORMAT ||
    m.judgeDataVersionId !== ref.judgeDataVersionId ||
    m.createdAt !== ref.createdAt ||
    typeof m.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(m.createdAt)) ||
    ![
      'problemId',
      'problemRevisionId',
      'testdataVersionId',
      'testcaseSetId',
    ].every((key) => opaque(m[key])) ||
    m.executionProfileId !== 'cpp20-gcc-13-v1' ||
    !digest(m.manifestHash) ||
    !Array.isArray(m.entries) ||
    m.entries.length !== ref.testcaseCount
  )
    fail();
  const identities = new Set<string>();
  let inputBytes = 0;
  let outputBytes = 0;
  for (const [index, value] of (m.entries as unknown[]).entries()) {
    const e = record(value);
    keys(e, [
      'index',
      'testcaseId',
      'testdataVersionId',
      'input',
      'expectedOutput',
      'inputSha256',
      'expectedOutputSha256',
      'executionProfileId',
      'checkerType',
      'checkerVersion',
      'checkerConfigSha256',
      'timeLimitMs',
      'memoryLimitBytes',
      'outputLimitBytes',
    ]);
    if (
      e.index !== index ||
      !opaque(e.testcaseId) ||
      identities.has(String(e.testcaseId)) ||
      e.testdataVersionId !== m.testdataVersionId ||
      e.executionProfileId !== m.executionProfileId ||
      !['EXACT_BYTES', 'TOKEN_WHITESPACE'].includes(String(e.checkerType)) ||
      e.checkerVersion !== 'builtin-v1' ||
      e.checkerConfigSha256 !==
        builtinCheckerConfigSha256(
          e.checkerType as ArtifactTestcase['checkerType'],
        ) ||
      !size(e.timeLimitMs, 600_000, 1) ||
      !size(e.memoryLimitBytes, 4 * 1024 ** 3, 1) ||
      !size(e.outputLimitBytes, 64 * 1024, 1)
    )
      fail();
    identities.add(String(e.testcaseId));
    for (const [field, hashField] of [
      ['input', 'inputSha256'],
      ['expectedOutput', 'expectedOutputSha256'],
    ] as const) {
      const object = record(e[field]);
      keys(object, ['objectId', 'sizeBytes', 'sha256']);
      if (
        typeof object.objectId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(object.objectId) ||
        object.objectId === 'manifest' ||
        !size(object.sizeBytes, ARTIFACT_MAX_FILE_BYTES) ||
        !digest(object.sha256) ||
        object.sha256 !== e[hashField]
      )
        fail();
      if (field === 'input') inputBytes += Number(object.sizeBytes);
      else outputBytes += Number(object.sizeBytes);
    }
  }
  if (inputBytes !== ref.inputBytes || outputBytes !== ref.outputBytes) fail();
  const typed = value as JudgeArtifactReference;
  const bytes = artifactManifestBytes(typed.manifest);
  if (bytes.length !== ref.contentLength || hash(bytes) !== ref.sha256) fail();
  const metadata = {
    ...typed.manifest,
    entries: typed.manifest.entries.map((e) => ({
      ...e,
      input: '',
      expectedOutput: '',
    })),
  };
  if (testcaseSetManifestHash(metadata) !== m.manifestHash) fail();
}
