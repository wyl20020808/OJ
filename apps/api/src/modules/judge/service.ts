import { randomUUID } from 'node:crypto';
import type {
  JudgeJobCreateInput,
  JudgeJobRepository,
  SyntheticJudgeResult,
} from './model.js';

export class JudgeQueueService {
  constructor(private readonly repository: JudgeJobRepository) {}
  enqueue(input: JudgeJobCreateInput) {
    return this.repository.enqueue(input);
  }
  claim(workerId: string, leaseMs = 30_000) {
    return this.repository.claim(workerId, leaseMs);
  }
  complete(id: string, leaseToken: string) {
    return this.repository.complete(id, leaseToken);
  }
  retry(id: string, leaseToken: string, reason: string) {
    return this.repository.retry(id, leaseToken, reason);
  }
  recoverStale(now?: Date) {
    return this.repository.recoverStale(now);
  }
  failTerminal(id: string, leaseToken: string, reason: string) {
    return this.repository.failTerminal(id, leaseToken, reason);
  }
}

export class DeterministicFakeJudgeWorker {
  constructor(
    private readonly queue: JudgeQueueService,
    private readonly workerId = `fake-${randomUUID()}`,
  ) {}
  async processOne(): Promise<SyntheticJudgeResult | undefined> {
    const claim = await this.queue.claim(this.workerId);
    if (!claim) return undefined;
    // Qualification-only control input: this worker never reads or transforms submission source.
    const result: SyntheticJudgeResult = {
      kind: 'SYNTHETIC_QUALIFICATION_ONLY',
      outcome: 'FIXTURE_PASS',
      jobId: claim.job.id,
      attempt: claim.job.attempt,
    };
    await this.queue.complete(claim.job.id, claim.leaseToken);
    return result;
  }
}
