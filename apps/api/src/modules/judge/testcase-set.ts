import { createHash } from 'node:crypto';

export const TESTCASE_SET_PROTOCOL_VERSION = '2C.4' as const;
export const TESTCASE_SET_MAX_SIZE = 64;
export const TESTCASE_SET_MAX_INPUT_BYTES = 64 * 1024;

export type TestcaseSetPolicy = 'RUN_ALL' | 'STOP_ON_EXECUTION_BLOCKING_EVENT';

export type TestcaseSetEntry = {
  index: number;
  testcaseId: string;
  testdataVersionId: string;
  input: string;
  inputSha256: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  expectedOutputSha256?: string;
};

export type TestcaseSetManifest = {
  problemId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  entries: readonly TestcaseSetEntry[];
  manifestHash: string;
};

export type TestcaseSetRequest = {
  protocolVersion: typeof TESTCASE_SET_PROTOCOL_VERSION;
  executionSetRequestId: string;
  executionSetAttemptId: string;
  submissionId: string;
  snapshotId: string;
  sourceSha256: string;
  artifactSha256?: string;
  manifest: TestcaseSetManifest;
  policy: TestcaseSetPolicy;
};

export type TestcaseSetMemberStatus =
  | 'NOT_STARTED'
  | 'RAW_COMPLETED'
  | 'CANCELLED'
  | 'CANCELLED_BEFORE_START'
  | 'INFRA_FAILED'
  | 'SKIPPED_BY_SET_POLICY';

export type SetExecutionFacts = {
  cancelled?: boolean;
  infrastructureFailure?: boolean;
  rawBlockingEvent?: boolean;
  cleanupVerified: boolean;
};

export type SetTestcaseExecution = {
  index: number;
  testcaseId: string;
  inputSha256: string;
  testdataVersionId: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  executionSetAttemptId: string;
  status: Exclude<TestcaseSetMemberStatus, 'NOT_STARTED'>;
  record?: Readonly<Record<string, unknown>>;
  facts: SetExecutionFacts;
};

export type AggregateExecutionSetRecord = {
  recordVersion: typeof TESTCASE_SET_PROTOCOL_VERSION;
  recordId: string;
  submissionId: string;
  snapshotId: string;
  sourceSha256: string;
  artifactSha256: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  manifestHash: string;
  executionSetRequestId: string;
  executionSetAttemptId: string;
  executionProfileId: 'cpp20-gcc-13-v1';
  policy: TestcaseSetPolicy;
  totalTestcaseCount: number;
  startedTestcaseCount: number;
  completedTestcaseCount: number;
  testcases: readonly SetTestcaseExecution[];
  setCancelled: boolean;
  setInfrastructureFailure: boolean;
  stopReason:
    | 'COMPLETED'
    | 'CANCELLED'
    | 'RAW_EXECUTION_BLOCKING_EVENT'
    | 'INFRASTRUCTURE_FAILURE';
  cleanup: { verified: boolean; completed: number; failed: number };
  digest: string;
};

export type CompileOnceResult<Artifact = unknown> = {
  artifact: Artifact;
  artifactSha256: string;
};

export type RunTestcaseResult = {
  status: 'RAW_COMPLETED' | 'CANCELLED' | 'INFRA_FAILED';
  record?: Readonly<Record<string, unknown>>;
  facts: SetExecutionFacts;
};

export type TestcaseSetExecutorAdapter<Artifact = unknown> = {
  compile(request: TestcaseSetRequest): Promise<CompileOnceResult<Artifact>>;
  verifyArtifact?(artifact: Artifact, expectedSha256: string): Promise<void>;
  runTestcase(
    request: TestcaseSetRequest,
    entry: TestcaseSetEntry,
    index: number,
    artifact: Artifact,
  ): Promise<RunTestcaseResult>;
};

export class TestcaseSetContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestcaseSetContractError';
  }
}

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const validRef = (value: unknown) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  !/[\\/\0]/.test(value) &&
  value.toLowerCase() !== 'latest';

export const testcaseSetManifestHash = (
  manifest: Omit<TestcaseSetManifest, 'manifestHash'>,
) =>
  sha256(
    [
      TESTCASE_SET_PROTOCOL_VERSION,
      manifest.problemId,
      manifest.problemRevisionId,
      manifest.testdataVersionId,
      manifest.testcaseSetId,
      manifest.executionProfileId,
      String(manifest.entries.length),
      ...manifest.entries.flatMap((entry) => [
        String(entry.index),
        entry.testcaseId,
        entry.testdataVersionId,
        entry.inputSha256,
        entry.executionProfileId,
        entry.expectedOutputSha256 ?? '',
      ]),
    ].join('\0'),
  );

