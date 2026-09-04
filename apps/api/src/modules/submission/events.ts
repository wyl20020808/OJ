import type {
  SubmissionEvaluation,
  SubmissionEvaluationDetail,
  SubmissionEvaluationStatus,
  SubmissionVerdict,
} from './model.js';

export type EvaluationEvent = {
  id: number;
  type: 'evaluation.updated' | 'testcase.updated' | 'evaluation.terminal';
  submissionId: string;
  evaluationGeneration: number;
  status: SubmissionEvaluationStatus;
  updatedAt: string;
  verdict?: SubmissionVerdict;
  detail?: SubmissionEvaluationDetail;
  testcaseOrdinal?: number;
};
type Listener = (event: EvaluationEvent) => void;

/** Bounded Product-side delta fanout. Durable state stays in the repository. */
export class EvaluationEventHub {
  private cursor = 0;
  private readonly events: EvaluationEvent[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly fingerprints = new Map<string, string>();
  private readonly details = new Map<
    string,
    SubmissionEvaluationDetail | undefined
  >();
  constructor(private readonly maxEvents = 512) {}
  publish(evaluation: SubmissionEvaluation): EvaluationEvent | undefined {
    const key = `${evaluation.submissionId}:${evaluation.evaluationGeneration}`;
    const detail = evaluation.detail;
    const fingerprint = JSON.stringify({
      status: evaluation.status,
      verdict: evaluation.verdict,
      updatedAt: evaluation.updatedAt,
      detail: evaluation.detail,
    });
    if (this.fingerprints.get(key) === fingerprint) return undefined;
    const previous = this.details.get(key);
    this.details.set(key, detail);
    this.fingerprints.set(key, fingerprint);
    const terminal = [
      'COMPLETED_WITH_VERDICT',
      'CANCELLED',
      'INFRA_FAILED',
      'NO_VERDICT',
      'INCOMPLETE',
    ].includes(evaluation.status);
    const changedTestcase = detail?.testcases.find(
      (item, index) =>
        JSON.stringify(item) !== JSON.stringify(previous?.testcases[index]),
    );
    const event: EvaluationEvent = {
      id: ++this.cursor,
      type: terminal
        ? 'evaluation.terminal'
        : changedTestcase
          ? 'testcase.updated'
          : 'evaluation.updated',
      submissionId: evaluation.submissionId,
      evaluationGeneration: evaluation.evaluationGeneration,
      status: evaluation.status,
      updatedAt: evaluation.updatedAt,
      ...(evaluation.verdict ? { verdict: evaluation.verdict } : {}),
      ...(evaluation.detail ? { detail: evaluation.detail } : {}),
      ...(changedTestcase ? { testcaseOrdinal: changedTestcase.ordinal } : {}),
    };
    this.events.push(event);
    while (this.events.length > this.maxEvents) this.events.shift();
    for (const listener of this.listeners.get(evaluation.submissionId) ?? [])
      listener(event);
    return event;
  }
  subscribe(
    submissionId: string,
    afterId: number | undefined,
    listener: Listener,
  ) {
    const oldest = this.events[0]?.id;
    const replayGap =
      afterId !== undefined && oldest !== undefined && afterId < oldest - 1;
    if (!replayGap)
      for (const event of this.events)
        if (
          event.submissionId === submissionId &&
          (afterId === undefined || event.id > afterId)
        )
          listener(event);
    const listeners = this.listeners.get(submissionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(submissionId, listeners);
    return {
      replayGap,
      unsubscribe: () => {
        listeners.delete(listener);
        if (!listeners.size) this.listeners.delete(submissionId);
      },
    };
  }
}
