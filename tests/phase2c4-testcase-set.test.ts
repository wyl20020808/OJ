import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createTestcaseSetManifest,
  DeterministicTestcaseSetExecutor,
  InMemoryJudgeJobRepository,
  assertPayload,
  JudgeJobConflictError,
  TestcaseSetContractError,
  TestcaseSetPublicationRepository,
  builtinCheckerConfigSha256,
  validateTestcaseSetManifest,
  type TestcaseSetExecutorAdapter,
  type TestcaseSetRequest,
  type RawExecutionResult,
} from '../apps/api/src/modules/judge/index.js';

const digest = (value: string) =>
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

const sealDigest = (value: Record<string, unknown>) => {
  delete value.digest;
  value.digest = digest(stableJson(value));
};

const manifest = () =>
  createTestcaseSetManifest({
    problemId: 'problem-1',
    problemRevisionId: 'revision-1',
    testdataVersionId: 'testdata-v1',
    testcaseSetId: 'set-1',
    entries: ['111\n', '222\n', '333\n'].map((input, index) => ({
      testcaseId: `case-${index + 1}`,
      testdataVersionId: 'testdata-v1',
      input,
      inputSha256: digest(input),
      executionProfileId: 'cpp20-gcc-13-v1' as const,
    })),
  });

const request = (attempt = 1): TestcaseSetRequest => ({
  protocolVersion: '2C.4',
  executionSetRequestId: `job-1:${attempt}`,
  executionSetAttemptId: `job-1:${attempt}:attempt`,
  submissionId: 'submission-1',
  snapshotId: 'submission:submission-1',
  sourceSha256: digest('source'),
  manifest: manifest(),
  policy: 'RUN_ALL',
});

const adapter = (calls: {
  compile: number;
  run: string[];
}): TestcaseSetExecutorAdapter<{ id: string }> => ({
  async compile() {
    calls.compile += 1;
    return { artifact: { id: 'artifact' }, artifactSha256: digest('artifact') };
  },
  async verifyArtifact() {},
  async runTestcase(
    setRequest: TestcaseSetRequest,
    entry: ReturnType<typeof manifest>['entries'][number],
  ) {
    calls.run.push(entry.testcaseId);
    return {
      status: 'RAW_COMPLETED' as const,
      record: {
        record_version: '2C.4',
        record_id: `${setRequest.executionSetAttemptId}:${entry.index}`,
        digest: digest(`${entry.index}`),
        execution_set_attempt_id: setRequest.executionSetAttemptId,
        testcase_index: entry.index,
        testcase_set_manifest_hash: setRequest.manifest.manifestHash,
      },
      facts: { cleanupVerified: true },
    };
  },
});

