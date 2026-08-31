import { createHash, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  JudgeJobConflictError,
  JudgeJobNotFoundError,
  JudgeJobPayloadError,
  type JudgeJob,
  type JudgeJobCreateInput,
  type JudgeJobRepository,
  type RawExecutionResult,
} from './model.js';
const stamp = () => new Date().toISOString();
const safeMode = 'SAFE_FIXTURE_QUALIFICATION' as const;
const realMode = 'REAL_SANDBOXED_EXECUTION' as const;
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
const rawDigest = (value: RawExecutionResult) => sha256(stableJson(value));
const testcaseFieldsPresent = (
  value: Record<string, unknown> | JudgeJobCreateInput,
) =>
  value.testcaseId !== undefined ||
  value.testcaseInput !== undefined ||
  value.testcaseInputSha256 !== undefined ||
  value.executionProfileId !== undefined;
const validTestcaseId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  value === value.trim() &&
  !/[\\/\0]/.test(value) &&
  value !== '.' &&
  value !== '..';
const validTestcaseInput = (
  value: Record<string, unknown> | JudgeJobCreateInput,
) =>
  validTestcaseId(value.testcaseId) &&
  value.executionProfileId === 'cpp20-gcc-13-v1' &&
  typeof value.testcaseInput === 'string' &&
  Buffer.byteLength(value.testcaseInput, 'utf8') <= 64 * 1024 &&
  typeof value.testcaseInputSha256 === 'string' &&
  /^[a-f0-9]{64}$/.test(value.testcaseInputSha256) &&
  sha256(value.testcaseInput) === value.testcaseInputSha256;
