import type {
  SubmissionEvaluation,
  SubmissionEvaluationDetail,
  SubmissionEvaluationStatus,
  SubmissionVerdict,
} from './model.js';
import type { JudgeProgressEvent } from '@ojplatform/judge-runtime';

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

export type EvaluationEventBus = Pick<
  EvaluationEventHub,
  'publish' | 'subscribe'
>;
export type RedisEventClient = {
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  on(
    event: 'message',
    listener: (channel: string, message: string) => void,
  ): unknown;
};

export class RedisJudgeProgressBridge {
  private connected = false;
  constructor(
    private readonly subscriber: RedisEventClient,
    private readonly handle: (
      event: JudgeProgressEvent,
    ) => void | Promise<void>,
  ) {
    this.subscriber.on('message', (channel, message) => {
      if (channel !== JUDGE_PROGRESS_EVENTS_CHANNEL) return;
      try {
        const event = JSON.parse(message) as JudgeProgressEvent;
        if (
          event?.version === 'judge-progress.v1' &&
          typeof event.id === 'number' &&
          typeof event.judgeJobId === 'string' &&
          typeof event.submissionId === 'string'
        )
          void Promise.resolve(this.handle(event)).catch(() => undefined);
      } catch {
        // Invalid transport payload cannot replace the durable snapshot.
      }
    });
  }
  async connect() {
    if (this.connected) return;
    await this.subscriber.subscribe(JUDGE_PROGRESS_EVENTS_CHANNEL);
    this.connected = true;
  }
}

export const JUDGE_PROGRESS_EVENTS_CHANNEL = 'oj:judge-progress-events:v1';

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

  ingest(event: EvaluationEvent) {
    const key = `${event.submissionId}:${event.evaluationGeneration}`;
    const fingerprint = JSON.stringify({
      status: event.status,
      verdict: event.verdict,
      updatedAt: event.updatedAt,
      detail: event.detail,
    });
    if (this.fingerprints.get(key) === fingerprint) return false;
    this.fingerprints.set(key, fingerprint);
    this.cursor = Math.max(this.cursor, event.id);
    this.events.push(event);
    while (this.events.length > this.maxEvents) this.events.shift();
    for (const listener of this.listeners.get(event.submissionId) ?? [])
      listener(event);
    return true;
  }
}

export const EVALUATION_EVENTS_CHANNEL = 'oj:evaluation-events:v1';

/** Redis Pub/Sub fanout for multi-instance Product API deployments. */
export class RedisEvaluationEventHub implements EvaluationEventBus {
  private readonly local: EvaluationEventHub;
  private connected = false;
  constructor(
    private readonly publisher: RedisEventClient,
    private readonly subscriber: RedisEventClient,
    maxEvents = 512,
  ) {
    this.local = new EvaluationEventHub(maxEvents);
    this.subscriber.on('message', (channel, message) => {
      if (channel !== EVALUATION_EVENTS_CHANNEL) return;
      try {
        const event = JSON.parse(message) as EvaluationEvent;
        if (
          event &&
          typeof event.id === 'number' &&
          typeof event.submissionId === 'string'
        )
          this.local.ingest(event);
      } catch {
        // Invalid transport payload cannot replace the durable snapshot.
      }
    });
  }
  async connect() {
    if (this.connected) return;
    await this.subscriber.subscribe(EVALUATION_EVENTS_CHANNEL);
    this.connected = true;
  }
  publish(evaluation: SubmissionEvaluation) {
    const event = this.local.publish(evaluation);
    if (event)
      void this.publisher
        .publish(EVALUATION_EVENTS_CHANNEL, JSON.stringify(event))
        .catch(() => undefined);
    return event;
  }
  subscribe(
    submissionId: string,
    afterId: number | undefined,
    listener: Listener,
  ) {
    return this.local.subscribe(submissionId, afterId, listener);
  }
}