export function validateTestcaseSetManifest(
  manifest: TestcaseSetManifest,
): void {
  if (
    !validRef(manifest.problemId) ||
    !validRef(manifest.problemRevisionId) ||
    !validRef(manifest.testdataVersionId) ||
    !validRef(manifest.testcaseSetId) ||
    manifest.executionProfileId !== 'cpp20-gcc-13-v1' ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length < 1 ||
    manifest.entries.length > TESTCASE_SET_MAX_SIZE ||
    !isSha256(manifest.manifestHash)
  )
    throw new TestcaseSetContractError('invalid testcase-set identity');

  const seen = new Set<string>();
  manifest.entries.forEach((entry, expectedIndex) => {
    if (
      entry.index !== expectedIndex ||
      !validRef(entry.testcaseId) ||
      seen.has(entry.testcaseId) ||
      !validRef(entry.testdataVersionId) ||
      entry.testdataVersionId !== manifest.testdataVersionId ||
      entry.executionProfileId !== manifest.executionProfileId ||
      Buffer.byteLength(entry.input, 'utf8') > TESTCASE_SET_MAX_INPUT_BYTES ||
      !isSha256(entry.inputSha256) ||
      sha256(entry.input) !== entry.inputSha256 ||
      (entry.expectedOutputSha256 !== undefined &&
        !isSha256(entry.expectedOutputSha256))
    )
      throw new TestcaseSetContractError('invalid testcase-set manifest entry');
    seen.add(entry.testcaseId);
  });

  if (testcaseSetManifestHash(manifest) !== manifest.manifestHash)
    throw new TestcaseSetContractError('testcase-set manifest hash mismatch');
}

export function createTestcaseSetManifest(input: {
  problemId: string;
  problemRevisionId: string;
  testdataVersionId: string;
  testcaseSetId: string;
  executionProfileId?: 'cpp20-gcc-13-v1';
  entries: readonly Omit<TestcaseSetEntry, 'index'>[];
}): TestcaseSetManifest {
  const manifestWithoutHash = {
    problemId: input.problemId,
    problemRevisionId: input.problemRevisionId,
    testdataVersionId: input.testdataVersionId,
    testcaseSetId: input.testcaseSetId,
    executionProfileId: input.executionProfileId ?? 'cpp20-gcc-13-v1',
    entries: input.entries.map((entry, index) => ({ ...entry, index })),
  } satisfies Omit<TestcaseSetManifest, 'manifestHash'>;
  const manifest = {
    ...manifestWithoutHash,
    manifestHash: testcaseSetManifestHash(manifestWithoutHash),
  } satisfies TestcaseSetManifest;
  validateTestcaseSetManifest(manifest);
  return Object.freeze({
    ...manifest,
    entries: Object.freeze(
      manifest.entries.map((entry) => Object.freeze(entry)),
    ),
  });
}

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
};

const aggregateDigest = (record: Omit<AggregateExecutionSetRecord, 'digest'>) =>
  sha256(stableJson(record));

