import type { JudgeJob } from './model.js';

export type JudgeProgressPhase =
  | 'EVALUATION_QUEUED'
  | 'EVALUATION_STARTED'
  | 'TESTCASE_STARTED'
  | 'TESTCASE_TERMINAL'
  | 'EVALUATION_TERMINAL';

export type JudgeProgressEvent = {
  version: 'judge-progress.v1';
  id: number;
  phase: JudgeProgressPhase;
  judgeJobId: string;
  submissionId: string;
  evaluationGeneration: number;
  attemptGeneration: number;
  testcaseOrdinal?: number;
  testcaseId?: string;
  state?: string;
  verdict?: 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
  timeMs?: number;
  memoryBytes?: number;
  updatedAt: string;
};

export type JudgeProgressSink = (
  event: JudgeProgressEvent,
) => void | Promise<void>;

export const JUDGE_PROGRESS_EVENTS_CHANNEL = 'oj:judge-progress-events:v1';

const metric = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export class JudgeProgressEventBus {
  private cursor = 0;
  private readonly fingerprints = new Set<string>();
  private readonly listeners = new Set<JudgeProgressSink>();
  constructor(private readonly maxFingerprints = 2048) {}
  on(listener: JudgeProgressSink) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(input: Omit<JudgeProgressEvent, 'version' | 'id'>) {
    const fingerprint = JSON.stringify(input);
    if (this.fingerprints.has(fingerprint)) return undefined;
    this.fingerprints.add(fingerprint);
    while (this.fingerprints.size > this.maxFingerprints)
      this.fingerprints.delete(this.fingerprints.values().next().value!);
    const event: JudgeProgressEvent = {
      version: 'judge-progress.v1',
      id: ++this.cursor,
      ...input,
    };
    for (const listener of this.listeners) void listener(event);
    return event;
  }
}

export function testcaseTerminalEvents(
  job: JudgeJob,
): Array<Omit<JudgeProgressEvent, 'version' | 'id'>> {
  const raw = job.rawExecutionResult;
  const aggregate = raw?.aggregate_execution_set_record as
    { testcases?: Array<Record<string, unknown>> } | undefined;
  const verdict = raw?.verdict_record as
    { cases?: Array<Record<string, unknown>> } | undefined;
  if (!aggregate?.testcases || !Array.isArray(verdict?.cases)) return [];
  return aggregate.testcases.flatMap((member, index) => {
    const item = verdict.cases?.[index];
    if (!item || typeof item !== 'object') return [];
    const testcaseId =
      typeof member.testcase_id === 'string'
        ? member.testcase_id
        : typeof member.testcaseId === 'string'
          ? member.testcaseId
          : undefined;
    const caseVerdict = item.verdict;
    const safeVerdict =
      typeof caseVerdict === 'string'
        ? (caseVerdict as JudgeProgressEvent['verdict'])
        : undefined;
    const record =
      member.record && typeof member.record === 'object'
        ? (member.record as Record<string, unknown>)
        : undefined;
    const wall = record?.wall;
    const memory = record?.memory;
    const timeMs =
      wall && typeof wall === 'object'
        ? metric((wall as Record<string, unknown>).milliseconds)
        : undefined;
    const peak =
      memory && typeof memory === 'object'
        ? (memory as Record<string, unknown>).peak
        : undefined;
    const memoryBytes =
      peak && typeof peak === 'object'
        ? metric((peak as Record<string, unknown>).bytes)
        : undefined;
    return [
      {
        phase: 'TESTCASE_TERMINAL' as const,
        judgeJobId: job.id,
        submissionId: job.submissionId,
        evaluationGeneration: job.evaluationGeneration ?? 1,
        attemptGeneration: job.resultGeneration ?? job.attempt,
        testcaseOrdinal: index + 1,
        ...(testcaseId ? { testcaseId } : {}),
        state: item.evaluation_state === 'COMPLETE' ? 'TERMINAL' : 'UNKNOWN',
        ...(safeVerdict ? { verdict: safeVerdict } : {}),
        ...(timeMs !== undefined ? { timeMs } : {}),
        ...(memoryBytes !== undefined ? { memoryBytes } : {}),
        updatedAt: job.updatedAt,
      } satisfies Omit<JudgeProgressEvent, 'version' | 'id'>,
    ];
  });
}
