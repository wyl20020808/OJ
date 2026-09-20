import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { JudgeArtifactReference } from '@ojplatform/judge-runtime';
import type { Submission } from './model.js';
import type { SubmissionRepository } from './repository.js';
import {
  JudgeDispatchError,
  type JudgeServiceJob,
} from './judge-service-client.js';

type Database = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
type Claim = { requestId: string; claimId: string; attempts: number };
export class SubmissionDispatchStore {
  constructor(private readonly db: Database) {}
  async claim(submissionId: string): Promise<Claim | undefined> {
    const claimId = randomUUID();
    const result = await this.db.query(
      "UPDATE submission_dispatches SET state='DELIVERING',attempts=attempts+1,claim_id=$2,lease_until=now()+interval '30 seconds',updated_at=now() WHERE submission_id=$1 AND ((state IN ('QUEUED','RETRY') AND next_attempt_at<=now()) OR (state='DELIVERING' AND lease_until<now())) RETURNING request_id,attempts",
      [submissionId, claimId],
    );
    const row = result.rows[0];
    return row
      ? {
          requestId: String(row.request_id),
          claimId,
          attempts: Number(row.attempts),
        }
      : undefined;
  }
  async due() {
    const result = await this.db.query(
      "SELECT submission_id FROM submission_dispatches WHERE (state IN ('QUEUED','RETRY') AND next_attempt_at<=now()) OR (state='DELIVERING' AND lease_until<now()) ORDER BY next_attempt_at LIMIT 8",
    );
    return result.rows.map((row) => String(row.submission_id));
  }
  async success(
    id: string,
    claim: Claim,
    artifactId: string,
    judgeJobId: string,
  ) {
    await this.db.query(
      "WITH completed AS (UPDATE submission_dispatches SET state='SUCCEEDED',artifact_id=$3,judge_job_id=$4,failure_code=NULL,claim_id=NULL,lease_until=NULL,updated_at=now() WHERE submission_id=$1 AND claim_id=$2 RETURNING submission_id) UPDATE submissions SET dispatch_failure_code=NULL WHERE id IN (SELECT submission_id FROM completed)",
      [id, claim.claimId, artifactId, judgeJobId],
    );
  }
  async failure(id: string, claim: Claim, code: string, retry: boolean) {
    const again = retry && claim.attempts < 5;
    await this.db.query(
      "WITH failed AS (UPDATE submission_dispatches SET state=$3,failure_code=$4,claim_id=NULL,lease_until=NULL,next_attempt_at=now()+($5*interval '1 second'),updated_at=now() WHERE submission_id=$1 AND claim_id=$2 RETURNING submission_id) UPDATE submissions SET status=$6,dispatch_failure_code=$4,updated_at=now() WHERE id IN (SELECT submission_id FROM failed) AND NOT EXISTS (SELECT 1 FROM submission_evaluations WHERE submission_id=$1)",
      [
        id,
        claim.claimId,
        again ? 'RETRY' : 'FAILED',
        code,
        Math.min(60, 2 ** claim.attempts),
        again ? 'RETRYABLE_FAILURE' : 'PROTOCOL_FAILURE',
      ],
    );
  }
  async retry(id: string) {
    await this.db.query(
      "UPDATE submission_dispatches SET state='RETRY',attempts=0,next_attempt_at=now(),updated_at=now() WHERE submission_id=$1 AND state='FAILED'",
      [id],
    );
  }
}

export class SubmissionDispatcher {
  private active: Promise<void> | undefined;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly store: SubmissionDispatchStore,
    private readonly submissions: SubmissionRepository,
    private readonly artifact: (
      submission: Submission,
    ) => Promise<JudgeArtifactReference>,
    private readonly send: (
      submission: Submission,
      artifact: JudgeArtifactReference,
      requestId: string,
    ) => Promise<Pick<JudgeServiceJob, 'judgeJobId'>>,
    private readonly logger: FastifyBaseLogger,
  ) {}
  async dispatch(submission: Submission) {
    const claim = await this.store.claim(submission.id);
    if (!claim) return;
    const fields = {
      requestId: claim.requestId,
      submissionId: submission.id,
      evaluationGeneration: 1,
      dispatchAttempt: claim.attempts,
    };
    try {
      if (claim.attempts > 5)
        throw new JudgeDispatchError('JUDGE_DISPATCH_UNAVAILABLE', 503, false);
      const artifact = await this.artifact(submission);
      this.logger.info(
        { ...fields, artifactId: artifact.id },
        'submission dispatch',
      );
      const job = await this.send(submission, artifact, claim.requestId);
      await this.submissions.beginEvaluation!(submission.id, job.judgeJobId, {
        testcaseCount: artifact.testcaseCount,
        completedTestcaseCount: 0,
        testcases: artifact.manifest.entries.map((entry) => ({
          ordinal: entry.index + 1,
          status: 'WAITING',
        })),
      });
      await this.store.success(
        submission.id,
        claim,
        artifact.id,
        job.judgeJobId,
      );
      this.logger.info(
        { ...fields, artifactId: artifact.id, judgeJobId: job.judgeJobId },
        'submission dispatched',
      );
    } catch (error) {
      const known = (error && typeof error === 'object' ? error : {}) as {
        code?: unknown;
        status?: unknown;
        retryable?: unknown;
      };
      const codes = new Set([
        'ARTIFACT_UNAVAILABLE',
        'ARTIFACT_CHECKSUM_MISMATCH',
        'INVALID_ARTIFACT_CONTRACT',
        'JUDGE_CONFLICT',
        'JUDGE_DISPATCH_UNAVAILABLE',
        'JUDGE_DISPATCH_TIMEOUT',
        'JUDGE_CAPACITY_UNAVAILABLE',
        'INTEGRITY_MISMATCH',
        'JUDGE_DATA_BINDING_MISMATCH',
        'STORAGE_UNAVAILABLE',
      ]);
      const code =
        typeof known.code === 'string' && codes.has(known.code)
          ? known.code
          : 'JUDGE_DISPATCH_UNAVAILABLE';
      const retry =
        known.retryable !== undefined
          ? known.retryable === true
          : [
              'ARTIFACT_UNAVAILABLE',
              'JUDGE_DISPATCH_UNAVAILABLE',
              'STORAGE_UNAVAILABLE',
            ].includes(code);
      await this.store.failure(submission.id, claim, code, retry);
      this.logger.error(
        { ...fields, code, retryable: retry },
        'submission dispatch failed',
      );
      throw new JudgeDispatchError(
        code,
        typeof known.status === 'number' ? known.status : 503,
        retry,
      );
    }
  }
  start() {
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = this.recover()
        .catch((error) =>
          this.logger.error(
            { errorClass: error instanceof Error ? error.name : 'Error' },
            'dispatch recovery unavailable',
          ),
        )
        .finally(() => {
          this.active = undefined;
        });
    }, 2000);
    this.timer.unref();
  }
  private async recover() {
    for (const id of await this.store.due()) {
      const submission = await this.submissions.get(id);
      if (!submission) continue;
      try {
        await this.dispatch(submission);
      } catch (error) {
        if (!(error instanceof JudgeDispatchError)) throw error;
      }
    }
  }
  async retry(submission: Submission) {
    await this.store.retry(submission.id);
    await this.dispatch(submission);
  }
  async close() {
    clearInterval(this.timer);
    await this.active;
  }
}
