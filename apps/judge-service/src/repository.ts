import type { Pool } from 'pg';
import type { StoredJudgeServiceJob } from './model.js';

type Queryable = Pick<Pool, 'query'>;

export interface JudgeServiceStateRepository {
  save(value: StoredJudgeServiceJob): Promise<StoredJudgeServiceJob>;
  getByJobId(jobId: string): Promise<StoredJudgeServiceJob | undefined>;
  getByClientRequestId(
    clientRequestId: string,
  ): Promise<StoredJudgeServiceJob | undefined>;
  listByExternalSubmissionId(
    externalSubmissionId: string,
  ): Promise<StoredJudgeServiceJob[]>;
}

export class InMemoryJudgeServiceStateRepository implements JudgeServiceStateRepository {
  private readonly byJobId = new Map<string, StoredJudgeServiceJob>();
  private readonly byRequestId = new Map<string, string>();

  async save(value: StoredJudgeServiceJob) {
    const existingId = this.byRequestId.get(value.clientRequestId);
    if (existingId && existingId !== value.result.judgeJobId)
      throw new Error('CLIENT_REQUEST_CONFLICT');
    const copy = structuredClone(value);
    this.byJobId.set(copy.result.judgeJobId, copy);
    this.byRequestId.set(copy.clientRequestId, copy.result.judgeJobId);
    return structuredClone(copy);
  }

  async getByJobId(jobId: string) {
    const value = this.byJobId.get(jobId);
    return value ? structuredClone(value) : undefined;
  }

  async getByClientRequestId(clientRequestId: string) {
    const jobId = this.byRequestId.get(clientRequestId);
    return jobId ? this.getByJobId(jobId) : undefined;
  }

  async listByExternalSubmissionId(externalSubmissionId: string) {
    return [...this.byJobId.values()]
      .filter(
        (value) => value.result.externalSubmissionId === externalSubmissionId,
      )
      .sort(
        (left, right) =>
          left.result.evaluationGeneration -
            right.result.evaluationGeneration ||
          left.result.attemptGeneration - right.result.attemptGeneration,
      )
      .map((value) => structuredClone(value));
  }
}

export class PostgresJudgeServiceStateRepository implements JudgeServiceStateRepository {
  constructor(private readonly pool: Queryable) {}

  async save(value: StoredJudgeServiceJob) {
    const result = await this.pool.query(
      'INSERT INTO judge_service_jobs (judge_job_id,client_request_id,external_submission_id,evaluation_generation,status,job_request,result_projection) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT (judge_job_id) DO UPDATE SET status=EXCLUDED.status,job_request=EXCLUDED.job_request,result_projection=EXCLUDED.result_projection,updated_at=now() RETURNING client_request_id,job_request,result_projection',
      [
        value.result.judgeJobId,
        value.clientRequestId,
        value.result.externalSubmissionId,
        value.result.evaluationGeneration,
        value.result.status,
        JSON.stringify(value.request),
        JSON.stringify(value.result),
      ],
    );
    await this.pool.query(
      'INSERT INTO judge_service_evaluations (judge_job_id,evaluation_generation,attempt_generation,status,verdict,result_digest,result_projection) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (judge_job_id,attempt_generation) DO UPDATE SET status=EXCLUDED.status,verdict=EXCLUDED.verdict,result_digest=EXCLUDED.result_digest,result_projection=EXCLUDED.result_projection,recorded_at=now()',
      [
        value.result.judgeJobId,
        value.result.evaluationGeneration,
        value.result.attemptGeneration,
        value.result.status,
        value.result.verdict ?? null,
        value.result.resultDigest ?? null,
        JSON.stringify(value.result),
      ],
    );
    return row(result.rows[0]!);
  }

  async getByJobId(jobId: string) {
    const result = await this.pool.query(
      'SELECT client_request_id,job_request,result_projection FROM judge_service_jobs WHERE judge_job_id=$1',
      [jobId],
    );
    return result.rows[0] ? row(result.rows[0]) : undefined;
  }

  async getByClientRequestId(clientRequestId: string) {
    const result = await this.pool.query(
      'SELECT client_request_id,job_request,result_projection FROM judge_service_jobs WHERE client_request_id=$1',
      [clientRequestId],
    );
    return result.rows[0] ? row(result.rows[0]) : undefined;
  }

  async listByExternalSubmissionId(externalSubmissionId: string) {
    const result = await this.pool.query(
      'SELECT client_request_id,job_request,result_projection FROM judge_service_jobs WHERE external_submission_id=$1 ORDER BY evaluation_generation,created_at',
      [externalSubmissionId],
    );
    return result.rows.map(row);
  }
}

function row(value: Record<string, unknown>): StoredJudgeServiceJob {
  return {
    clientRequestId: String(value.client_request_id),
    request: value.job_request as StoredJudgeServiceJob['request'],
    result: value.result_projection as StoredJudgeServiceJob['result'],
  };
}
