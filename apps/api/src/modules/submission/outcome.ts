import type {
  Submission,
  SubmissionEvaluation,
  SubmissionOutcome,
} from './model.js';

/** The only input Contract available to a future Contest module. */
export function authoritativeSubmissionOutcome(
  submission: Submission,
  evaluation: SubmissionEvaluation | undefined,
): SubmissionOutcome | undefined {
  if (!evaluation || !evaluation.current) return undefined;
  return {
    submissionId: submission.id,
    evaluationGeneration: evaluation.evaluationGeneration,
    problemId: submission.problemId,
    problemRevisionId: submission.problemRevisionId,
    testdataVersionRef: submission.testdataVersionRef,
    languageId: submission.languageId,
    status: evaluation.status,
    ...(evaluation.verdict ? { verdict: evaluation.verdict } : {}),
    ...(evaluation.completedAt ? { completedAt: evaluation.completedAt } : {}),
  };
}

export function publicSubmissionEvaluation(
  evaluation: SubmissionEvaluation | undefined,
) {
  if (!evaluation) return undefined;
  return {
    evaluationGeneration: evaluation.evaluationGeneration,
    attemptGeneration: evaluation.attemptGeneration,
    status: evaluation.status,
    ...(evaluation.status === 'COMPLETED_WITH_VERDICT' && evaluation.verdict
      ? { verdict: evaluation.verdict }
      : {}),
    ...(evaluation.completedAt ? { completedAt: evaluation.completedAt } : {}),
    current: evaluation.current,
  };
}
