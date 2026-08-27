import { randomUUID } from 'node:crypto';
type QueryResult = { rows: Record<string, unknown>[] };
type PoolLike = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
import {
  ProblemConflictError,
  type Problem,
  type ProblemCreateInput,
  type ProblemUpdateInput,
} from './model.js';

export type ProblemListQuery = {
  limit: number;
  offset: number;
  publicOnly?: boolean;
  authorId?: string;
};
export interface ProblemRepository {
  create(input: ProblemCreateInput): Promise<Problem>;
  get(idOrSlug: string): Promise<Problem | undefined>;
  list(query: ProblemListQuery): Promise<{ items: Problem[]; total: number }>;
  update(idOrSlug: string, input: ProblemUpdateInput): Promise<Problem>;
}

const now = () => new Date().toISOString();
export class InMemoryProblemRepository implements ProblemRepository {
  private readonly rows = new Map<string, Problem>();
  async create(input: ProblemCreateInput): Promise<Problem> {
    const id = input.id ?? randomUUID();
    if (
      [...this.rows.values()].some((p) => p.id === id || p.slug === input.slug)
    )
      throw new ProblemConflictError();
    const timestamp = now();
    const row = {
      ...input,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Problem;
    this.rows.set(id, row);
    return row;
  }
  async get(key: string) {
    return [...this.rows.values()].find((p) => p.id === key || p.slug === key);
  }
  async list(query: ProblemListQuery) {
    const rows = [...this.rows.values()]
      .filter(
        (p) =>
          (!query.publicOnly ||
            (p.visibility === 'public' && p.status === 'published')) &&
          (!query.authorId || p.authorId === query.authorId),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      items: rows.slice(query.offset, query.offset + query.limit),
      total: rows.length,
    };
  }
  async update(key: string, input: ProblemUpdateInput) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    if (
      input.slug &&
      [...this.rows.values()].some(
        (p) => p.id !== row.id && p.slug === input.slug,
      )
    )
      throw new ProblemConflictError();
    const updated = { ...row, ...input, updatedAt: now() };
    this.rows.set(row.id, updated);
    return updated;
  }
}

export class PostgresProblemRepository implements ProblemRepository {
  constructor(private readonly pool: PoolLike) {}
  async create(input: ProblemCreateInput) {
    const id = input.id ?? randomUUID();
    const result = await this.pool.query(
      'INSERT INTO problems (id, slug, title, statement, input_description, output_description, examples, constraints, notes, time_limit_ms, memory_limit_bytes, visibility, status, testdata_version, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [
        id,
        input.slug,
        input.title,
        input.statement,
        input.inputDescription,
        input.outputDescription,
        JSON.stringify(input.examples),
        input.constraints,
        input.notes,
        input.timeLimitMs,
        input.memoryLimitBytes,
        input.visibility,
        input.status,
        input.testdataVersion,
        input.authorId,
      ],
    );
    return mapRow(result.rows[0]!);
  }
  async get(key: string) {
    const result = await this.pool.query(
      'SELECT * FROM problems WHERE id = $1 OR slug = $1 LIMIT 1',
      [key],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
  async list(query: ProblemListQuery) {
    const clauses = query.publicOnly
      ? ["visibility='public'", "status='published'"]
      : [];
    const params: unknown[] = [];
    if (query.authorId) {
      params.push(query.authorId);
      clauses.push(`author_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await this.pool.query(
      `SELECT count(*)::int AS total FROM problems ${where}`,
      params,
    );
    params.push(query.limit, query.offset);
    const result = await this.pool.query(
      `SELECT * FROM problems ${where} ORDER BY created_at ASC, id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      items: result.rows.map(mapRow),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }
  async update(key: string, input: ProblemUpdateInput) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    const fields = Object.keys(input) as (keyof ProblemUpdateInput)[];
    if (!fields.length) return row;
    const columns: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      const column = String(field).replace(
        /[A-Z]/g,
        (m) => `_${m.toLowerCase()}`,
      );
      const value = input[field];
      params.push(field === 'examples' ? JSON.stringify(value) : value);
      columns.push(`${column} = $${params.length}`);
    }
    params.push(row.id);
    const result = await this.pool.query(
      `UPDATE problems SET ${columns.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
      params,
    );
    return mapRow(result.rows[0]!);
  }
}
function mapRow(row: Record<string, unknown>): Problem {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    statement: String(row.statement),
    inputDescription: String(row.input_description),
    outputDescription: String(row.output_description),
    examples: (typeof row.examples === 'string'
      ? JSON.parse(row.examples)
      : row.examples) as Problem['examples'],
    constraints: String(row.constraints),
    notes: String(row.notes),
    timeLimitMs: Number(row.time_limit_ms),
    memoryLimitBytes: Number(row.memory_limit_bytes),
    visibility: row.visibility as Problem['visibility'],
    status: row.status as Problem['status'],
    testdataVersion: row.testdata_version as string | null,
    authorId: row.author_id as string | null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
