import type { Pool } from 'pg';
import type { StoredJudgeServiceJob } from './model.js';
import type {
  JudgePoolAuditRecord,
  JudgePoolPolicy,
} from './pool-autoscaler.js';

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
  listAll(): Promise<StoredJudgeServiceJob[]>;
  getPoolPolicy?(): Promise<JudgePoolPolicy | undefined>;
  savePoolPolicy?(value: JudgePoolPolicy): Promise<JudgePoolPolicy>;
  appendAutoscalerDecision?(value: JudgePoolAuditRecord): Promise<void>;
  listAutoscalerDecisions?(limit?: number): Promise<JudgePoolAuditRecord[]>;
}

export class InMemoryJudgeServiceStateRepository implements JudgeServiceStateRepository {
  private readonly byJobId = new Map<string, StoredJudgeServiceJob>();
  private readonly byRequestId = new Map<string, string>();
  private poolPolicy: JudgePoolPolicy | undefined;
  private readonly autoscalerDecisions: JudgePoolAuditRecord[] = [];

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
  async listAll() {
    return [...this.byJobId.values()]
      .sort((left, right) =>
        left.result.judgeJobId.localeCompare(right.result.judgeJobId),
      )
      .map((value) => structuredClone(value));
  }

  async getPoolPolicy() {
    return this.poolPolicy ? structuredClone(this.poolPolicy) : undefined;
  }

  async savePoolPolicy(value: JudgePoolPolicy) {
    this.poolPolicy = structuredClone(value);
    return structuredClone(value);
  }

  async appendAutoscalerDecision(value: JudgePoolAuditRecord) {
    this.autoscalerDecisions.push(structuredClone(value));
    while (this.autoscalerDecisions.length > 500)
      this.autoscalerDecisions.shift();
  }

  async listAutoscalerDecisions(limit = 100) {
    return this.autoscalerDecisions
      .slice(-Math.max(0, limit))
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
  async listAll() {
    const result = await this.pool.query(
      'SELECT client_request_id,job_request,result_projection FROM judge_service_jobs ORDER BY judge_job_id',
    );
    return result.rows.map(row);
  }

  async getPoolPolicy() {
    const result = await this.pool.query(
      'SELECT policy FROM judge_pool_control WHERE control_id=1',
    );
    return result.rows[0]?.policy as JudgePoolPolicy | undefined;
  }

  async savePoolPolicy(value: JudgePoolPolicy) {
    const result = await this.pool.query(
      'INSERT INTO judge_pool_control (control_id,policy,control_version,updated_at) VALUES (1,$1::jsonb,$2,now()) ON CONFLICT (control_id) DO UPDATE SET policy=EXCLUDED.policy,control_version=EXCLUDED.control_version,updated_at=now() RETURNING policy',
      [JSON.stringify(value), value.controlVersion],
    );
    return result.rows[0]!.policy as JudgePoolPolicy;
  }

  async appendAutoscalerDecision(value: JudgePoolAuditRecord) {
    await this.pool.query(
      'INSERT INTO judge_autoscaler_decisions (decision_id,decision,created_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT (decision_id) DO NOTHING',
      [value.decisionId, JSON.stringify(value)],
    );
  }

  async listAutoscalerDecisions(limit = 100) {
    const bounded = Math.min(500, Math.max(1, Math.floor(limit)));
    const result = await this.pool.query(
      'SELECT decision FROM judge_autoscaler_decisions ORDER BY created_at DESC LIMIT $1',
      [bounded],
    );
    return result.rows
      .reverse()
      .map((item) => item.decision as JudgePoolAuditRecord);
  }
}

function row(value: Record<string, unknown>): StoredJudgeServiceJob {
  return {
    clientRequestId: String(value.client_request_id),
    request: value.job_request as StoredJudgeServiceJob['request'],
    result: value.result_projection as StoredJudgeServiceJob['result'],
  };
}