describe('Phase 2C.4 testcase-set contract', () => {
  it('freezes the Phase 2C.5 expected-output and built-in checker binding', () => {
    const expectedOutput = '42\n';
    const verdictManifest = createTestcaseSetManifest({
      problemId: 'problem-verdict',
      problemRevisionId: 'revision-verdict',
      testdataVersionId: 'testdata-verdict',
      testcaseSetId: 'set-verdict',
      entries: [
        {
          testcaseId: 'case-1',
          testdataVersionId: 'testdata-verdict',
          input: 'input\n',
          inputSha256: digest('input\n'),
          executionProfileId: 'cpp20-gcc-13-v1' as const,
          expectedOutput,
          expectedOutputSha256: digest(expectedOutput),
          checkerType: 'EXACT_BYTES' as const,
          checkerVersion: 'builtin-v1' as const,
          checkerConfigSha256: builtinCheckerConfigSha256('EXACT_BYTES'),
        },
      ],
    });
    expect(() =>
      validateTestcaseSetManifest({
        ...verdictManifest,
        entries: [{ ...verdictManifest.entries[0]!, expectedOutput: '41\n' }],
      }),
    ).toThrow(TestcaseSetContractError);
    expect(() =>
      validateTestcaseSetManifest({
        ...verdictManifest,
        entries: [
          {
            ...verdictManifest.entries[0]!,
            checkerConfigSha256: digest('tampered'),
          },
        ],
      }),
    ).toThrow(TestcaseSetContractError);
    expect(() =>
      validateTestcaseSetManifest({
        ...verdictManifest,
        manifestHash: digest('different-manifest'),
      }),
    ).toThrow(TestcaseSetContractError);
  });

  it('freezes exact membership, order, version and deterministic manifest hash', () => {
    const first = manifest();
    const second = manifest();
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.entries.map((entry) => entry.testcaseId)).toEqual([
      'case-1',
      'case-2',
      'case-3',
    ]);
    expect(Object.isFrozen(first.entries)).toBe(true);
    expect(() =>
      validateTestcaseSetManifest({
        ...first,
        entries: [first.entries[1]!, first.entries[0]!, first.entries[2]!],
      }),
    ).toThrow(TestcaseSetContractError);
    expect(() =>
      validateTestcaseSetManifest({
        ...first,
        entries: [first.entries[0]!, first.entries[0]!, first.entries[2]!],
      }),
    ).toThrow(TestcaseSetContractError);
    expect(() =>
      validateTestcaseSetManifest({ ...first, testdataVersionId: 'latest' }),
    ).toThrow(TestcaseSetContractError);
  });

  it('compiles once, runs every testcase in order, and publishes an ordered aggregate', async () => {
    const calls = { compile: 0, run: [] as string[] };
    const result = await new DeterministicTestcaseSetExecutor<{
      id: string;
    }>().execute(request(), adapter(calls));
    expect(calls).toEqual({
      compile: 1,
      run: ['case-1', 'case-2', 'case-3'],
    });
    expect(result).toMatchObject({
      recordVersion: '2C.4',
      totalTestcaseCount: 3,
      startedTestcaseCount: 3,
      completedTestcaseCount: 3,
      stopReason: 'COMPLETED',
      setCancelled: false,
    });
    expect(result.testcases.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(() => (result.testcases as unknown[]).push({})).toThrow();
  });

  it('stops deterministically on cancellation and never launches a later testcase', async () => {
    const controller = new AbortController();
    const calls = { compile: 0, run: [] as string[] };
    const base = adapter(calls);
    const result = await new DeterministicTestcaseSetExecutor<{
      id: string;
    }>().execute(
      request(),
      {
        ...base,
        async runTestcase(setRequest, entry, index, artifact) {
          const completed = await base.runTestcase(
            setRequest,
            entry,
            index,
            artifact,
          );
          controller.abort();
          return completed;
        },
      },
      controller.signal,
    );
    expect(calls.run).toEqual(['case-1']);
    expect(result.stopReason).toBe('CANCELLED');
    expect(result.testcases.map((entry) => entry.status)).toEqual([
      'RAW_COMPLETED',
      'CANCELLED_BEFORE_START',
      'CANCELLED_BEFORE_START',
    ]);
  });

  it('uses raw blocking facts only for the explicit stop policy', async () => {
    const setRequest = {
      ...request(),
      policy: 'STOP_ON_EXECUTION_BLOCKING_EVENT' as const,
    };
    const calls = { compile: 0, run: [] as string[] };
    const base = adapter(calls);
    const result = await new DeterministicTestcaseSetExecutor<{
      id: string;
    }>().execute(setRequest, {
      ...base,
      async runTestcase(requestValue, entry, index, artifact) {
        const completed = await base.runTestcase(
          requestValue,
          entry,
          index,
          artifact,
        );
        return index === 0
          ? {
              ...completed,
              facts: { cleanupVerified: true, rawBlockingEvent: true },
            }
          : completed;
      },
    });
    expect(calls.run).toEqual(['case-1']);
    expect(result.stopReason).toBe('RAW_EXECUTION_BLOCKING_EVENT');
    expect(
      result.testcases
        .slice(1)
        .every((entry) => entry.status === 'SKIPPED_BY_SET_POLICY'),
    ).toBe(true);
  });

  it('publishes equivalent duplicates idempotently and rejects stale/conflicting records', async () => {
    const executor = new DeterministicTestcaseSetExecutor();
    const first = await executor.execute(
      request(1),
      adapter({ compile: 0, run: [] }),
    );
    const second = await executor.execute(
      request(2),
      adapter({ compile: 0, run: [] }),
    );
    const repository = new TestcaseSetPublicationRepository();
    expect(repository.publish(first)).toBe(first);
    expect(repository.publish(first)).toBe(first);
    expect(repository.publish(second)).toBe(second);
    expect(() => repository.publish(first)).toThrow('stale');
    expect(() =>
      repository.publish({ ...second, digest: digest('conflict') }),
    ).toThrow('conflicting');
  });

  it('freezes the set manifest on the Judge Job without latest lookup', async () => {
    const source = '#include <iostream>\nint main(){return 0;}\n';
    const repository = new InMemoryJudgeJobRepository();
    const created = await repository.enqueue({
      submissionId: 'submission-set',
      ownerUserId: 'owner',
      problemId: 'problem-1',
      problemRevisionId: 'revision-1',
      testdataVersionRef: 'testdata-v1',
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      languageProfileId: 'cpp20-gcc-13-v1',
      sourceSnapshotRef: 'submission:submission-set',
      sourceBytes: source,
      sourceSha256: digest(source),
      controlledInputId: 'stdin-empty-v1',
      testcaseSet: manifest(),
      executionSetPolicy: 'RUN_ALL',
    });
    expect(created.job.testcaseSet).toEqual(manifest());
    expect(Object.isFrozen(created.job.testcaseSet)).toBe(true);
    expect(Object.isFrozen(created.job.testcaseSet?.entries)).toBe(true);
    expect(created.job.testcaseId).toBeUndefined();
    expect((await repository.claim('worker', 30_000))?.job).toMatchObject({
      testdataVersionRef: 'testdata-v1',
      executionSetPolicy: 'RUN_ALL',
    });
  });

  it('accepts only an aggregate bound to the claimed set attempt and manifest', async () => {
    const source = 'int main(){return 0;}\n';
    const repository = new InMemoryJudgeJobRepository();
    await repository.enqueue({
      submissionId: 'submission-set-result',
      ownerUserId: 'owner',
      problemId: 'problem-1',
      problemRevisionId: 'revision-1',
      testdataVersionRef: 'testdata-v1',
      languageId: 'cpp20',
      executionMode: 'REAL_SANDBOXED_EXECUTION',
      languageProfileId: 'cpp20-gcc-13-v1',
      sourceSnapshotRef: 'submission:submission-set-result',
      sourceBytes: source,
      sourceSha256: digest(source),
      controlledInputId: 'stdin-empty-v1',
      testcaseSet: manifest(),
    });
    const claim = (await repository.claim('worker', 30_000))!;
    const members = manifest().entries.map((entry) => ({
      index: entry.index,
      testcase_id: entry.testcaseId,
      input_sha256: entry.inputSha256,
      testdata_version_id: entry.testdataVersionId,
      execution_profile_id: entry.executionProfileId,
      status: 'SKIPPED_BY_SET_POLICY',
    }));
    const raw = {
      protocol_version: '2C.4',
      execution_set_request_id: claim.job.executionRequestId,
      judge_job_id: claim.job.id,
      submission_id: claim.job.submissionId,
      attempt: claim.job.attempt,
      result_generation: claim.job.resultGeneration,
      correlation_id: claim.job.id,
      language_profile_id: claim.job.languageProfileId,
      source_sha256: claim.job.sourceSha256,
      problem_id: claim.job.problemId,
      problem_revision_id: claim.job.problemRevisionId,
      testdata_version_id: claim.job.testdataVersionRef,
      testcase_set_id: manifest().testcaseSetId,
      testcase_set_manifest_hash: manifest().manifestHash,
      execution_set_attempt_id: claim.job.executionAttemptId,
      execution_set_policy: 'RUN_ALL',
      pipeline_outcome: 'PIPELINE_COMPLETED',
      compile: {
        stdout: '',
        stderr: '',
        stdout_bytes: 0,
        stderr_bytes: 0,
        stdout_sha256: digest(''),
        stderr_sha256: digest(''),
      },
      aggregate_execution_set_record: {
        record_version: '2C.4',
        record_id: `${claim.job.executionRequestId}:record`,
        submission_id: claim.job.submissionId,
        snapshot_id: claim.job.sourceSnapshotRef,
        source_sha256: claim.job.sourceSha256,
        problem_id: claim.job.problemId,
        problem_revision_id: claim.job.problemRevisionId,
        testdata_version_id: claim.job.testdataVersionRef,
        testcase_set_id: manifest().testcaseSetId,
        manifest_hash: manifest().manifestHash,
        execution_set_request_id: claim.job.executionRequestId,
        execution_set_attempt_id: claim.job.executionAttemptId,
        execution_profile_id: manifest().executionProfileId,
        execution_policy: 'RUN_ALL',
        total_testcase_count: members.length,
        started_testcase_count: 0,
        completed_testcase_count: 0,
        testcases: members,
        set_cancelled: false,
        set_infrastructure_failure: false,
        stop_reason: 'COMPLETED',
        cleanup_verified: true,
        digest: '',
      },
      started_at: new Date(Date.now() - 1000).toISOString(),
      completed_at: new Date().toISOString(),
      clean: true,
    } as unknown as RawExecutionResult;
    sealDigest(
      raw.aggregate_execution_set_record as unknown as Record<string, unknown>,
    );
    const snapshotTampered = structuredClone(raw) as unknown as {
      aggregate_execution_set_record: { snapshot_id: string };
    };
    snapshotTampered.aggregate_execution_set_record.snapshot_id =
      'submission:other';
    await expect(
      repository.completeReal!(claim.job.id, claim.leaseToken, {
        ...snapshotTampered,
      } as unknown as RawExecutionResult),
    ).rejects.toBeInstanceOf(JudgeJobConflictError);
    const completed = await repository.completeReal!(
      claim.job.id,
      claim.leaseToken,
      raw,
    );
    expect(completed).toMatchObject({ status: 'COMPLETED' });
    expect(() =>
      assertPayload({
        ...completed,
        testcaseId: '',
        testcaseInput: '',
        testcaseInputSha256: '',
        executionProfileId: '',
      }),
    ).not.toThrow();
    const tampered = structuredClone(raw) as unknown as {
      aggregate_execution_set_record: {
        testcases: Array<{ testcase_id: string }>;
      };
    };
    tampered.aggregate_execution_set_record.testcases[1]!.testcase_id =
      'wrong-case';
    await expect(
      repository.completeReal!(claim.job.id, claim.leaseToken, {
        ...tampered,
      } as unknown as RawExecutionResult),
    ).rejects.toBeInstanceOf(JudgeJobConflictError);
  });
});
