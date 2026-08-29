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
  complete(id: string, token: string, fixtureId = 'control-pass-v1') {
    return this.repository.complete(id, token, fixtureId);
  }
  retry(id: string, token: string, reason: string) {
    return this.repository.retry(id, token, reason);
  }
  recoverStale(at?: Date) {
    return this.repository.recoverStale(at);
  }
  failTerminal(id: string, token: string, reason: string) {
    return this.repository.failTerminal(id, token, reason);
  }
}
export const SYNTHETIC_FIXTURES = Object.freeze({
  'control-pass-v1': Object.freeze({ outcome: 'FIXTURE_PASS' as const }),
  'control-fail-v1': Object.freeze({ outcome: 'FIXTURE_FAIL' as const }),
});
export class DeterministicFakeJudgeWorker {
  constructor(
    private readonly queue: JudgeQueueService,
    private readonly workerId = `fake-${randomUUID()}`,
  ) {}
  async processOne(
    fixtureId: keyof typeof SYNTHETIC_FIXTURES = 'control-pass-v1',
  ): Promise<SyntheticJudgeResult | undefined> {
    const fixture = SYNTHETIC_FIXTURES[fixtureId];
    if (!fixture) throw new Error('Unknown synthetic fixture');
    const claim = await this.queue.claim(this.workerId);
    if (!claim) return undefined;
    const result: SyntheticJudgeResult = {
      kind: 'SYNTHETIC_QUALIFICATION_ONLY',
      outcome: fixture.outcome,
      jobId: claim.job.id,
      attempt: claim.job.attempt,
      fixtureId,
    };
    await this.queue.complete(claim.job.id, claim.leaseToken, fixtureId);
    return result;
  }
}