export class DeterministicTestcaseSetExecutor<Artifact = unknown> {
  async execute(
    request: TestcaseSetRequest,
    adapter: TestcaseSetExecutorAdapter<Artifact>,
    signal?: AbortSignal,
  ): Promise<AggregateExecutionSetRecord> {
    if (
      request.protocolVersion !== TESTCASE_SET_PROTOCOL_VERSION ||
      (request.policy !== 'RUN_ALL' &&
        request.policy !== 'STOP_ON_EXECUTION_BLOCKING_EVENT') ||
      !request.executionSetRequestId ||
      !request.executionSetAttemptId
    )
      throw new TestcaseSetContractError('invalid testcase-set request');
    validateTestcaseSetManifest(request.manifest);

    const compiled = await adapter.compile(request);
    if (!compiled.artifactSha256 || !isSha256(compiled.artifactSha256))
      throw new TestcaseSetContractError(
        'compile did not return artifact hash',
      );

    const results: SetTestcaseExecution[] = [];
    let cancelled = false;
    let infrastructureFailure = false;
    let stopReason: AggregateExecutionSetRecord['stopReason'] = 'COMPLETED';
    let cleanupVerified = true;
    for (const entry of request.manifest.entries) {
      if (signal?.aborted) {
        cancelled = true;
        stopReason = 'CANCELLED';
        results.push({
          index: entry.index,
          testcaseId: entry.testcaseId,
          inputSha256: entry.inputSha256,
          testdataVersionId: entry.testdataVersionId,
          executionProfileId: entry.executionProfileId,
          executionSetAttemptId: request.executionSetAttemptId,
          status: 'CANCELLED_BEFORE_START',
          facts: { cancelled: true, cleanupVerified: true },
        });
        continue;
      }
      try {
        await adapter.verifyArtifact?.(
          compiled.artifact,
          compiled.artifactSha256,
        );
      } catch {
        infrastructureFailure = true;
        stopReason = 'INFRASTRUCTURE_FAILURE';
        results.push({
          index: entry.index,
          testcaseId: entry.testcaseId,
          inputSha256: entry.inputSha256,
          testdataVersionId: entry.testdataVersionId,
          executionProfileId: entry.executionProfileId,
          executionSetAttemptId: request.executionSetAttemptId,
          status: 'INFRA_FAILED',
          facts: { infrastructureFailure: true, cleanupVerified: true },
        });
        for (const remaining of request.manifest.entries.slice(entry.index + 1))
          results.push({
            index: remaining.index,
            testcaseId: remaining.testcaseId,
            inputSha256: remaining.inputSha256,
            testdataVersionId: remaining.testdataVersionId,
            executionProfileId: remaining.executionProfileId,
            executionSetAttemptId: request.executionSetAttemptId,
            status: 'SKIPPED_BY_SET_POLICY',
            facts: { infrastructureFailure: true, cleanupVerified: true },
          });
        break;
      }
      const result = await adapter.runTestcase(
        request,
        entry,
        entry.index,
        compiled.artifact,
      );
      const member: SetTestcaseExecution = {
        index: entry.index,
        testcaseId: entry.testcaseId,
        inputSha256: entry.inputSha256,
        testdataVersionId: entry.testdataVersionId,
        executionProfileId: entry.executionProfileId,
        executionSetAttemptId: request.executionSetAttemptId,
        status: result.status,
        ...(result.record ? { record: result.record } : {}),
        facts: result.facts,
      };
      results.push(member);
      cleanupVerified = cleanupVerified && result.facts.cleanupVerified;
      if (result.status === 'CANCELLED' || result.facts.cancelled) {
        cancelled = true;
        stopReason = 'CANCELLED';
      } else if (
        result.status === 'INFRA_FAILED' ||
        result.facts.infrastructureFailure
      ) {
        infrastructureFailure = true;
        stopReason = 'INFRASTRUCTURE_FAILURE';
      } else if (
        request.policy === 'STOP_ON_EXECUTION_BLOCKING_EVENT' &&
        result.facts.rawBlockingEvent
      ) {
        stopReason = 'RAW_EXECUTION_BLOCKING_EVENT';
      }
      if (stopReason !== 'COMPLETED') {
        const status = cancelled
          ? 'CANCELLED_BEFORE_START'
          : 'SKIPPED_BY_SET_POLICY';
        for (const remaining of request.manifest.entries.slice(entry.index + 1))
          results.push({
            index: remaining.index,
            testcaseId: remaining.testcaseId,
            inputSha256: remaining.inputSha256,
            testdataVersionId: remaining.testdataVersionId,
            executionProfileId: remaining.executionProfileId,
            executionSetAttemptId: request.executionSetAttemptId,
            status,
            facts: {
              ...(cancelled ? { cancelled: true } : {}),
              cleanupVerified: true,
            },
          });
        break;
      }
    }

    const completed = results.filter(
      (value) => value.status === 'RAW_COMPLETED',
    ).length;
    const started = results.filter(
      (value) =>
        value.status !== 'CANCELLED_BEFORE_START' &&
        value.status !== 'SKIPPED_BY_SET_POLICY',
    ).length;
    const cleanupFailed = results.filter(
      (value) => !value.facts.cleanupVerified,
    ).length;
    const base = {
      recordVersion: TESTCASE_SET_PROTOCOL_VERSION,
      recordId: `${request.executionSetRequestId}:${request.executionSetAttemptId}`,
      submissionId: request.submissionId,
      snapshotId: request.snapshotId,
      sourceSha256: request.sourceSha256,
      artifactSha256: compiled.artifactSha256,
      problemId: request.manifest.problemId,
      problemRevisionId: request.manifest.problemRevisionId,
      testdataVersionId: request.manifest.testdataVersionId,
      testcaseSetId: request.manifest.testcaseSetId,
      manifestHash: request.manifest.manifestHash,
      executionSetRequestId: request.executionSetRequestId,
      executionSetAttemptId: request.executionSetAttemptId,
      executionProfileId: request.manifest.executionProfileId,
      policy: request.policy,
      totalTestcaseCount: request.manifest.entries.length,
      startedTestcaseCount: started,
      completedTestcaseCount: completed,
      testcases: Object.freeze(results.map((value) => freeze(value))),
      setCancelled: cancelled,
      setInfrastructureFailure: infrastructureFailure,
      stopReason,
      cleanup: { verified: cleanupVerified, completed, failed: cleanupFailed },
    } satisfies Omit<AggregateExecutionSetRecord, 'digest'>;
    return freeze({ ...base, digest: aggregateDigest(base) });
  }
}

export class TestcaseSetPublicationRepository {
  private readonly records = new Map<string, AggregateExecutionSetRecord>();

  publish(record: AggregateExecutionSetRecord): AggregateExecutionSetRecord {
    const logicalKey = `${record.submissionId}:${record.testcaseSetId}`;
    const previous = this.records.get(logicalKey);
    if (
      previous &&
      previous.executionSetAttemptId === record.executionSetAttemptId
    ) {
      if (previous.digest !== record.digest)
        throw new TestcaseSetContractError(
          'conflicting duplicate set publication',
        );
      return previous;
    }
    if (
      previous &&
      setAttemptNumber(previous.executionSetAttemptId) >
        setAttemptNumber(record.executionSetAttemptId)
    )
      throw new TestcaseSetContractError('stale testcase-set publication');
    this.records.set(logicalKey, record);
    return record;
  }

  get(submissionId: string, testcaseSetId: string) {
    return this.records.get(`${submissionId}:${testcaseSetId}`);
  }
}

const setAttemptNumber = (value: string) => {
  const match = /:(\d+):attempt$/.exec(value);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};
