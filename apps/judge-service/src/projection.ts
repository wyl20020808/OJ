import { createHash } from 'node:crypto';
import type { JudgeJob } from '@ojplatform/judge-runtime';
import {
  JUDGE_SERVICE_API_VERSION,
  type JudgeServiceResult,
  type JudgeServiceStatus,
  type JudgeServiceVerdict,
} from './model.js';

const verdicts = new Set<JudgeServiceVerdict>([
  'AC',
  'WA',
  'CE',
  'RE',
  'TLE',
  'MLE',
]);

export function projectJudgeServiceResult(
  job: JudgeJob,
  acceptedAt = job.createdAt,
): JudgeServiceResult {
  const raw = job.rawExecutionResult;
  const record = raw?.verdict_record;
  const verdict =
    record &&
    typeof record.overall_user_verdict === 'string' &&
    verdicts.has(record.overall_user_verdict as JudgeServiceVerdict)
      ? (record.overall_user_verdict as JudgeServiceVerdict)
      : undefined;
  const status: JudgeServiceStatus =
    job.status === 'QUEUED' || job.status === 'FAILED_RETRYABLE'
      ? 'QUEUED'
      : job.status === 'LEASED' || job.status === 'LEASED_FAKE'
        ? 'RUNNING'
        : job.status === 'CANCELLED'
          ? 'CANCELLED'
          : job.status === 'FAILED_TERMINAL'
            ? 'INFRA_FAILED'
            : job.status === 'COMPLETED' && verdict
              ? 'COMPLETED_WITH_VERDICT'
              : 'NO_VERDICT';
  const resultDigest =
    status === 'COMPLETED_WITH_VERDICT' && typeof record?.digest === 'string'
      ? record.digest
      : job.rawResultDigest;
  return {
    apiVersion: JUDGE_SERVICE_API_VERSION,
    judgeJobId: job.id,
    externalSubmissionId: job.submissionId,
    evaluationGeneration: job.evaluationGeneration ?? 1,
    status,
    attemptGeneration: job.resultGeneration ?? job.attempt,
    languageId: job.languageId,
    executionMode: job.executionMode,
    ...(job.testcaseSet
      ? {
          testcaseSetId: job.testcaseSet.testcaseSetId,
          manifestHash: job.testcaseSet.manifestHash,
        }
      : {}),
    ...(verdict ? { verdict } : {}),
    ...(resultDigest ? { resultDigest } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    acceptedAt,
    updatedAt: job.updatedAt,
  };
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const requestDigest = (value: unknown) =>
  createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
