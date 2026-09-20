import {
  JudgeDispatchError,
  productPublication,
  type JudgeServiceClient,
  type JudgeServiceJob,
} from '../submission/judge-service-client.js';
import type { SubmissionRepository } from '../submission/repository.js';
import type {
  CancellableJudgeJob,
  JudgeJobCancellationPlane,
} from './worker-control.js';

/**
 * Judge Service statuses that already published or abandoned an evaluation and
 * therefore must reject a new cancellation instead of rewriting a final result.
 */
const terminalStatuses = [
  'COMPLETED_WITH_VERDICT',
  'INFRA_FAILED',
  'NO_VERDICT',
] as const;

const view = (job: JudgeServiceJob): CancellableJudgeJob => {
  const publication = productPublication(job);
  return {
    judgeJobId: job.judgeJobId,
    status: job.status,
    attempt: job.attemptGeneration,
    // The Judge Protocol publishes attempts per generation but no retry budget,
    // so the product response reports the same value the queue exposes: none.
    maxAttempts: 0,
    terminal: terminalStatuses.includes(
      job.status as (typeof terminalStatuses)[number],
    ),
    ...(publication ? { publication } : {}),
  };
};

/**
 * Cancellation through the Judge Service control plane.
 *
 * The API-local Redis judge keyspace only owns API-enqueued jobs; every
 * production submission is dispatched through the Judge Service, which keeps
 * its own queue. Cancelling in the API-local keyspace therefore does nothing
 * for production jobs, so the product must use the Judge Protocol instead of
 * reaching into queue internals.
 */
export function createJudgeServiceCancellationPlane(
  judgeService: JudgeServiceClient,
  submissions: Pick<SubmissionRepository, 'getEvaluation'>,
): JudgeJobCancellationPlane {
  return {
    async getBySubmissionId(submissionId) {
      const evaluation = await submissions.getEvaluation?.(submissionId);
      if (!evaluation) return undefined;
      try {
        return view(await judgeService.get(evaluation.judgeJobId));
      } catch (error) {
        // A job the control plane no longer tracks is a missing judge job, not
        // a control-plane outage.
        if (
          error instanceof JudgeDispatchError &&
          error.code === 'JUDGE_JOB_NOT_FOUND'
        )
          return undefined;
        throw error;
      }
    },
    async cancel(judgeJobId) {
      return view(await judgeService.cancel(judgeJobId));
    },
  };
}
