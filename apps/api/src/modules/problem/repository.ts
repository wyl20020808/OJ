import { randomUUID } from 'node:crypto';
type QueryResult = { rows: Record<string, unknown>[] };
type QueryExecutor = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
type PoolLike = QueryExecutor & {
  connect?: () => Promise<QueryExecutor & { release(): void }>;
};
import {
  ProblemConflictError,
  type Problem,
  type ProblemCreateInput,
  type ProblemUpdateInput,
} from './model.js';
import type { ProblemRevision } from './model.js';

const storedSamples = (samples: Problem['samples']) =>
  samples.map(({ ordinal, input, output, explanation }) => ({
    ordinal,
    input,
    output,
    ...(explanation === undefined ? {} : { explanation }),
  }));

export type ProblemListQuery = {
  limit: number;
  offset?: number;
  publicOnly?: boolean;
  ownedOrPublicBy?: string;
  authorId?: string;
  search?: string;
  status?: Problem['status'];
  visibility?: Problem['visibility'];
};
export interface ProblemRepository {
  create(input: ProblemCreateInput): Promise<Problem>;
  get(idOrSlug: string): Promise<Problem | undefined>;
  list(query: ProblemListQuery): Promise<{ items: Problem[]; total: number }>;
  update(idOrSlug: string, input: ProblemUpdateInput): Promise<Problem>;
  revisions(idOrSlug: string): Promise<ProblemRevision[]>;
  createRevision(
    idOrSlug: string,
    input: ProblemUpdateInput,
    createdBy: string,
  ): Promise<Problem>;
}

const now = () => new Date().toISOString();
export class InMemoryProblemRepository implements ProblemRepository {
  private readonly rows = new Map<string, Problem>();
  private readonly history = new Map<string, ProblemRevision[]>();
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
    const revision = this.toRevision(row, input.authorId ?? 'system', 1);
    this.history.set(id, [revision]);
    row.currentRevisionId = revision.revisionId;
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
          (!query.ownedOrPublicBy ||
            p.authorId === query.ownedOrPublicBy ||
            (p.visibility === 'public' && p.status === 'published')) &&
          (!query.authorId || p.authorId === query.authorId) &&
          (!query.status || p.status === query.status) &&
          (!query.visibility || p.visibility === query.visibility) &&
          (!query.search ||
            `${p.slug} ${p.title}`
              .toLocaleLowerCase()
              .includes(query.search.toLocaleLowerCase())),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      items: rows.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit),
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
    if (
      updated.currentRevisionId &&
      (input.status !== undefined || input.visibility !== undefined)
    )
      this.history.set(
        row.id,
        (this.history.get(row.id) ?? []).map((revision) =>
          revision.revisionId === updated.currentRevisionId
            ? {
                ...revision,
                ...(input.status === undefined ? {} : { status: input.status }),
                ...(input.visibility === undefined
                  ? {}
                  : { visibility: input.visibility }),
              }
            : revision,
        ),
      );
    return updated;
  }
  async revisions(key: string) {
    const row = await this.get(key);
    return row ? [...(this.history.get(row.id) ?? [])] : [];
  }
  async createRevision(
    key: string,
    input: ProblemUpdateInput,
    createdBy: string,
  ) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    const updated = {
      ...row,
      ...input,
      status: 'draft' as const,
      visibility: input.visibility ?? 'private',
      updatedAt: now(),
    };
    const list = this.history.get(row.id) ?? [];
    const rev = this.toRevision(updated, createdBy, list.length + 1);
    list.push(rev);
    this.history.set(row.id, list);
    return { ...updated, currentRevisionId: rev.revisionId };
  }
  private toRevision(
    row: Problem,
    createdBy: string,
    n: number,
  ): ProblemRevision {
    const snapshot = { ...row };
    delete snapshot.currentRevisionId;
    return {
      ...snapshot,
      revisionId: randomUUID(),
      revisionNumber: n,
      createdBy,
      createdAt: now(),
    };
  }
}

