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
  ProblemDeleteConflictError,
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
  tombstone(
    idOrSlug: string,
    input: { reason: string; expectedUpdatedAt: string },
    deletedBy: string,
  ): Promise<Problem>;
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
  private nextPublicNumber = 1;
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
      publicNumber: this.nextPublicNumber++,
      publicId: '',
      tags: input.tags ?? [],
      tagDetails: (input as Problem).tagDetails ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    } as Problem;
    row.publicId = formatPublicId(row.publicNumber);
    this.rows.set(id, row);
    const revision = this.toRevision(row, input.authorId ?? 'system', 1);
    this.history.set(id, [revision]);
    row.currentRevisionId = revision.revisionId;
    return row;
  }
  async get(key: string) {
    return [...this.rows.values()].find(
      (p) => p.id === key || p.slug === key || p.publicId === key,
    );
  }
  async tombstone(
    key: string,
    input: { reason: string; expectedUpdatedAt: string },
    deletedBy: string,
  ) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    if (row.deletedAt) return row;
    if (row.updatedAt !== input.expectedUpdatedAt)
      throw new ProblemDeleteConflictError('Problem version is stale');
    const timestamp = now();
    const updated = {
      ...row,
      deletedAt: timestamp,
      deletedBy,
      deleteReason: input.reason,
      updatedAt: timestamp,
    };
    this.rows.set(row.id, updated);
    return updated;
  }
  async list(query: ProblemListQuery) {
    const rows = [...this.rows.values()]
      .filter(
        (p) =>
          !p.deletedAt &&
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
    if (row.deletedAt) throw new Error('PROBLEM_DELETED');
    if (
      input.slug &&
      [...this.rows.values()].some(
        (p) => p.id !== row.id && p.slug === input.slug,
      )
    )
      throw new ProblemConflictError();
    const updated = {
      ...row,
      ...input,
      tags: input.tags ?? row.tags,
      updatedAt: now(),
    };
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
    if (row.deletedAt) throw new Error('PROBLEM_DELETED');
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
    updated.currentRevisionId = rev.revisionId;
    this.rows.set(row.id, updated);
    return updated;
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
        'INSERT INTO problems (id, slug, title, background, statement, input_description, output_description, examples, constraints, notes, time_limit_ms, memory_limit_bytes, visibility, difficulty, status, testdata_version, author_id, source_type, provenance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *',
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
          input.sourceType ?? 'CREATOR',
          input.provenance ? JSON.stringify(input.provenance) : null,
        ],
      );
      const problem = mapRow(result.rows[0]!);
      await this.persistTags(
        executor,
        problem.id,
        input.tags ?? [],
        input.tagIds,
      );
      problem.tagDetails = await this.loadTags(executor, problem.id);
      problem.tags = problem.tagDetails.map((tag) => tag.name);
      const revisionId = randomUUID();
      await executor.query(
        'INSERT INTO problem_revisions (id,problem_id,public_number,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)',
        [
          revisionId,
          problem.id,
          problem.publicNumber,
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
      `SELECT p.*, COALESCE((SELECT array_agg(t.display_name ORDER BY t.display_order, t.id)
        FROM problem_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.problem_id=p.id), ARRAY[]::text[]) AS tags,
        COALESCE((SELECT json_agg(json_build_object('id',t.id,'slug',t.slug,'name',t.name,'category',t.category,'displayOrder',t.display_order,'isActive',t.is_active) ORDER BY t.display_order,t.id)
        FROM problem_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.problem_id=p.id), '[]'::json) AS tag_details
       FROM problems p
       WHERE (p.id = $1 OR p.slug = $1)
          OR p.public_number = CASE WHEN $1 ~ '^P[0-9]+$' THEN substring($1 FROM 2)::bigint END
       LIMIT 1`,
      [key],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
  async tombstone(
    key: string,
    input: { reason: string; expectedUpdatedAt: string },
    deletedBy: string,
  ) {
    const row = await this.get(key);
    if (!row) throw new Error('NOT_FOUND');
    if (row.deletedAt) return row;
    return this.transaction(async (executor) => {
      const result = await executor.query(
        'UPDATE problems SET deleted_at=now(), deleted_by=$1, delete_reason=$2, updated_at=now() WHERE id=$3 AND deleted_at IS NULL AND updated_at=$4 RETURNING *',
        [deletedBy, input.reason, row.id, input.expectedUpdatedAt],
      );
      if (!result.rows[0])
        throw new ProblemDeleteConflictError('Problem version is stale');
      return mapRow(result.rows[0]);
    });
  }
  async list(query: ProblemListQuery) {
    const clauses = [
      'deleted_at IS NULL',
      ...(query.publicOnly
        ? ["visibility='public'", "status='published'"]
        : []),
    ];
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
      `SELECT p.*, COALESCE((SELECT array_agg(t.display_name ORDER BY t.display_order, t.id)
        FROM problem_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.problem_id=p.id), ARRAY[]::text[]) AS tags,
        COALESCE((SELECT json_agg(json_build_object('id',t.id,'slug',t.slug,'name',t.name,'category',t.category,'displayOrder',t.display_order,'isActive',t.is_active) ORDER BY t.display_order,t.id)
        FROM problem_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.problem_id=p.id), '[]'::json) AS tag_details
       FROM problems p ${where} ORDER BY public_number ASC, id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
    if (row.deletedAt) throw new Error('PROBLEM_DELETED');
    const hasSamples = 'samples' in input || 'examples' in input;
    const fields = Object.keys(input).filter(
      (field) =>
        field !== 'samples' &&
        field !== 'tags' &&
        field !== 'tagIds' &&
        field !== 'tagDetails',
    );
    if (hasSamples && !fields.includes('examples')) fields.push('examples');
    if (!fields.length && !('tags' in input) && !('tagIds' in input))
      return row;
    return this.transaction(async (executor) => {
      const columns: string[] = [];
      const params: unknown[] = [];
      for (const field of fields) {
        const column = String(field).replace(
          /[A-Z]/g,
          (m) => `_${m.toLowerCase()}`,
        );
        const value =
          field === 'examples'
            ? JSON.stringify(storedSamples(input.samples ?? row.samples))
            : (input as Record<string, unknown>)[field];
        params.push(value);
        columns.push(`${column} = $${params.length}`);
      }
      params.push(row.id);
      const updated = fields.length
        ? mapRow(
            (
              await executor.query(
                `UPDATE problems SET ${columns.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
                params,
              )
            ).rows[0]!,
          )
        : { ...row, updatedAt: now() };
      if ('tags' in input || 'tagIds' in input) {
        await this.persistTags(
          executor,
          row.id,
          input.tags ?? [],
          input.tagIds,
        );
        updated.tagDetails = await this.loadTags(executor, row.id);
        updated.tags = updated.tagDetails.map((tag) => tag.name);
      }
      if (
        updated.currentRevisionId &&
        (input.status !== undefined || input.visibility !== undefined)
      )
        await executor.query(
          'UPDATE problem_revisions SET status=COALESCE($1,status), visibility=COALESCE($2,visibility) WHERE id=$3',
          [
            input.status ?? null,
            input.visibility ?? null,
            updated.currentRevisionId,
          ],
        );
      return updated;
    });
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
    if (row.deletedAt) throw new Error('PROBLEM_DELETED');
    const next = { ...row, ...input };
    const revs = await this.revisions(key);
    const revisionId = randomUUID();
    await this.pool.query(
      'INSERT INTO problem_revisions (id,problem_id,public_number,revision_number,slug,title,background,statement,input_description,output_description,examples,constraints,notes,time_limit_ms,memory_limit_bytes,visibility,difficulty,status,testdata_version,author_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)',
      [
        revisionId,
        row.id,
        row.publicNumber,
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
    await this.pool.query(
      'UPDATE problems SET current_revision_id=$1, updated_at=now() WHERE id=$2',
      [revisionId, row.id],
    );
    return {
      ...next,
      status: 'draft',
      visibility: 'private',
      currentRevisionId: revisionId,
      updatedAt: new Date().toISOString(),
    } as Problem;
  }
  private async persistTags(
    executor: QueryExecutor,
    problemId: string,
    values: string[],
    tagIds?: number[],
  ) {
    await executor.query('DELETE FROM problem_tags WHERE problem_id=$1', [
      problemId,
    ]);
    if (tagIds !== undefined) {
      if (tagIds.length)
        await executor.query(
          'INSERT INTO problem_tags (problem_id, tag_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING',
          [problemId, tagIds],
        );
      return;
    }
    for (const value of values) {
      const displayName = value.trim().replace(/\s+/g, ' ');
      const normalizedKey = displayName.toLocaleLowerCase();
      await executor.query(
        `INSERT INTO tags (normalized_key, display_name) VALUES ($1,$2)
         ON CONFLICT (normalized_key) DO UPDATE SET display_name=EXCLUDED.display_name`,
        [normalizedKey, displayName],
      );
      await executor.query(
        'INSERT INTO problem_tags (problem_id, tag_id) SELECT $1,id FROM tags WHERE normalized_key=$2 ON CONFLICT DO NOTHING',
        [problemId, normalizedKey],
      );
    }
  }
  private async loadTags(executor: QueryExecutor, problemId: string) {
    const result = await executor.query(
      'SELECT t.id, t.slug, t.name, t.category, t.display_order, t.is_active FROM problem_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.problem_id=$1 ORDER BY t.display_order, t.id',
      [problemId],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      slug: String(row.slug ?? row.normalized_key),
      name: String(row.name ?? row.display_name),
      category: String(row.category ?? '未分类'),
      displayOrder: Number(row.display_order ?? 0),
      isActive: Boolean(row.is_active ?? true),
    }));
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
    publicNumber: Number(row.public_number ?? row.publicNumber ?? 0),
    publicId: formatPublicId(
      Number(row.public_number ?? row.publicNumber ?? 0),
    ),
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
    source: row.source
      ? String(row.source)
      : row.author_id
        ? String(row.author_id)
        : null,
    sourceType: String(row.source_type ?? 'CREATOR') as NonNullable<
      Problem['sourceType']
    >,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    tagDetails:
      ((typeof row.tag_details === 'string'
        ? JSON.parse(row.tag_details)
        : row.tag_details) as Problem['tagDetails']) ?? [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at ?? row.created_at)).toISOString(),
    ...(row.current_revision_id
      ? { currentRevisionId: String(row.current_revision_id) }
      : {}),
    deletedAt: row.deleted_at
      ? new Date(String(row.deleted_at)).toISOString()
      : null,
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by),
    deleteReason: row.delete_reason == null ? null : String(row.delete_reason),
    provenance:
      row.provenance && typeof row.provenance === 'object'
        ? (row.provenance as Record<string, unknown>)
        : null,
  };
}

export const formatPublicId = (number: number) =>
  `P${String(number).padStart(4, '0')}`;
export const formatPublicProblemNumber = formatPublicId;
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
