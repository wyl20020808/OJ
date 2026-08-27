import { randomUUID } from 'node:crypto';
import type {
  Submission,
  SubmissionCreateInput,
  SubmissionListQuery,
} from './model.js';

type QueryResult = { rows: Record<string, unknown>[] };
type PoolLike = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
const now = () => new Date().toISOString();

export interface SubmissionRepository {
  create(
    input: SubmissionCreateInput & { ownerUserId: string },
  ): Promise<Submission>;
  get(id: string): Promise<Submission | undefined>;
  list(
    query: SubmissionListQuery,
  ): Promise<{ items: Submission[]; nextCursor?: string }>;
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly rows = new Map<string, Submission>();
  async create(input: SubmissionCreateInput & { ownerUserId: string }) {
    const timestamp = now();
    const submission: Submission = {
      ...input,
      id: randomUUID(),
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.rows.set(submission.id, submission);
    return { ...submission };
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
}

export class PostgresSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: PoolLike) {}
  async create(input: SubmissionCreateInput & { ownerUserId: string }) {
    const id = randomUUID();
    const result = await this.pool.query(
      'INSERT INTO submissions (id,owner_user_id,problem_id,problem_revision_id,testdata_version_ref,language_id,source,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        id,
        input.ownerUserId,
        input.problemId,
        input.problemRevisionId,
        input.testdataVersionRef,
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
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}
function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function mapRow(row: Record<string, unknown>): Submission {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    problemId: String(row.problem_id),
    problemRevisionId: String(row.problem_revision_id),
    testdataVersionRef: String(row.testdata_version_ref),
    languageId: String(row.language_id),
    source: String(row.source),
    status: row.status as Submission['status'],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
