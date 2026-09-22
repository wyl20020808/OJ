import { createHash } from 'node:crypto';
import type { JudgeJob } from '@ojplatform/judge-runtime';
import {
  JUDGE_SERVICE_API_VERSION,
  type JudgeServiceDetail,
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

const value = (source: unknown): Record<string, unknown> | undefined =>
  source && typeof source === 'object' && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : undefined;
const integer = (source: unknown): number | undefined =>
  typeof source === 'number' && Number.isSafeInteger(source) && source >= 0
    ? source
    : undefined;
const measurement = (source: unknown, units: string) => {
  const record = value(source);
  return record?.available === true && record.units === units
    ? integer(record.value)
    : undefined;
};

const safeDiagnostics = (source: unknown) => {
  if (typeof source !== 'string' || !source) return undefined;
  const bytes = Buffer.from(source, 'utf8');
  const truncated = bytes.byteLength > 8192;
  const text = bytes.subarray(0, 8192).toString('utf8');
  return {
    diagnostics: text
      .replace(/(?:[A-Za-z]:)?(?:\\|\/)[^\s:]+/g, '<path>')
      .replace(
        /\b(token|secret|password|api[_-]?key)\s*=\s*\S+/gi,
        (_match, key: string) => `${key}=<redacted>`,
      ),
    truncated,
  };
};
const safeOutput = (source: unknown) =>
  typeof source === 'string'
    ? Buffer.from(source, 'utf8')
        .subarray(0, 64 * 1024)
        .toString('utf8')
    : '';
const safeMetric = (source: unknown) =>
  typeof source === 'number' && Number.isSafeInteger(source) && source >= 0
    ? source
    : null;
const projectCodeRun = (
  job: JudgeJob,
): JudgeServiceResult['codeRun'] | undefined => {
  if (job.problemId !== '__adhoc_code_run__' || !job.rawExecutionResult)
    return undefined;
  const raw = job.rawExecutionResult;
  const runtime = value(raw.runtime);
  const compile = value(raw.compile);
  const diagnostics = safeDiagnostics(compile?.stderr);
  const facts = value(runtime?.facts);
  const codeStatus =
    raw.pipeline_outcome === 'PIPELINE_COMPILE_FAILED'
      ? 'COMPILE_ERROR'
      : raw.pipeline_outcome === 'PIPELINE_LIMIT_HIT' &&
          facts?.memory_limit_event
        ? 'MEMORY_LIMIT'
        : raw.pipeline_outcome === 'PIPELINE_LIMIT_HIT'
          ? 'TIME_LIMIT'
          : raw.pipeline_outcome === 'PIPELINE_CANCELLED'
            ? 'CANCELLED'
            : raw.pipeline_outcome === 'PIPELINE_INFRA_FAILURE'
              ? 'INFRA_ERROR'
              : runtime &&
                  ((facts?.exit_code !== undefined && facts.exit_code !== 0) ||
                    facts?.termination_signal)
                ? 'RUNTIME_ERROR'
                : 'SUCCEEDED';
  return {
    status: codeStatus,
    stdout: safeOutput(runtime?.stdout),
    stderr: safeOutput(runtime?.stderr),
    compilerDiagnostics:
      raw.pipeline_outcome === 'PIPELINE_COMPILE_FAILED'
        ? (diagnostics?.diagnostics ?? null)
        : null,
    exitCode: safeMetric(runtime?.exit_code),
    timeMs: safeMetric(runtime?.wall_time_ms),
    memoryBytes: safeMetric(runtime?.memory_bytes),
  };
};

const runtimeReason = (reasonCode: unknown, exitCode: number | undefined) => {
  if (reasonCode === 'TIME_LIMIT_ENFORCED')
    return {
      runtimeReasonCode: reasonCode,
      runtimeReason: 'Time limit exceeded',
    };
  if (reasonCode === 'MEMORY_LIMIT_ENFORCED')
    return {
      runtimeReasonCode: reasonCode,
      runtimeReason: 'Memory limit exceeded',
    };
  if (reasonCode === 'USER_RUNTIME_FAILURE' && exitCode !== undefined)
    return {
      runtimeReasonCode: reasonCode,
      runtimeReason: `Process exited with code ${exitCode}`,
    };
  return undefined;
};

/** Reduces sealed Judge facts to the Product's terminal, browser-safe read DTO. */
export function projectJudgeServiceDetail(
  job: JudgeJob,
): JudgeServiceDetail | undefined {
  const raw = job.rawExecutionResult;
  const verdict = value(raw?.verdict_record);
  const aggregate = value(raw?.aggregate_execution_set_record);
  if (!raw || !verdict || !aggregate || verdict.evaluation_state !== 'COMPLETE')
    return undefined;
  const overall = verdict.overall_user_verdict;
  if (
    typeof overall !== 'string' ||
    !verdicts.has(overall as JudgeServiceVerdict)
  )
    return undefined;
  const members = aggregate.testcases;
  const cases = verdict.cases;
  if (!Array.isArray(members) || !Array.isArray(cases)) return undefined;
  if (overall === 'CE') {
    if (cases.length) return undefined;
    const compile = value(raw.compile);
    const diagnostics = safeDiagnostics(compile?.stderr);
    const durationMs = integer(compile?.wall_time_ms);
    return {
      testcaseCount: 0,
      completedTestcaseCount: 0,
      testcases: [],
      compile: {
        status: 'FAILED',
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(diagnostics?.diagnostics
          ? { diagnostics: diagnostics.diagnostics }
          : {}),
        truncated: Boolean(diagnostics?.truncated || compile?.stderr_truncated),
      },
    };
  }
  if (members.length !== cases.length || !members.length) return undefined;
  const testcases: JudgeServiceDetail['testcases'] = [];
  for (let index = 0; index < members.length; index++) {
    const member = value(members[index]);
    const caseRecord = value(cases[index]);
    const record = value(member?.record);
    const caseVerdict = caseRecord?.verdict;
    if (
      !member ||
      !caseRecord ||
      !record ||
      member.status !== 'RAW_COMPLETED' ||
      caseRecord.evaluation_state !== 'COMPLETE' ||
      caseRecord.testcase_index !== index ||
      typeof caseVerdict !== 'string' ||
      !verdicts.has(caseVerdict as JudgeServiceVerdict)
    )
      return undefined;
    const exitCode = integer(value(record.facts)?.exit_code);
    const timeMs = measurement(record.wall, 'milliseconds');
    const memoryBytes = measurement(value(record.memory)?.peak, 'bytes');
    const reason = runtimeReason(caseRecord.reason_code, exitCode);
    testcases.push({
      ordinal: index + 1,
      verdict: caseVerdict as JudgeServiceVerdict,
      ...(timeMs !== undefined ? { timeMs } : {}),
      ...(memoryBytes !== undefined ? { memoryBytes } : {}),
      ...(reason && exitCode !== undefined ? { exitCode } : {}),
      ...(reason ?? {}),
    });
  }
  const times = testcases.map((item) => item.timeMs);
  const memory = testcases.map((item) => item.memoryBytes);
  return {
    testcaseCount: testcases.length,
    completedTestcaseCount: testcases.length,
    ...(times.every((item) => item !== undefined)
      ? { totalTimeMs: times.reduce((sum, item) => sum + item!, 0) }
      : {}),
    ...(memory.every((item) => item !== undefined)
      ? { peakMemoryBytes: Math.max(...memory.map((item) => item!)) }
      : {}),
    testcases,
  };
}

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
  const codeRun = projectCodeRun(job);
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
              : codeRun && job.status === 'COMPLETED'
                ? raw?.pipeline_outcome === 'PIPELINE_COMPILE_FAILED'
                  ? 'NO_VERDICT'
                  : 'NO_VERDICT'
                : 'NO_VERDICT';
  const resultDigest =
    status === 'COMPLETED_WITH_VERDICT' && typeof record?.digest === 'string'
      ? record.digest
      : job.rawResultDigest;
  const detail =
    status === 'COMPLETED_WITH_VERDICT'
      ? projectJudgeServiceDetail(job)
      : undefined;
  return {
    apiVersion: JUDGE_SERVICE_API_VERSION,
    judgeJobId: job.id,
    externalSubmissionId: job.submissionId,
    evaluationGeneration: job.evaluationGeneration ?? 1,
    status,
    attemptGeneration: job.resultGeneration ?? job.attempt,
    languageId: job.languageId,
    executionMode: job.executionMode,
    ...(job.testcaseSet || job.judgeArtifact
      ? {
          testcaseSetId: (job.testcaseSet ?? job.judgeArtifact!.manifest)
            .testcaseSetId,
          manifestHash: (job.testcaseSet ?? job.judgeArtifact!.manifest)
            .manifestHash,
        }
      : {}),
    ...(verdict ? { verdict } : {}),
    ...(resultDigest ? { resultDigest } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(detail ? { detail } : {}),
    acceptedAt,
    updatedAt: job.updatedAt,
    ...(codeRun ? { codeRun } : {}),
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
