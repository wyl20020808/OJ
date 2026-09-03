import { randomUUID } from 'node:crypto';
import type {
  Submission,
  SubmissionCreateInput,
  GlobalSubmissionListQuery,
  SubmissionListQuery,
  SubmissionEvaluation,
  SubmissionEvaluationDetail,
  SubmissionEvaluationStatus,
  SubmissionJudgeBinding,
  SubmissionVerdict,
} from './model.js';

type QueryResult = { rows: Record<string, unknown>[] };
type PoolLike = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  connect?: () => Promise<{
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    release(): void;
  }>;
};
const now = () => new Date().toISOString();

export interface SubmissionRepository {
  create(
    input: SubmissionCreateInput &
      Partial<SubmissionJudgeBinding> & { ownerUserId: string },
  ): Promise<Submission>;
  get(id: string): Promise<Submission | undefined>;
  list(
    query: SubmissionListQuery,
  ): Promise<{ items: Submission[]; nextCursor?: string }>;
  listGlobal(
    query: GlobalSubmissionListQuery,
  ): Promise<{ items: Submission[]; nextCursor?: string }>;
  getEvaluation?(
    submissionId: string,
  ): Promise<SubmissionEvaluation | undefined>;
  listEvaluationHistory?(submissionId: string): Promise<SubmissionEvaluation[]>;
  publishEvaluation?(
    input: PublishEvaluationInput,
  ): Promise<SubmissionEvaluation>;
  beginEvaluation?(
    submissionId: string,
    judgeJobId: string,
  ): Promise<SubmissionEvaluation>;
  startRejudge?(
    submissionId: string,
    judgeJobId: string,
  ): Promise<SubmissionEvaluation>;
  cancelEvaluation?(
    submissionId: string,
    judgeJobId: string,
  ): Promise<SubmissionEvaluation | undefined>;
}

export type PublishEvaluationInput = {
  submissionId: string;
  judgeJobId: string;
  evaluationGeneration: number;
  attemptGeneration: number;
  status: SubmissionEvaluationStatus;
  verdict?: SubmissionVerdict;
  testcaseSetId?: string;
  manifestHash?: string;
  verdictRecordDigest?: string;
  detail?: SubmissionEvaluationDetail;
  evaluationRecordDigest: string;
  completedAt?: string;
};