export class PostgresProblemRepository implements ProblemRepository {
  constructor(private readonly pool: PoolLike) {}
  private async transaction<T>(work: (executor: QueryExecutor) => Promise<T>) {
    if (!this.pool.connect) return work(this.pool);
    const client = await this.pool.connect();
    await client.query('BEGIN');
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async create(input: ProblemCreateInput) {
    return this.transaction(async (executor) => {
      const id = input.id ?? randomUUID();
      const result = await executor.query(
        'INSERT INTO problems (id, slug, title, background, statement, input_description, output_description, examples, constraints, notes, time_limit_ms, memory_limit_bytes, visibility, difficulty, status, testdata_version, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
        [
          id,
          input.slug,
          input.title,
          input.background,
          input.statement,
          input.inputDescription,
          input.outputDescription,
          JSON.stringify(storedSamples(input.samples)),
          input.constraints,
          input.notes,
          input.timeLimitMs,
          input.memoryLimitBytes,
          input.visibility,
          input.difficulty,
          input.status,
          input.testdataVersion,
          input.authorId,
        ],
      );
      const problem = mapRow(result.rows[0]!);
      const revisionId = randomUUID();
      await executor.query(
        'INSERT INTO problem_revisions (id,problem_id,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
        [
          revisionId,
          problem.id,
          problem.slug,
          problem.title,
          problem.background,
          problem.statement,
          problem.inputDescription,
          problem.outputDescription,
          JSON.stringify(storedSamples(problem.samples)),
          problem.constraints,
          problem.notes,
          problem.timeLimitMs,
          problem.memoryLimitBytes,
          problem.visibility,
          problem.difficulty,
          problem.status,
          problem.testdataVersion,
          problem.authorId,
          problem.authorId ?? 'system',
        ],
      );
      await executor.query(
        'UPDATE problems SET current_revision_id=$1 WHERE id=$2',
        [revisionId, problem.id],
      );
      problem.currentRevisionId = revisionId;
      return problem;
    });
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
    if (query.ownedOrPublicBy) {
      params.push(query.ownedOrPublicBy);
      clauses.push(
        `((visibility='public' AND status='published') OR author_id = $${params.length})`,
      );
    }
    if (query.authorId) {
      params.push(query.authorId);
      clauses.push(`author_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    if (query.visibility) {
      params.push(query.visibility);
      clauses.push(`visibility = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      clauses.push(
        `(slug ILIKE $${params.length} OR title ILIKE $${params.length})`,
      );
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await this.pool.query(
      `SELECT count(*)::int AS total FROM problems ${where}`,
      params,
    );
    params.push(query.limit, query.offset ?? 0);
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
    const fields = (Object.keys(input) as (keyof ProblemUpdateInput)[]).filter(
      (field) => field !== 'samples',
    );
    if (!fields.length) return row;
    const columns: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      const column = String(field).replace(
        /[A-Z]/g,
        (m) => `_${m.toLowerCase()}`,
      );
      const value = input[field];
      params.push(
        field === 'examples'
          ? JSON.stringify(storedSamples(input.samples ?? row.samples))
          : value,
      );
      columns.push(`${column} = $${params.length}`);
    }
    params.push(row.id);
    const result = await this.pool.query(
      `UPDATE problems SET ${columns.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
      params,
    );
    const updated = mapRow(result.rows[0]!);
    if (
      updated.currentRevisionId &&
      (input.status !== undefined || input.visibility !== undefined)
    )
      await this.pool.query(
        'UPDATE problem_revisions SET status=COALESCE($1,status), visibility=COALESCE($2,visibility) WHERE id=$3',
        [
          input.status ?? null,
          input.visibility ?? null,
          updated.currentRevisionId,
        ],
      );
    return updated;
  }
  async revisions(key: string) {
    const row = await this.get(key);
    if (!row) return [];
    const r = await this.pool.query(
      'SELECT * FROM problem_revisions WHERE problem_id=$1 ORDER BY revision_number ASC',
      [row.id],
    );
    return r.rows.map(mapRevision);
  }
  async createRevision(
    key: string,
    input: ProblemUpdateInput,
    createdBy: string,
  ) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    const next = { ...row, ...input };
    const revs = await this.revisions(key);
    const revisionId = randomUUID();
    await this.pool.query(
      'INSERT INTO problem_revisions (id,problem_id,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)',
      [
        revisionId,
        row.id,
        revs.length + 1,
        next.slug,
        next.title,
        next.background,
        next.statement,
        next.inputDescription,
        next.outputDescription,
        JSON.stringify(storedSamples(next.samples)),
        next.constraints,
        next.notes,
        next.timeLimitMs,
        next.memoryLimitBytes,
        next.visibility ?? 'private',
        next.difficulty,
        'draft',
        next.testdataVersion,
        next.authorId,
        createdBy,
      ],
    );
    return {
      ...next,
      status: 'draft',
      visibility: 'private',
      currentRevisionId: revisionId,
      updatedAt: new Date().toISOString(),
    } as Problem;
  }
}
function mapRow(row: Record<string, unknown>): Problem {
  const rawSamples = (
    typeof row.examples === 'string' ? JSON.parse(row.examples) : row.examples
  ) as Array<Record<string, unknown>> | undefined;
  const samples = (rawSamples ?? []).map((sample, index) => ({
    ordinal: typeof sample.ordinal === 'number' ? sample.ordinal : index + 1,
    input: String(sample.input ?? ''),
    output: String(sample.output ?? ''),
    ...(typeof sample.explanation === 'string'
      ? { explanation: sample.explanation }
      : typeof sample.note === 'string'
        ? { explanation: sample.note }
        : {}),
  }));
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    background: String(row.background ?? ''),
    statement: String(row.statement),
    inputDescription: String(row.input_description),
    outputDescription: String(row.output_description),
    examples: samples.map(({ input, output, explanation }) => ({
      input,
      output,
      ...(explanation ? { note: explanation } : {}),
    })),
    samples,
    constraints: String(row.constraints),
    notes: String(row.notes),
    timeLimitMs: Number(row.time_limit_ms),
    memoryLimitBytes: Number(row.memory_limit_bytes),
    visibility: row.visibility as Problem['visibility'],
    difficulty: (row.difficulty as Problem['difficulty']) ?? null,
    status: row.status as Problem['status'],
    testdataVersion: row.testdata_version as string | null,
    authorId: row.author_id as string | null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.created_at)).toISOString(),
    ...(row.current_revision_id
      ? { currentRevisionId: String(row.current_revision_id) }
      : {}),
  };
}
function mapRevision(row: Record<string, unknown>): ProblemRevision {
  const p = mapRow(row);
  return {
    ...p,
    revisionId: String(row.id),
    revisionNumber: Number(row.revision_number),
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