const validStageOutput = (value: unknown) => {
  if (!isRecord(value)) return false;
  const stdout = value.stdout;
  const stderr = value.stderr;
  return (
    typeof stdout === 'string' &&
    typeof stderr === 'string' &&
    Buffer.byteLength(stdout, 'utf8') <= 64 * 1024 &&
    Buffer.byteLength(stderr, 'utf8') <= 64 * 1024 &&
    Number.isSafeInteger(value.stdout_bytes) &&
    Number(value.stdout_bytes) >= 0 &&
    Number(value.stdout_bytes) <= 64 * 1024 &&
    Number.isSafeInteger(value.stderr_bytes) &&
    Number(value.stderr_bytes) >= 0 &&
    Number(value.stderr_bytes) <= 64 * 1024 &&
    typeof value.stdout_sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.stdout_sha256) &&
    typeof value.stderr_sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.stderr_sha256) &&
    typeof value.stdout_truncated === 'boolean' &&
    typeof value.stderr_truncated === 'boolean'
  );
};
const rawPipelineOutcomes = new Set<RawExecutionResult['pipeline_outcome']>([
  'PIPELINE_COMPLETED',
  'PIPELINE_COMPILE_FAILED',
  'PIPELINE_LIMIT_HIT',
  'PIPELINE_CANCELLED',
  'PIPELINE_INFRA_FAILURE',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validRawExecutionResult = (
  value: unknown,
  job: Record<string, unknown> | JudgeJob,
): value is RawExecutionResult => {
  if (!isRecord(value)) return false;
  const startedAt = Date.parse(String(value.started_at));
  const completedAt = Date.parse(String(value.completed_at));
  const testcaseRecordValid =
    typeof job.testcaseId !== 'string' ||
    job.testcaseId === '' ||
    (isRecord(value.single_testcase_record) &&
      value.single_testcase_record.record_version === '2C.3' &&
      value.single_testcase_record.record_id ===
        `${String(value.execution_request_id)}:${String(job.testcaseId)}` &&
      isRecord(value.single_testcase_record.identity) &&
      value.single_testcase_record.identity.testcase_id === job.testcaseId &&
      value.single_testcase_record.identity.problem_id === job.problemId &&
      value.single_testcase_record.identity.problem_revision_id ===
        job.problemRevisionId &&
      value.single_testcase_record.identity.testdata_version_id ===
        job.testdataVersionRef &&
      value.single_testcase_record.identity.execution_attempt_id ===
        value.execution_attempt_id &&
      value.single_testcase_record.identity.input_sha256 ===
        job.testcaseInputSha256 &&
      value.single_testcase_record.identity.execution_profile_id ===
        job.executionProfileId &&
      typeof value.single_testcase_record.digest === 'string' &&
      /^[a-f0-9]{64}$/.test(value.single_testcase_record.digest));
  const testcaseJob = validTestcaseId(job.testcaseId);
  const outputMetadataValid =
    !testcaseJob ||
    (validStageOutput(value.compile) &&
      (value.runtime === undefined || validStageOutput(value.runtime)));
  return (
    (value.protocol_version === '2C.1' ||
      (value.protocol_version === '2C.3' && testcaseJob)) &&
    value.execution_request_id ===
      (typeof job.executionRequestId === 'string'
        ? job.executionRequestId
        : `${String(job.id)}:${String(job.attempt)}`) &&
    value.judge_job_id === job.id &&
    value.submission_id === job.submissionId &&
    value.attempt === job.attempt &&
    value.language_profile_id === job.languageProfileId &&
    value.source_sha256 === job.sourceSha256 &&
    typeof value.correlation_id === 'string' &&
    value.correlation_id.length > 0 &&
    rawPipelineOutcomes.has(
      value.pipeline_outcome as RawExecutionResult['pipeline_outcome'],
    ) &&
    isRecord(value.compile) &&
    (value.artifact === undefined || isRecord(value.artifact)) &&
    (value.runtime === undefined || isRecord(value.runtime)) &&
    outputMetadataValid &&
    Number.isFinite(startedAt) &&
    Number.isFinite(completedAt) &&
    completedAt >= startedAt &&
    typeof value.clean === 'boolean' &&
    value.execution_attempt_id ===
      (typeof job.executionAttemptId === 'string'
        ? job.executionAttemptId
        : `${String(job.id)}:${String(job.attempt)}:attempt`) &&
    value.compile_attempt_id ===
      `${String(value.execution_request_id)}:compile` &&
    value.runtime_attempt_id ===
      `${String(value.execution_request_id)}:runtime` &&
    value.result_generation === Number(job.resultGeneration ?? job.attempt) &&
    (!testcaseJob ||
      (value.testcase_id === job.testcaseId &&
        value.testcase_input_sha256 === job.testcaseInputSha256 &&
        value.execution_profile_id === job.executionProfileId &&
        testcaseRecordValid)) &&
    (!testcaseJob ||
      (value.problem_id === job.problemId &&
        value.problem_revision_id === job.problemRevisionId &&
        value.testdata_version_id === job.testdataVersionRef))
  );
};
const normalize = (i: JudgeJobCreateInput): JudgeJob => {
  if (
    !i.submissionId ||
    !i.ownerUserId ||
    !i.problemId ||
    !i.problemRevisionId ||
    !i.testdataVersionRef ||
    i.testdataVersionRef.toLowerCase() === 'latest' ||
    !i.languageId
  )
    throw new JudgeJobPayloadError('Missing immutable linkage');
  const executionMode = i.executionMode ?? safeMode;
  if (
    executionMode === realMode &&
    (i.languageId !== 'cpp20' ||
      i.languageProfileId !== 'cpp20-gcc-13-v1' ||
      !i.sourceSnapshotRef ||
      !i.sourceBytes ||
      Buffer.byteLength(i.sourceBytes, 'utf8') > 256 * 1024 ||
      !/^[a-f0-9]{64}$/.test(i.sourceSha256 ?? '') ||
      sha256(i.sourceBytes) !== i.sourceSha256 ||
      !['stdin-empty-v1', 'stdin-echo-v1'].includes(i.controlledInputId ?? ''))
  )
    throw new JudgeJobPayloadError('Invalid real execution snapshot');
  if (
    testcaseFieldsPresent(i) &&
    (executionMode !== realMode || !validTestcaseInput(i))
  )
    throw new JudgeJobPayloadError('Invalid testcase input contract');
  const t = stamp();
  return {
    id: randomUUID(),
    submissionId: i.submissionId,
    idempotencyKey: i.idempotencyKey ?? `submission:${i.submissionId}`,
    ownerUserId: i.ownerUserId,
    problemId: i.problemId,
    problemRevisionId: i.problemRevisionId,
    testdataVersionRef: i.testdataVersionRef,
    languageId: i.languageId,
    executionMode,
    ...(executionMode === realMode
      ? {
          languageProfileId: i.languageProfileId!,
          sourceSnapshotRef: i.sourceSnapshotRef!,
          sourceBytes: i.sourceBytes!,
          sourceSha256: i.sourceSha256!,
          controlledInputId: i.controlledInputId!,
          ...(i.testcaseId
            ? {
                testcaseId: i.testcaseId,
                testcaseInput: i.testcaseInput!,
                testcaseInputSha256: i.testcaseInputSha256!,
                executionProfileId: i.executionProfileId!,
              }
            : {}),
        }
      : {}),
    status: 'QUEUED',
    attempt: 0,
    cancellationGeneration: 0,
    maxAttempts:
      Number.isInteger(i.maxAttempts) && i.maxAttempts! > 0
        ? i.maxAttempts!
        : 3,
    createdAt: t,
    updatedAt: t,
  };
};
export function assertPayload(v: unknown): asserts v is JudgeJob {
  if (!v || typeof v !== 'object') throw new JudgeJobPayloadError();
  const j = v as Record<string, unknown>;
  if (j.executionMode === undefined) j.executionMode = safeMode;
  const states = [
    'QUEUED',
    'LEASED_FAKE',
    'SUCCEEDED_FAKE',
    'FAILED_RETRYABLE',
    'FAILED_TERMINAL',
    'CANCELLED',
    'LEASED',
    'COMPLETED',
  ];
  if (
    typeof j.id !== 'string' ||
    typeof j.submissionId !== 'string' ||
    typeof j.idempotencyKey !== 'string' ||
    typeof j.ownerUserId !== 'string' ||
    typeof j.problemId !== 'string' ||
    typeof j.problemRevisionId !== 'string' ||
    typeof j.testdataVersionRef !== 'string' ||
    j.testdataVersionRef.toLowerCase() === 'latest' ||
    typeof j.languageId !== 'string' ||
    ![safeMode, realMode].includes(
      j.executionMode as typeof safeMode | typeof realMode,
    ) ||
    !states.includes(String(j.status)) ||
    !Number.isSafeInteger(j.attempt) ||
    Number(j.attempt) < 0 ||
    !Number.isSafeInteger(j.maxAttempts) ||
    Number(j.maxAttempts) < 1 ||
    (j.cancellationGeneration !== undefined &&
      (!Number.isSafeInteger(j.cancellationGeneration) ||
        Number(j.cancellationGeneration) < 0)) ||
    typeof j.createdAt !== 'string' ||
    Number.isNaN(Date.parse(j.createdAt as string)) ||
    typeof j.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(j.updatedAt as string))
  )
    throw new JudgeJobPayloadError();
  if (
    j.executionMode === realMode &&
    (j.languageId !== 'cpp20' ||
      j.languageProfileId !== 'cpp20-gcc-13-v1' ||
      typeof j.sourceSnapshotRef !== 'string' ||
      typeof j.sourceBytes !== 'string' ||
      Buffer.byteLength(j.sourceBytes, 'utf8') > 256 * 1024 ||
      typeof j.sourceSha256 !== 'string' ||
      sha256(j.sourceBytes) !== j.sourceSha256 ||
      !['stdin-empty-v1', 'stdin-echo-v1'].includes(
        String(j.controlledInputId),
      ))
  )
    throw new JudgeJobPayloadError('Invalid real execution snapshot');
  if (
    testcaseFieldsPresent(j) &&
    (j.executionMode !== realMode || !validTestcaseInput(j))
  )
    throw new JudgeJobPayloadError('Invalid testcase input contract');
  if (
    (j.status === 'LEASED_FAKE' || j.status === 'LEASED') &&
    (typeof j.leaseOwner !== 'string' ||
      typeof j.leaseToken !== 'string' ||
      typeof j.leaseExpiresAt !== 'string' ||
      Number.isNaN(Date.parse(j.leaseExpiresAt as string)))
  )
    throw new JudgeJobPayloadError('Missing lease metadata');
  if (
    j.executionRequestId !== undefined &&
    (typeof j.executionRequestId !== 'string' ||
      j.executionRequestId.length === 0)
  )
    throw new JudgeJobPayloadError('Invalid execution request identity');
  if (
    (j.status === 'COMPLETED' &&
      !validRawExecutionResult(j.rawExecutionResult, j)) ||
    (j.status !== 'COMPLETED' && j.rawExecutionResult !== undefined)
  )
    throw new JudgeJobPayloadError('Invalid raw execution result');
}
const clear = <T extends JudgeJob>(j: T): JudgeJob => {
  const x = { ...j };
  delete x.leaseOwner;
  delete x.leaseToken;
  delete x.leaseExpiresAt;
  return x;
};
function lease(j: JudgeJob | undefined, t: string): asserts j is JudgeJob {
  if (!j) throw new JudgeJobNotFoundError();
  if (
    !['LEASED_FAKE', 'LEASED'].includes(j.status) ||
    j.leaseToken !== t ||
    !j.leaseExpiresAt ||
    Date.parse(j.leaseExpiresAt) <= Date.now()
  )
    throw new JudgeJobConflictError();
}
export class InMemoryJudgeJobRepository implements JudgeJobRepository {
  private jobs = new Map<string, JudgeJob>();
  private keys = new Map<string, string>();
  private lock: Promise<void> = Promise.resolve();
  private async atomic<T>(fn: () => T | Promise<T>): Promise<T> {
    const old = this.lock;
    let release!: () => void;
    this.lock = new Promise((r) => (release = r));
    await old;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async enqueue(i: JudgeJobCreateInput) {
    return this.atomic(() => {
      const k = i.idempotencyKey ?? `submission:${i.submissionId}`,
        existing =
          this.keys.get(k) ?? this.keys.get(`submission:${i.submissionId}`);
      if (existing)
        return { job: { ...this.jobs.get(existing)! }, created: false };
      const j = normalize({ ...i, idempotencyKey: k });
      this.jobs.set(j.id, j);
      this.keys.set(k, j.id);
      this.keys.set(`submission:${j.submissionId}`, j.id);
      return { job: { ...j }, created: true };
    });
  }
  async getById(id: string) {
    const j = this.jobs.get(id);
    return j ? { ...j } : undefined;
  }
  async getBySubmissionId(id: string) {
    const k = this.keys.get(`submission:${id}`);
    return k ? this.getById(k) : undefined;
  }
  async claim(worker: string, ms: number) {
    return this.atomic(async () => {
      await this.recoverUnsafe(new Date());
      const j = [...this.jobs.values()].find(
        (x) => x.status === 'QUEUED' || x.status === 'FAILED_RETRYABLE',
      );
      if (!j) return undefined;
      const token = randomUUID(),
        leased: JudgeJob = {
          ...j,
          status: j.executionMode === realMode ? 'LEASED' : 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken: token,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          ...(j.executionMode === realMode
            ? {
                executionRequestId: `${j.id}:${j.attempt + 1}`,
                executionAttemptId: `${j.id}:${j.attempt + 1}:attempt`,
                resultGeneration: j.attempt + 1,
              }
            : {}),
          updatedAt: stamp(),
        };
      this.jobs.set(j.id, leased);
      return { job: { ...leased }, leaseToken: token };
    });
  }
  async claimById(id: string, worker: string, ms: number) {
    return this.atomic(async () => {
      await this.recoverUnsafe(new Date());
      const j = this.jobs.get(id);
      if (!j || !(j.status === 'QUEUED' || j.status === 'FAILED_RETRYABLE'))
        return undefined;
      const token = randomUUID(),
        leased: JudgeJob = {
          ...j,
          status: j.executionMode === realMode ? 'LEASED' : 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken: token,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          ...(j.executionMode === realMode
            ? {
                executionRequestId: `${j.id}:${j.attempt + 1}`,
                executionAttemptId: `${j.id}:${j.attempt + 1}:attempt`,
                resultGeneration: j.attempt + 1,
              }
            : {}),
          updatedAt: stamp(),
        };
      this.jobs.set(id, leased);
      return { job: { ...leased }, leaseToken: token };
    });
  }
  async complete(id: string, t: string, f: string) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      if (j?.status === 'SUCCEEDED_FAKE') return { ...j };
      lease(j, t);
      if (j.executionMode !== safeMode) throw new JudgeJobConflictError();
      const done = clear({
        ...j,
        status: 'SUCCEEDED_FAKE' as const,
        syntheticFixtureId: f,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      this.jobs.set(id, done);
      return { ...done };
    });
  }
  async completeReal(id: string, t: string, result: RawExecutionResult) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      if (j?.status === 'COMPLETED') {
        if (j.rawResultDigest && j.rawResultDigest === rawDigest(result))
          return { ...j };
        throw new JudgeJobConflictError('Conflicting duplicate real result');
      }
      lease(j, t);
      if (j.executionMode !== realMode || !validRawExecutionResult(result, j))
        throw new JudgeJobConflictError('Real execution result mismatch');
      const done = clear({
        ...j,
        status: 'COMPLETED' as const,
        rawExecutionResult: result,
        rawResultDigest: rawDigest(result),
        resultGeneration: j.resultGeneration ?? j.attempt,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      this.jobs.set(id, done);
      return { ...done };
    });
  }
  async retry(id: string, t: string, reason: string) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      lease(j, t);
      const x = clear({
        ...j,
        status: (j.attempt >= j.maxAttempts
          ? 'FAILED_TERMINAL'
          : 'FAILED_RETRYABLE') as JudgeJob['status'],
        failureReason: reason,
        executionRequestId: undefined,
        executionAttemptId: undefined,
        resultGeneration: undefined,
        rawResultDigest: undefined,
        updatedAt: stamp(),
      });
      this.jobs.set(id, x);
      return { ...x };
    });
  }
  private async recoverUnsafe(at: Date) {
    let n = 0;
    for (const j of this.jobs.values())
      if (
        ['LEASED_FAKE', 'LEASED'].includes(j.status) &&
        j.leaseExpiresAt &&
        Date.parse(j.leaseExpiresAt) <= at.getTime()
      ) {
        this.jobs.set(
          j.id,
          clear({
            ...j,
            status: (j.attempt >= j.maxAttempts
              ? 'FAILED_TERMINAL'
              : 'FAILED_RETRYABLE') as JudgeJob['status'],
            failureReason: 'lease_expired',
            executionRequestId: undefined,
            executionAttemptId: undefined,
            resultGeneration: undefined,
            rawResultDigest: undefined,
            updatedAt: stamp(),
          }),
        );
        n++;
      }
    return n;
  }
  async recoverStale(at = new Date()) {
    return this.atomic(() => this.recoverUnsafe(at));
  }
  async failTerminal(id: string, t: string, reason: string) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      lease(j, t);
      const x = clear({
        ...j,
        status: 'FAILED_TERMINAL' as const,
        failureReason: reason,
        updatedAt: stamp(),
      });
      this.jobs.set(id, x);
      return { ...x };
    });
  }
  async cancel(id: string) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      if (!j) throw new JudgeJobNotFoundError();
      if (
        [
          'SUCCEEDED_FAKE',
          'COMPLETED',
          'FAILED_TERMINAL',
          'CANCELLED',
        ].includes(j.status)
      )
        return { ...j };
      const x = clear({
        ...j,
        status: 'CANCELLED' as const,
        failureReason: 'cancelled',
        cancellationGeneration: (j.cancellationGeneration ?? 0) + 1,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      this.jobs.set(id, x);
      return { ...x };
    });
  }
}
export type RedisJudgeClient = Pick<
  Redis,
  'set' | 'get' | 'del' | 'keys' | 'lpush' | 'rpop'