export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly rows = new Map<string, Submission>();
  private readonly evaluations = new Map<string, SubmissionEvaluation[]>();
  async create(
    input: SubmissionCreateInput &
      Partial<SubmissionJudgeBinding> & { ownerUserId: string },
  ) {
    const timestamp = now();
    const submission: Submission = {
      ...input,
      id: randomUUID(),
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.rows.set(submission.id, submission);
    this.evaluations.set(submission.id, []);
    return { ...submission };
  }
  async getEvaluation(submissionId: string) {
    const item = this.evaluations
      .get(submissionId)
      ?.find((item) => item.current);
    return item ? { ...item } : undefined;
  }
  async listEvaluationHistory(submissionId: string) {
    return (this.evaluations.get(submissionId) ?? []).map((item) => ({
      ...item,
    }));
  }
  async publishEvaluation(input: PublishEvaluationInput) {
    const submission = this.rows.get(input.submissionId);
    if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
    const history = this.evaluations.get(input.submissionId) ?? [];
    const existing = history.find(
      (item) => item.evaluationGeneration === input.evaluationGeneration,
    );
    if (existing) {
      if (existing.judgeJobId !== input.judgeJobId)
        throw new Error('STALE_EVALUATION');
      const matchingDigest =
        existing.evaluationRecordDigest === input.evaluationRecordDigest ||
        (!!existing.verdictRecordDigest &&
          existing.verdictRecordDigest === input.verdictRecordDigest);
      if (
        !existing.current &&
        (!matchingDigest ||
          existing.status !== input.status ||
          existing.verdict !== input.verdict ||
          existing.attemptGeneration !== input.attemptGeneration ||
          existing.detail ||
          !input.detail)
      )
        throw new Error('STALE_EVALUATION');
      if (
        [
          'COMPLETED_WITH_VERDICT',
          'CANCELLED',
          'INFRA_FAILED',
          'NO_VERDICT',
          'INCOMPLETE',
        ].includes(existing.status)
      ) {
        if (
          existing.judgeJobId === input.judgeJobId &&
          existing.status === input.status &&
          existing.verdict === input.verdict &&
          matchingDigest &&
          existing.attemptGeneration === input.attemptGeneration
        ) {
          if (!existing.current) {
            if (!existing.detail && input.detail) {
              existing.detail = input.detail;
              existing.updatedAt = now();
              return { ...existing };
            }
            throw new Error('STALE_EVALUATION');
          }
          if (sameDetail(existing.detail, input.detail)) return { ...existing };
          if (!existing.detail && input.detail) {
            existing.detail = input.detail;
            existing.updatedAt = now();
            return { ...existing };
          }
        }
        throw new Error('CONFLICTING_PUBLICATION');
      }
      if (input.attemptGeneration < existing.attemptGeneration)
        throw new Error('STALE_ATTEMPT');
      Object.assign(existing, input, { updatedAt: now(), current: true });
      submission.status = intakeStatus(input.status);
      submission.updatedAt = existing.updatedAt;
      return { ...existing };
    }
    const current = history.find((item) => item.current);
    if (current && input.evaluationGeneration < current.evaluationGeneration)
      throw new Error('STALE_EVALUATION');
    if (input.status === 'COMPLETED_WITH_VERDICT' && !input.verdict)
      throw new Error('INVALID_VERDICT');
    if (input.status !== 'COMPLETED_WITH_VERDICT' && input.verdict)
      throw new Error('INVALID_VERDICT');
    const timestamp = now();
    const record: SubmissionEvaluation = {
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
      current: true,
    };
    for (const item of history) item.current = false;
    history.push(record);
    this.evaluations.set(input.submissionId, history);
    submission.status = intakeStatus(input.status);
    submission.updatedAt = timestamp;
    return { ...record };
  }
  async beginEvaluation(submissionId: string, judgeJobId: string) {
    const submission = this.rows.get(submissionId);
    if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
    const history = this.evaluations.get(submissionId) ?? [];
    const current = history.find((item) => item.current);
    if (current) {
      if (current.judgeJobId === judgeJobId) return { ...current };
      throw new Error('EVALUATION_ALREADY_EXISTS');
    }
    const timestamp = now();
    const record: SubmissionEvaluation = {
      submissionId,
      evaluationGeneration: 1,
      attemptGeneration: 0,
      judgeJobId,
      status: 'QUEUED',
      evaluationRecordDigest: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      current: true,
    };
    history.push(record);
    this.evaluations.set(submissionId, history);
    return { ...record };
  }
  async startRejudge(submissionId: string, judgeJobId: string) {
    const current = await this.getEvaluation(submissionId);
    if (current && ['REJUDGE_PENDING', 'REJUDGING'].includes(current.status)) {
      if (current.judgeJobId === judgeJobId) return current;
      throw new Error('EVALUATION_ALREADY_EXISTS');
    }
    const submission = this.rows.get(submissionId);
    if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
    const history = this.evaluations.get(submissionId) ?? [];
    const generation = (history.at(-1)?.evaluationGeneration ?? 0) + 1;
    const timestamp = now();
    for (const item of history) item.current = false;
    const record: SubmissionEvaluation = {
      submissionId,
      evaluationGeneration: generation,
      attemptGeneration: 0,
      judgeJobId,
      status: 'REJUDGE_PENDING',
      evaluationRecordDigest: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      current: true,
    };
    history.push(record);
    this.evaluations.set(submissionId, history);
    submission.status = 'PENDING';
    submission.updatedAt = timestamp;
    return { ...record };
  }
  async cancelEvaluation(submissionId: string, judgeJobId: string) {
    const current = await this.getEvaluation(submissionId);
    if (
      !current ||
      current.judgeJobId !== judgeJobId ||
      ['COMPLETED_WITH_VERDICT', 'CANCELLED', 'INFRA_FAILED'].includes(
        current.status,
      )
    )
      return current;
    return this.publishEvaluation({
      submissionId,
      judgeJobId,
      evaluationGeneration: current.evaluationGeneration,
      attemptGeneration: current.attemptGeneration,
      status: 'CANCELLED',
      evaluationRecordDigest: `${current.evaluationGeneration}:${current.attemptGeneration}:cancelled`,
      completedAt: now(),
    });
  }
  async get(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }
  async list(query: SubmissionListQuery) {
    const offset = decodeCursor(query.cursor);
    const rows = [...this.rows.values()]
      .filter(
        (row) =>
          (!query.ownerUserId || row.ownerUserId === query.ownerUserId) &&
          (!query.problemId || row.problemId === query.problemId),
      )
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    const page = rows.slice(offset, offset + query.limit);
    return {
      items: page.map((row) => ({ ...row })),
      ...(offset + page.length < rows.length
        ? { nextCursor: encodeCursor(offset + page.length) }
        : {}),
    };
  }
  async listGlobal(query: GlobalSubmissionListQuery) {
    const cursor = decodeGlobalCursor(query.cursor);
    const rows = [...this.rows.values()]
      .filter((row) => {
        const evaluation = this.evaluations
          .get(row.id)
          ?.find((item) => item.current);
        return (
          (!query.ownerUserId || row.ownerUserId === query.ownerUserId) &&
          (!query.problemId || row.problemId === query.problemId) &&
          (!query.languageId || row.languageId === query.languageId) &&
          (!query.evaluationStatus ||
            evaluation?.status === query.evaluationStatus) &&
          (!query.verdict || evaluation?.verdict === query.verdict) &&
          (!cursor ||
            row.createdAt < cursor.createdAt ||
            (row.createdAt === cursor.createdAt && row.id < cursor.id))
        );
      })
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    const page = rows.slice(0, query.limit + 1);
    const items = page.slice(0, query.limit).map((row) => ({ ...row }));
    return {
      items,
      ...(page.length > query.limit && items.length
        ? { nextCursor: encodeGlobalCursor(items.at(-1)!) }
        : {}),
    };
  }
}

