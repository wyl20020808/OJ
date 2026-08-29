import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  JudgeJobConflictError,
  JudgeJobNotFoundError,
  JudgeJobPayloadError,
  type JudgeJob,
  type JudgeJobCreateInput,
  type JudgeJobRepository,
} from './model.js';
const Q = 'oj:judge:queue',
  jobKey = (id: string) => `oj:judge:job:${id}`,
  subKey = (id: string) => `oj:judge:submission:${id}`,
  lockKey = 'oj:judge:claim-lock';
const stamp = () => new Date().toISOString();
const normalize = (i: JudgeJobCreateInput): JudgeJob => {
  if (
    !i.submissionId ||
    !i.ownerUserId ||
    !i.problemId ||
    !i.problemRevisionId ||
    !i.testdataVersionRef ||
    !i.languageId
  )
    throw new JudgeJobPayloadError('Missing immutable linkage');
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
    status: 'QUEUED',
    attempt: 0,
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
  const states = [
    'QUEUED',
    'LEASED_FAKE',
    'SUCCEEDED_FAKE',
    'FAILED_RETRYABLE',
    'FAILED_TERMINAL',
    'CANCELLED',
  ];
  if (
    typeof j.id !== 'string' ||
    typeof j.submissionId !== 'string' ||
    typeof j.idempotencyKey !== 'string' ||
    typeof j.ownerUserId !== 'string' ||
    typeof j.problemId !== 'string' ||
    typeof j.problemRevisionId !== 'string' ||
    typeof j.testdataVersionRef !== 'string' ||
    typeof j.languageId !== 'string' ||
    !states.includes(String(j.status)) ||
    !Number.isSafeInteger(j.attempt) ||
    Number(j.attempt) < 0 ||
    !Number.isSafeInteger(j.maxAttempts) ||
    Number(j.maxAttempts) < 1 ||
    typeof j.createdAt !== 'string' ||
    Number.isNaN(Date.parse(j.createdAt as string)) ||
    typeof j.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(j.updatedAt as string))
  )
    throw new JudgeJobPayloadError();
  if (
    j.status === 'LEASED_FAKE' &&
    (typeof j.leaseOwner !== 'string' ||
      typeof j.leaseToken !== 'string' ||
      typeof j.leaseExpiresAt !== 'string' ||
      Number.isNaN(Date.parse(j.leaseExpiresAt as string)))
  )
    throw new JudgeJobPayloadError('Missing lease metadata');
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
    j.status !== 'LEASED_FAKE' ||
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
          status: 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken: token,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          updatedAt: stamp(),
        };
      this.jobs.set(j.id, leased);
      return { job: { ...leased }, leaseToken: token };
    });
  }
  async complete(id: string, t: string, f: string) {
    return this.atomic(async () => {
      const j = this.jobs.get(id);
      if (j?.status === 'SUCCEEDED_FAKE') return { ...j };
      lease(j, t);
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
        j.status === 'LEASED_FAKE' &&
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
}
export type RedisJudgeClient = Pick<
  Redis,
  'set' | 'get' | 'del' | 'keys' | 'lpush' | 'rpop'
>;
export class RedisJudgeJobRepository implements JudgeJobRepository {
  constructor(private redis: RedisJudgeClient) {}
  private async read(id: string) {
    const raw = await this.redis.get(jobKey(id));
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
    const existing = await this.redis.get(subKey(i.submissionId));
    if (existing) {
      const j = await this.read(existing);
      if (!j) throw new JudgeJobPayloadError('Broken idempotency index');
      return { job: j, created: false };
    }
    const j = normalize(i);
    if ((await this.redis.set(jobKey(j.id), JSON.stringify(j), 'NX')) !== 'OK')
      throw new JudgeJobConflictError();
    if ((await this.redis.set(subKey(i.submissionId), j.id, 'NX')) !== 'OK') {
      await this.redis.del(jobKey(j.id));
      const id = await this.redis.get(subKey(i.submissionId)),
        winner = id ? await this.read(id) : undefined;
      if (!winner)
        throw new JudgeJobConflictError(
          'Concurrent enqueue winner unavailable',
        );
      return { job: winner, created: false };
    }
    await this.redis.lpush(Q, j.id);
    return { job: j, created: true };
  }
  async getById(id: string) {
    return this.read(id);
  }
  async getBySubmissionId(id: string) {
    const j = await this.redis.get(subKey(id));
    return j ? this.read(j) : undefined;
  }
  async claim(worker: string, ms: number) {
    const token = randomUUID();
    const ok = await (
      this.redis.set as (...a: unknown[]) => Promise<string | null>
    )(lockKey, token, 'PX', Math.max(1000, ms), 'NX');
    if (ok !== 'OK') return undefined;
    try {
      await this.recoverStale();
      const id = await this.redis.rpop(Q);
      if (!id) return undefined;
      const j = await this.read(id);
      if (!j || !(j.status === 'QUEUED' || j.status === 'FAILED_RETRYABLE'))
        return undefined;
      const leaseToken = randomUUID(),
        x: JudgeJob = {
          ...j,
          status: 'LEASED_FAKE',
          attempt: j.attempt + 1,
          leaseOwner: worker,
          leaseToken,
          leaseExpiresAt: new Date(Date.now() + ms).toISOString(),
          updatedAt: stamp(),
        };
      await this.redis.set(jobKey(id), JSON.stringify(x));
      return { job: x, leaseToken };
    } finally {
      await this.redis.del(lockKey);
    }
  }
  async complete(id: string, t: string, f: string) {
    const j = await this.read(id);
    if (j?.status === 'SUCCEEDED_FAKE') return j;
    lease(j, t);
    const x = clear({
      ...j,
      status: 'SUCCEEDED_FAKE' as const,
      syntheticFixtureId: f,
      completedAt: stamp(),
      updatedAt: stamp(),
    });
    await this.redis.set(jobKey(id), JSON.stringify(x));
    return x as JudgeJob;
  }
  async retry(id: string, t: string, r: string) {
    const j = await this.read(id);
    lease(j, t);
    const x = clear({
      ...j,
      status: (j.attempt >= j.maxAttempts
        ? 'FAILED_TERMINAL'
        : 'FAILED_RETRYABLE') as JudgeJob['status'],
      failureReason: r,
      updatedAt: stamp(),
    });
    await this.redis.set(jobKey(id), JSON.stringify(x));
    if (x.status === 'FAILED_RETRYABLE') await this.redis.lpush(Q, id);
    return x;
  }
  async recoverStale(at = new Date()) {
    let n = 0;
    for (const k of await this.redis.keys('oj:judge:job:*')) {
      const j = await this.read(k.slice('oj:judge:job:'.length));
      if (
        j?.status === 'LEASED_FAKE' &&
        j.leaseExpiresAt &&
        Date.parse(j.leaseExpiresAt) <= at.getTime()
      ) {
        const x = clear({
          ...j,
          status: (j.attempt >= j.maxAttempts
            ? 'FAILED_TERMINAL'
            : 'FAILED_RETRYABLE') as JudgeJob['status'],
          failureReason: 'lease_expired',
          updatedAt: stamp(),
        });
        await this.redis.set(k, JSON.stringify(x));
        if (x.status === 'FAILED_RETRYABLE') await this.redis.lpush(Q, x.id);
        n++;
      }
    }
    return n;
  }
  async failTerminal(id: string, t: string, r: string) {
    const j = await this.read(id);
    lease(j, t);
    const x = clear({
      ...j,
      status: 'FAILED_TERMINAL' as const,
      failureReason: r,
      updatedAt: stamp(),
    });
    await this.redis.set(jobKey(id), JSON.stringify(x));
    return x;
  }
}