>;
export class RedisJudgeJobRepository implements JudgeJobRepository {
  constructor(
    private redis: RedisJudgeClient,
    private readonly keyPrefix = 'oj:judge',
  ) {}
  private get queueKey() {
    return `${this.keyPrefix}:queue`;
  }
  private jobKey(id: string) {
    return `${this.keyPrefix}:job:${id}`;
  }
  private submissionKey(id: string) {
    return `${this.keyPrefix}:submission:${id}`;
  }
  private get mutationLockKey() {
    return `${this.keyPrefix}:mutation-lock`;
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const locked = await (
        this.redis.set as (...args: unknown[]) => Promise<string | null>
      )(this.mutationLockKey, token, 'PX', 5_000, 'NX');
      if (locked === 'OK') {
        try {
          return await work();
        } finally {
          // Never release a lock that expired and was acquired by another caller.
          if ((await this.redis.get(this.mutationLockKey)) === token)
            await this.redis.del(this.mutationLockKey);
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    throw new JudgeJobConflictError('Redis queue mutation lock contention');
  }
  private async read(id: string) {
    const raw = await this.redis.get(this.jobKey(id));
    if (!raw) return undefined;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      throw new JudgeJobPayloadError();
    }
    assertPayload(v);
    return v;
  }
  async enqueue(i: JudgeJobCreateInput) {
    return this.exclusive(async () => {
      const existing = await this.redis.get(this.submissionKey(i.submissionId));
      if (existing) {
        const j = await this.read(existing);
        if (!j) throw new JudgeJobPayloadError('Broken idempotency index');
        return { job: j, created: false };
      }
      const j = normalize(i);
      if (
        (await this.redis.set(this.jobKey(j.id), JSON.stringify(j), 'NX')) !==
        'OK'
      )
        throw new JudgeJobConflictError();
      if (
        (await this.redis.set(
          this.submissionKey(i.submissionId),
          j.id,
          'NX',
        )) !== 'OK'
      ) {
        await this.redis.del(this.jobKey(j.id));
        const id = await this.redis.get(this.submissionKey(i.submissionId)),
          winner = id ? await this.read(id) : undefined;
        if (!winner)
          throw new JudgeJobConflictError(
            'Concurrent enqueue winner unavailable',
          );
        return { job: winner, created: false };
      }
      await this.redis.lpush(this.queueKey, j.id);
      return { job: j, created: true };
    });
  }
  async getById(id: string) {
    return this.read(id);
  }
  async getBySubmissionId(id: string) {
    const j = await this.redis.get(this.submissionKey(id));
    return j ? this.read(j) : undefined;
  }
  async claim(worker: string, ms: number) {
    return this.exclusive(async () => {
      await this.recoverStaleUnsafe(new Date());
      const id = await this.redis.rpop(this.queueKey);
      if (!id) return undefined;
      const j = await this.read(id);
      if (!j || !(j.status === 'QUEUED' || j.status === 'FAILED_RETRYABLE'))
        return undefined;
      const leaseToken = randomUUID(),
        x: JudgeJob = {
          ...j,
          status: j.executionMode === realMode ? 'LEASED' : 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          ...(j.executionMode === realMode
            ? {
                executionRequestId: `${j.id}:${j.attempt + 1}`,
                executionAttemptId: `${j.id}:${j.attempt + 1}:attempt`,
                resultGeneration: j.attempt + 1,
              }
            : {}),
          updatedAt: stamp(),
        };
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      return { job: x, leaseToken };
    });
  }
  async claimById(id: string, worker: string, ms: number) {
    return this.exclusive(async () => {
      await this.recoverStaleUnsafe(new Date());
      const j = await this.read(id);
      if (!j || !(j.status === 'QUEUED' || j.status === 'FAILED_RETRYABLE'))
        return undefined;
      const leaseToken = randomUUID(),
        x: JudgeJob = {
          ...j,
          status: j.executionMode === realMode ? 'LEASED' : 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          ...(j.executionMode === realMode
            ? {
                executionRequestId: `${j.id}:${j.attempt + 1}`,
                executionAttemptId: `${j.id}:${j.attempt + 1}:attempt`,
                resultGeneration: j.attempt + 1,
              }
            : {}),
          updatedAt: stamp(),
        };
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      return { job: x, leaseToken };
    });
  }
  async complete(id: string, t: string, f: string) {
    return this.exclusive(async () => {
      const j = await this.read(id);
      if (j?.status === 'SUCCEEDED_FAKE') return j;
      lease(j, t);
      if (j.executionMode !== safeMode) throw new JudgeJobConflictError();
      const x = clear({
        ...j,
        status: 'SUCCEEDED_FAKE' as const,
        syntheticFixtureId: f,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      return x as JudgeJob;
    });
  }
  async completeReal(id: string, t: string, result: RawExecutionResult) {
    return this.exclusive(async () => {
      const j = await this.read(id);
      if (j?.status === 'COMPLETED') {
        if (j.rawResultDigest && j.rawResultDigest === rawDigest(result))
          return j;
        throw new JudgeJobConflictError('Conflicting duplicate real result');
      }
      lease(j, t);
      if (j.executionMode !== realMode || !validRawExecutionResult(result, j))
        throw new JudgeJobConflictError('Real execution result mismatch');
      const x = clear({
        ...j,
        status: 'COMPLETED' as const,
        rawExecutionResult: result,
        rawResultDigest: rawDigest(result),
        resultGeneration: j.resultGeneration ?? j.attempt,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      return x;
    });
  }
  async retry(id: string, t: string, r: string) {
    return this.exclusive(async () => {
      const j = await this.read(id);
      lease(j, t);
      const x = clear({
        ...j,
        status: (j.attempt >= j.maxAttempts
          ? 'FAILED_TERMINAL'
          : 'FAILED_RETRYABLE') as JudgeJob['status'],
        failureReason: r,
        rawResultDigest: undefined,
        executionRequestId: undefined,
        executionAttemptId: undefined,
        resultGeneration: undefined,
        updatedAt: stamp(),
      });
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      if (x.status === 'FAILED_RETRYABLE')
        await this.redis.lpush(this.queueKey, id);
      return x;
    });
  }
  private async recoverStaleUnsafe(at: Date) {
    let n = 0;
    const jobsPrefix = `${this.keyPrefix}:job:`;
    for (const k of await this.redis.keys(`${jobsPrefix}*`)) {
      const j = await this.read(k.slice(jobsPrefix.length));
      if (
        j &&
        ['LEASED_FAKE', 'LEASED'].includes(j.status) &&
        j.leaseExpiresAt &&
        Date.parse(j.leaseExpiresAt) <= at.getTime()
      ) {
        const x = clear({
          ...j,
          status: (j.attempt >= j.maxAttempts
            ? 'FAILED_TERMINAL'
            : 'FAILED_RETRYABLE') as JudgeJob['status'],
          failureReason: 'lease_expired',
          executionRequestId: undefined,
          executionAttemptId: undefined,
          resultGeneration: undefined,
          updatedAt: stamp(),
        });
        await this.redis.set(k, JSON.stringify(x));
        if (x.status === 'FAILED_RETRYABLE')
          await this.redis.lpush(this.queueKey, x.id);
        n++;
      }
    }
    return n;
  }
  async recoverStale(at = new Date()) {
    return this.exclusive(() => this.recoverStaleUnsafe(at));
  }
  async failTerminal(id: string, t: string, r: string) {
    return this.exclusive(async () => {
      const j = await this.read(id);
      lease(j, t);
      const x = clear({
        ...j,
        status: 'FAILED_TERMINAL' as const,
        failureReason: r,
        updatedAt: stamp(),
      });
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      return x;
    });
  }
  async cancel(id: string) {
    return this.exclusive(async () => {
      const j = await this.read(id);
      if (!j) throw new JudgeJobNotFoundError();
      if (
        [
          'SUCCEEDED_FAKE',
          'COMPLETED',
          'FAILED_TERMINAL',
          'CANCELLED',
        ].includes(j.status)
      )
        return j;
      const x = clear({
        ...j,
        status: 'CANCELLED' as const,
        failureReason: 'cancelled',
        cancellationGeneration: (j.cancellationGeneration ?? 0) + 1,
        completedAt: stamp(),
        updatedAt: stamp(),
      });
      await this.redis.set(this.jobKey(id), JSON.stringify(x));
      await this.redis.set(
        `${this.keyPrefix}:cancel:${id}`,
        new Date().toISOString(),
        'PX',
        86_400_000,
      );
      return x;
    });
  }
}