function intakeStatus(
  status: SubmissionEvaluationStatus,
): Submission['status'] {
  if (status === 'COMPLETED_WITH_VERDICT') return 'EXECUTION_COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'QUEUED' || status === 'REJUDGE_PENDING') return 'PENDING';
  if (status === 'RUNNING' || status === 'REJUDGING') return 'LEASED';
  return 'PROTOCOL_FAILURE';
}

export class PostgresSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: PoolLike) {}
  async create(
    input: SubmissionCreateInput &
      Partial<SubmissionJudgeBinding> & { ownerUserId: string },
  ) {
    const id = randomUUID();
    const result = await this.pool.query(
      'INSERT INTO submissions (id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,judge_data_version_id,judge_data_version_number,judge_data_manifest_sha256,language_id,source,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [
        id,
        input.ownerUserId,
        input.problemId,
        input.problemRevisionId,
        input.testdataVersionRef,
        input.judgeDataVersionId ?? null,
        input.judgeDataVersionNumber ?? null,
        input.judgeDataManifestSha256 ?? null,
        input.languageId,
        input.source,
        'PENDING',
      ],
    );
    return mapRow(result.rows[0]!);
  }
  async get(id: string) {
    const result = await this.pool.query(
      'SELECT * FROM submissions WHERE id=$1',
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
  async list(query: SubmissionListQuery) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (query.ownerUserId) {
      params.push(query.ownerUserId);
      clauses.push(`owner_user_id=$${params.length}`);
    }
    if (query.problemId) {
      params.push(query.problemId);
      clauses.push(`problem_id=$${params.length}`);
    }
    const offset = decodeCursor(query.cursor);
    params.push(query.limit, offset);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT * FROM submissions ${where} ORDER BY created_at ASC,id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const items = result.rows.map(mapRow);
    return {
      items,
      ...(items.length === query.limit
        ? { nextCursor: encodeCursor(offset + items.length) }
        : {}),
    };
  }
  async listGlobal(query: GlobalSubmissionListQuery) {
    const cursor = decodeGlobalCursor(query.cursor);
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (query.ownerUserId) {
      params.push(query.ownerUserId);
      clauses.push(`s.owner_user_id=$${params.length}`);
    }
    if (query.problemId) {
      params.push(query.problemId);
      clauses.push(`s.problem_id=$${params.length}`);
    }
    if (query.languageId) {
      params.push(query.languageId);
      clauses.push(`s.language_id=$${params.length}`);
    }
    if (query.evaluationStatus) {
      params.push(query.evaluationStatus);
      clauses.push(`e.status=$${params.length}`);
    }
    if (query.verdict) {
      params.push(query.verdict);
      clauses.push(`e.verdict=$${params.length}`);
    }
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      clauses.push(
        `(s.created_at < $${params.length - 1} OR (s.created_at = $${params.length - 1} AND s.id < $${params.length}))`,
      );
    }
    params.push(query.limit + 1);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT s.* FROM submissions s LEFT JOIN submission_evaluations e ON e.submission_id=s.id AND e.current=true ${where} ORDER BY s.created_at DESC,s.id DESC LIMIT $${params.length}`,
      params,
    );
    const page = result.rows.map(mapRow);
    const items = page.slice(0, query.limit);
    return {
      items,
      ...(page.length > query.limit && items.length
        ? { nextCursor: encodeGlobalCursor(items.at(-1)!) }
        : {}),
    };
  }
  async getEvaluation(submissionId: string) {
    const result = await this.pool.query(
      'SELECT * FROM submission_evaluations WHERE submission_id=$1 AND current=true',
      [submissionId],
    );
    return result.rows[0] ? mapEvaluation(result.rows[0]) : undefined;
  }
  async listEvaluationHistory(submissionId: string) {
    const result = await this.pool.query(
      'SELECT * FROM submission_evaluations WHERE submission_id=$1 ORDER BY evaluation_generation ASC',
      [submissionId],
    );
    return result.rows.map(mapEvaluation);
  }
  async beginEvaluation(submissionId: string, judgeJobId: string) {
    const result = await this.pool.query(
      "WITH inserted AS (INSERT INTO submission_evaluations (submission_id,evaluation_generation,attempt_generation,judge_job_id,status,evaluation_record_digest,current) SELECT $1,1,0,$2,'QUEUED','',true WHERE NOT EXISTS (SELECT 1 FROM submission_evaluations WHERE submission_id=$1) RETURNING *) UPDATE submissions SET status='PENDING',updated_at=now() WHERE id=$1 AND EXISTS (SELECT 1 FROM inserted) RETURNING (SELECT row_to_json(inserted) FROM inserted) AS evaluation",
      [submissionId, judgeJobId],
    );
    if (result.rows[0]?.evaluation)
      return mapEvaluation(
        result.rows[0].evaluation as Record<string, unknown>,
      );
    const existing = await this.getEvaluation(submissionId);
    if (existing?.judgeJobId === judgeJobId) return existing;
    throw new Error('EVALUATION_ALREADY_EXISTS');
  }
  async publishEvaluation(input: PublishEvaluationInput) {
    if (input.status === 'COMPLETED_WITH_VERDICT' && !input.verdict)
      throw new Error('INVALID_VERDICT');
    if (input.status !== 'COMPLETED_WITH_VERDICT' && input.verdict)
      throw new Error('INVALID_VERDICT');
    const result = await this.pool.query(
      "WITH updated AS (UPDATE submission_evaluations SET attempt_generation=$4,status=$5,verdict=$6,testcase_set_id=$7,manifest_hash=$8,verdict_record_digest=$9,evaluation_record_digest=$10,completed_at=$11,detail=$12::jsonb,updated_at=now() WHERE submission_id=$1 AND evaluation_generation=$2 AND judge_job_id=$3 AND current=true AND status IN ('QUEUED','RUNNING','REJUDGE_PENDING','REJUDGING') AND attempt_generation <= $4 RETURNING *), submission_update AS (UPDATE submissions SET status=CASE (SELECT status FROM updated) WHEN 'COMPLETED_WITH_VERDICT' THEN 'EXECUTION_COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'QUEUED' THEN 'PENDING' WHEN 'REJUDGE_PENDING' THEN 'PENDING' WHEN 'RUNNING' THEN 'LEASED' WHEN 'REJUDGING' THEN 'LEASED' ELSE 'PROTOCOL_FAILURE' END,updated_at=now() WHERE id=$1 AND EXISTS (SELECT 1 FROM updated)) SELECT * FROM updated",
      [
        input.submissionId,
        input.evaluationGeneration,
        input.judgeJobId,
        input.attemptGeneration,
        input.status,
        input.verdict ?? null,
        input.testcaseSetId ?? null,
        input.manifestHash ?? null,
        input.verdictRecordDigest ?? null,
        input.evaluationRecordDigest,
        input.completedAt ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
      ],
    );
    if (result.rows[0]) return mapEvaluation(result.rows[0]);
    const existing = (
      await this.listEvaluationHistory(input.submissionId)
    ).find((item) => item.evaluationGeneration === input.evaluationGeneration);
    const matchingDigest =
      existing &&
      (existing.evaluationRecordDigest === input.evaluationRecordDigest ||
        (!!existing.verdictRecordDigest &&
          existing.verdictRecordDigest === input.verdictRecordDigest));
    if (
      existing &&
      existing.evaluationGeneration === input.evaluationGeneration &&
      existing.judgeJobId === input.judgeJobId &&
      existing.status === input.status &&
      existing.verdict === input.verdict &&
      matchingDigest &&
      existing.attemptGeneration === input.attemptGeneration &&
      !existing.detail &&
      input.detail
    ) {
      const backfill = await this.pool.query(
        'UPDATE submission_evaluations SET detail=$6::jsonb,updated_at=now() WHERE submission_id=$1 AND evaluation_generation=$2 AND judge_job_id=$3 AND status=$4 AND verdict IS NOT DISTINCT FROM $5 AND (evaluation_record_digest=$7 OR (verdict_record_digest IS NOT NULL AND verdict_record_digest=$9)) AND attempt_generation=$8 AND detail IS NULL RETURNING *',
        [
          input.submissionId,
          input.evaluationGeneration,
          input.judgeJobId,
          input.status,
          input.verdict ?? null,
          JSON.stringify(input.detail),
          input.evaluationRecordDigest,
          input.attemptGeneration,
          input.verdictRecordDigest ?? null,
        ],
      );
      if (backfill.rows[0]) return mapEvaluation(backfill.rows[0]);
    }
    if (existing && !existing.current) throw new Error('STALE_EVALUATION');
    if (
      existing &&
      existing.evaluationGeneration === input.evaluationGeneration &&
      matchingDigest &&
      existing.attemptGeneration === input.attemptGeneration &&
      sameDetail(existing.detail, input.detail)
    )
      return existing;
    throw new Error(
      existing?.evaluationGeneration === input.evaluationGeneration
        ? 'CONFLICTING_PUBLICATION'
        : 'STALE_EVALUATION',
    );
  }
  async startRejudge(submissionId: string, judgeJobId: string) {
    if (this.pool.connect) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          'SELECT * FROM submission_evaluations WHERE submission_id=$1 FOR UPDATE',
          [submissionId],
        );
        const current = locked.rows.find((row) => Boolean(row.current));
        if (
          current &&
          ['REJUDGE_PENDING', 'REJUDGING'].includes(String(current.status))
        ) {
          await client.query('COMMIT');
          if (String(current.judge_job_id) === judgeJobId)
            return mapEvaluation(current);
          throw new Error('EVALUATION_ALREADY_EXISTS');
        }
        const generation =
          Math.max(
            0,
            ...locked.rows.map((row) => Number(row.evaluation_generation)),
          ) + 1;
        await client.query(
          'UPDATE submission_evaluations SET current=false,updated_at=now() WHERE submission_id=$1 AND current=true',
          [submissionId],
        );
        const inserted = await client.query(
          "INSERT INTO submission_evaluations (submission_id,evaluation_generation,attempt_generation,judge_job_id,status,evaluation_record_digest,current) VALUES ($1,$2,0,$3,'REJUDGE_PENDING','',true) RETURNING *",
          [submissionId, generation, judgeJobId],
        );
        await client.query(
          "UPDATE submissions SET status='PENDING',updated_at=now() WHERE id=$1",
          [submissionId],
        );
        await client.query('COMMIT');
        if (inserted.rows[0]) return mapEvaluation(inserted.rows[0]);
        throw new Error('SUBMISSION_NOT_FOUND');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original transaction error.
        }
        throw error;
      } finally {
        client.release();
      }
    }
    const result = await this.pool.query(
      "WITH next_generation AS (SELECT COALESCE(max(evaluation_generation),0)+1 AS generation FROM submission_evaluations WHERE submission_id=$1), previous AS (UPDATE submission_evaluations SET current=false,updated_at=now() WHERE submission_id=$1 AND current=true), inserted AS (INSERT INTO submission_evaluations (submission_id,evaluation_generation,attempt_generation,judge_job_id,status,evaluation_record_digest,current) SELECT $1,(SELECT generation FROM next_generation),0,$2,'REJUDGE_PENDING','',true RETURNING *), submission_update AS (UPDATE submissions SET status='PENDING',updated_at=now() WHERE id=$1 AND EXISTS (SELECT 1 FROM inserted)) SELECT * FROM inserted",
      [submissionId, judgeJobId],
    );
    if (!result.rows[0]) throw new Error('SUBMISSION_NOT_FOUND');
    return mapEvaluation(result.rows[0]);
  }
  async cancelEvaluation(submissionId: string, judgeJobId: string) {
    const current = await this.getEvaluation(submissionId);
    if (!current || current.judgeJobId !== judgeJobId) return current;
    if (
      ['COMPLETED_WITH_VERDICT', 'CANCELLED', 'INFRA_FAILED'].includes(
        current.status,
      )
    )
      return current;
    return this.publishEvaluation({
      submissionId,
      judgeJobId,
      evaluationGeneration: current.evaluationGeneration,
      attemptGeneration: current.attemptGeneration,
      status: 'CANCELLED',
      evaluationRecordDigest: `${current.evaluationGeneration}:${current.attemptGeneration}:cancelled`,
      completedAt: now(),
    });
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}
function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function encodeGlobalCursor(submission: Submission) {
  return Buffer.from(
    JSON.stringify({ createdAt: submission.createdAt, id: submission.id }),
    'utf8',
  ).toString('base64url');
}
function decodeGlobalCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { createdAt?: unknown }).createdAt !== 'string' ||
      typeof (value as { id?: unknown }).id !== 'string'
    )
      throw new Error('INVALID_CURSOR');
    return value as { createdAt: string; id: string };
  } catch {
    throw new Error('INVALID_CURSOR');
  }
}
function mapRow(row: Record<string, unknown>): Submission {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    problemId: String(row.problem_id),
    problemRevisionId: String(row.problem_revision_id),
    testdataVersionRef: String(row.testdata_version_ref),
    ...(row.judge_data_version_id
      ? { judgeDataVersionId: String(row.judge_data_version_id) }
      : {}),
    ...(row.judge_data_version_number !== null &&
    row.judge_data_version_number !== undefined
      ? { judgeDataVersionNumber: Number(row.judge_data_version_number) }
      : {}),
    ...(row.judge_data_manifest_sha256
      ? { judgeDataManifestSha256: String(row.judge_data_manifest_sha256) }
      : {}),
    languageId: String(row.language_id),
    source: String(row.source),
    status: row.status as Submission['status'],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapEvaluation(row: Record<string, unknown>): SubmissionEvaluation {
  return {
    submissionId: String(row.submission_id),
    evaluationGeneration: Number(row.evaluation_generation),
    attemptGeneration: Number(row.attempt_generation),
    judgeJobId: String(row.judge_job_id),
    ...(row.testcase_set_id
      ? { testcaseSetId: String(row.testcase_set_id) }
      : {}),
    ...(row.manifest_hash ? { manifestHash: String(row.manifest_hash) } : {}),
    ...(row.verdict_record_digest
      ? { verdictRecordDigest: String(row.verdict_record_digest) }
      : {}),
    ...(row.detail && typeof row.detail === 'object'
      ? { detail: row.detail as SubmissionEvaluationDetail }
      : {}),
    evaluationRecordDigest: String(row.evaluation_record_digest),
    status: row.status as SubmissionEvaluationStatus,
    ...(row.verdict ? { verdict: row.verdict as SubmissionVerdict } : {}),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    ...(row.completed_at
      ? { completedAt: new Date(String(row.completed_at)).toISOString() }
      : {}),
    current: Boolean(row.current),
  };
}

const sameDetail = (
  left: SubmissionEvaluationDetail | undefined,
  right: SubmissionEvaluationDetail | undefined,
) => stableJson(left ?? null) === stableJson(right ?? null);

const stableJson = (item: unknown): string => {
  if (Array.isArray(item)) return `[${item.map(stableJson).join(',')}]`;
  if (item && typeof item === 'object') {
    const value = item as Record<string, unknown>;
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(item);
};
