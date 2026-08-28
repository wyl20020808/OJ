import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  JudgeJobConflictError,
  JudgeJobNotFoundError,
  type JudgeJob,
  type JudgeJobClaim,
  type JudgeJobCreateInput,
  type JudgeJobRepository,
} from './model.js';

const now = () => new Date().toISOString();
const jobKey = (id: string) => `oj:judge:job:${id}`;
const submissionKey = (id: string) => `oj:judge:submission:${id}`;

function normalize(input: JudgeJobCreateInput): JudgeJob {
  const timestamp = now();
  return {
    ...input,
    id: randomUUID(),
    status: 'QUEUED',
    attempt: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assertLease(
  job: JudgeJob | undefined,
  token: string,
): asserts job is JudgeJob {
  if (!job) throw new JudgeJobNotFoundError();
  if (job.status !== 'LEASED' || job.leaseToken !== token)
    throw new JudgeJobConflictError();
}

export class InMemoryJudgeJobRepository implements JudgeJobRepository {
  private readonly jobs = new Map<string, JudgeJob>();
  private readonly bySubmission = new Map<string, string>();

  async enqueue(input: JudgeJobCreateInput) {
    const existingId = this.bySubmission.get(input.submissionId);
    if (existingId)
      return { job: { ...this.jobs.get(existingId)! }, created: false };
    const job = normalize(input);
    this.jobs.set(job.id, job);
    this.bySubmission.set(job.submissionId, job.id);
    return { job: { ...job }, created: true };
  }
  async getById(id: string) {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }
  async getBySubmissionId(submissionId: string) {
    const id = this.bySubmission.get(submissionId);
    return id ? this.getById(id) : undefined;
  }
  async claim(workerId: string, leaseMs: number) {
    await this.recoverStale();
    const job = [...this.jobs.values()].find(
      (value) =>
        value.status === 'QUEUED' || value.status === 'RETRYABLE_FAILURE',
    );
    if (!job) return undefined;
    const token = randomUUID();
    const leased = {
      ...job,
      status: 'LEASED' as const,
      attempt: job.attempt + 1,
      workerId,
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
      updatedAt: now(),
    };
    this.jobs.set(job.id, leased);
    return { job: { ...leased }, leaseToken: token } satisfies JudgeJobClaim;
  }
  async complete(id: string, leaseToken: string) {
    const job = this.jobs.get(id);
    if (job?.status === 'COMPLETED') return { ...job };
    assertLease(job, leaseToken);
    const completed = {
      ...job,
      status: 'COMPLETED' as const,
      completedAt: now(),
      updatedAt: now(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    };
    this.jobs.set(id, completed);
    return { ...completed };
  }
  async retry(id: string, leaseToken: string, reason: string) {
    const job = this.jobs.get(id);
    assertLease(job, leaseToken);
    const nextStatus =
      job.attempt >= job.maxAttempts ? 'TERMINAL_FAILURE' : 'RETRYABLE_FAILURE';
    const updated = {
      ...job,
      status: nextStatus as JudgeJob['status'],
      failureReason: reason,
      updatedAt: now(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }
  async recoverStale(at = new Date()) {
    let recovered = 0;
    for (const job of this.jobs.values()) {
      if (
        job.status === 'LEASED' &&
        job.leaseExpiresAt &&
        Date.parse(job.leaseExpiresAt) <= at.getTime()
      ) {
        const updated = {
          ...job,
          status:
            job.attempt >= job.maxAttempts
              ? ('TERMINAL_FAILURE' as const)
              : ('RETRYABLE_FAILURE' as const),
          failureReason: 'lease_expired',
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          workerId: undefined,
          updatedAt: now(),
        };
        this.jobs.set(job.id, updated);
        recovered++;
      }
    }
    return recovered;
  }
  async failTerminal(id: string, leaseToken: string, reason: string) {
    const job = this.jobs.get(id);
    assertLease(job, leaseToken);
    const updated = {
      ...job,
      status: 'TERMINAL_FAILURE' as const,
      failureReason: reason,
      updatedAt: now(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
    };
    this.jobs.set(id, updated);
    return { ...updated };
  }
}

export class RedisJudgeJobRepository implements JudgeJobRepository {
  constructor(
    private readonly redis: Pick<
      Redis,
      'set' | 'get' | 'del' | 'keys' | 'lpush' | 'rpop' | 'hset' | 'hgetall'
    >,
  ) {}
  async enqueue(input: JudgeJobCreateInput) {
    const existing = await this.redis.get(submissionKey(input.submissionId));
    if (existing)
      return {
        job: JSON.parse((await this.redis.get(jobKey(existing)))!) as JudgeJob,
        created: false,
      };
    const job = normalize(input);
    // Persist the payload before publishing the submission index. This avoids
    // readers observing an index whose job body is not durable yet.
    await this.redis.set(jobKey(job.id), JSON.stringify(job), 'NX');
    const claimed = await this.redis.set(
      submissionKey(input.submissionId),
      job.id,
      'NX',
    );
    if (claimed !== 'OK') {
      await this.redis.del(jobKey(job.id));
      const existingId = await this.redis.get(
        submissionKey(input.submissionId),
      );
      const existingJob = existingId
        ? await this.redis.get(jobKey(existingId))
        : null;
      if (!existingJob) throw new Error('Judge job index unavailable');
      return { job: JSON.parse(existingJob) as JudgeJob, created: false };
    }
    await this.redis.lpush('oj:judge:queue', job.id);
    return { job, created: true };
  }
  async getById(id: string) {
    const value = await this.redis.get(jobKey(id));
    return value ? (JSON.parse(value) as JudgeJob) : undefined;
  }
  async getBySubmissionId(submissionId: string) {
    const id = await this.redis.get(submissionKey(submissionId));
    return id ? this.getById(id) : undefined;
  }
  async claim(workerId: string, leaseMs: number) {
    const lockToken = randomUUID();
    const locked = await (
      this.redis.set as (...args: unknown[]) => Promise<string | null>
    )('oj:judge:claim-lock', lockToken, 'PX', Math.max(1000, leaseMs), 'NX');
    if (locked !== 'OK') return undefined;
    const id = await this.redis.rpop('oj:judge:queue');
    try {
      if (!id) return undefined;
      const job = await this.getById(id);
      if (
        !job ||
        (job.status !== 'QUEUED' && job.status !== 'RETRYABLE_FAILURE')
      )
        return undefined;
      const leaseToken = randomUUID();
      const leased = {
        ...job,
        status: 'LEASED' as const,
        attempt: job.attempt + 1,
        workerId,
        leaseToken,
        leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
        updatedAt: now(),
      };
      await this.redis.set(jobKey(id), JSON.stringify(leased));
      return { job: leased, leaseToken };
    } finally {
      await this.redis.del('oj:judge:claim-lock');
    }
  }
  async complete(id: string, token: string) {
    const job = await this.getById(id);
    if (job?.status === 'COMPLETED') return job;
    assertLease(job, token);
    const updated = {
      ...job,
      status: 'COMPLETED' as const,
      completedAt: now(),
      updatedAt: now(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    };
    await this.redis.set(jobKey(id), JSON.stringify(updated));
    return updated;
  }
  async retry(id: string, token: string, reason: string) {
    const job = await this.getById(id);
    assertLease(job, token);
    const updated = {
      ...job,
      status: (job.attempt >= job.maxAttempts
        ? 'TERMINAL_FAILURE'
        : 'RETRYABLE_FAILURE') as JudgeJob['status'],
      failureReason: reason,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
      updatedAt: now(),
    };
    await this.redis.set(jobKey(id), JSON.stringify(updated));
    if (updated.status === 'RETRYABLE_FAILURE')
      await this.redis.lpush('oj:judge:queue', id);
    return updated;
  }
  async recoverStale(at = new Date()) {
    let count = 0;
    for (const key of await this.redis.keys('oj:judge:job:*')) {
      const job = await this.getById(key.slice('oj:judge:job:'.length));
      if (
        job?.status === 'LEASED' &&
        job.leaseExpiresAt &&
        Date.parse(job.leaseExpiresAt) <= at.getTime()
      ) {
        const updated = {
          ...job,
          status:
            job.attempt >= job.maxAttempts
              ? ('TERMINAL_FAILURE' as const)
              : ('RETRYABLE_FAILURE' as const),
          failureReason: 'lease_expired',
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          workerId: undefined,
          updatedAt: now(),
        };
        await this.redis.set(key, JSON.stringify(updated));
        if (updated.status === 'RETRYABLE_FAILURE')
          await this.redis.lpush('oj:judge:queue', updated.id);
        count++;
      }
    }
    return count;
  }
  async failTerminal(id: string, token: string, reason: string) {
    const job = await this.getById(id);
    assertLease(job, token);
    const updated = {
      ...job,
      status: 'TERMINAL_FAILURE' as const,
      failureReason: reason,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
      updatedAt: now(),
    };
    await this.redis.set(jobKey(id), JSON.stringify(updated));
    return updated;
  }
}
