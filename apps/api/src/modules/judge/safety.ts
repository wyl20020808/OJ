import type { JudgeJob } from './model.js';

export type SafeJudgeLog = Pick<
  JudgeJob,
  'id' | 'submissionId' | 'status' | 'attempt'
> & {
  event: string;
};

export function safeJudgeLog(event: string, job: JudgeJob): SafeJudgeLog {
  return {
    event,
    id: job.id,
    submissionId: job.submissionId,
    status: job.status,
    attempt: job.attempt,
  };
}

export type ExecutionPrimitive =
  | 'compile'
  | 'execute'
  | 'eval'
  | 'shell'
  | 'dynamic-import'
  | 'compiler-launch'
  | 'interpreter-launch'
  | 'sandbox';

export class NoSourceExecutionGuard {
  readonly attempts: ExecutionPrimitive[] = [];
  forbid(operation: ExecutionPrimitive): never {
    this.attempts.push(operation);
    throw new Error(`Forbidden source operation: ${operation}`);
  }
  assertClear(): void {
    if (this.attempts.length > 0)
      throw new Error(
        `Source execution guard was invoked: ${this.attempts.join(', ')}`,
      );
  }
}
