import { createHash } from 'node:crypto';
import type { JudgeJob } from '../judge/model.js';
import type { PublishEvaluationInput } from './repository.js';
import type { SubmissionEvaluationStatus, SubmissionVerdict } from './model.js';

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value: unknown) =>
  createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
const verdicts = new Set<SubmissionVerdict>([
  'AC',
  'WA',
  'CE',
  'RE',
  'TLE',
  'MLE',
]);

export function publicationFromJudgeJob(
  job: JudgeJob,
): PublishEvaluationInput | undefined {
  const base = {
    submissionId: job.submissionId,
    judgeJobId: job.id,
    evaluationGeneration: job.evaluationGeneration ?? 1,
    attemptGeneration: job.resultGeneration ?? job.attempt,
    ...(job.testcaseSet?.testcaseSetId
      ? { testcaseSetId: job.testcaseSet.testcaseSetId }
      : {}),
    ...(job.testcaseSet?.manifestHash
      ? { manifestHash: job.testcaseSet.manifestHash }
      : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
  };
  if (job.status === 'CANCELLED')
    return {
      ...base,
      status: 'CANCELLED',
      evaluationRecordDigest: digest({ ...base, status: 'CANCELLED' }),
    };
  if (job.status === 'FAILED_TERMINAL')
    return {
      ...base,
      status: 'INFRA_FAILED',
      evaluationRecordDigest: digest({ ...base, status: 'INFRA_FAILED' }),
    };
  if (job.status !== 'COMPLETED' || !job.rawExecutionResult) return undefined;
  const record = job.rawExecutionResult.verdict_record;
  if (!record || typeof record !== 'object')
    return {
      ...base,
      status: 'NO_VERDICT',
      evaluationRecordDigest: digest({
        ...base,
        status: 'NO_VERDICT',
        raw: job.rawResultDigest,
      }),
    };
  const result = record as Record<string, unknown>;
  const verdict = result.overall_user_verdict;
  const state = result.evaluation_state;
  if (
    state === 'COMPLETE' &&
    typeof verdict === 'string' &&
    verdicts.has(verdict as SubmissionVerdict)
  ) {
    const verdictRecordDigest =
      typeof result.digest === 'string' ? result.digest : undefined;
    if (!verdictRecordDigest) return undefined;
    return {
      ...base,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: verdict as SubmissionVerdict,
      verdictRecordDigest,
      evaluationRecordDigest: digest({ ...base, verdict, verdictRecordDigest }),
    };
  }
  const status: SubmissionEvaluationStatus =
    job.rawExecutionResult.pipeline_outcome === 'PIPELINE_INFRA_FAILURE'
      ? 'INFRA_FAILED'
      : job.rawExecutionResult.pipeline_outcome === 'PIPELINE_CANCELLED'
        ? 'CANCELLED'
        : 'NO_VERDICT';
  return {
    ...base,
    status,
    evaluationRecordDigest: digest({
      ...base,
      status,
      raw: job.rawResultDigest,
    }),
  };
}
