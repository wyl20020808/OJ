import type { EditorCodeDraft, SaveEditorCodeDraftInput } from './model.js';
import { EditorDraftConflictError, validateDraftInput } from './model.js';

export interface EditorDraftRepository {
  get(userId: string, problemId: string, language: string): Promise<EditorCodeDraft | undefined>;
  save(input: SaveEditorCodeDraftInput): Promise<EditorCodeDraft>;
}

const timestamp = () => new Date().toISOString();
const keyOf = (userId: string, problemId: string, language: string) =>
  `${userId}\0${problemId}\0${language}`;

export class InMemoryEditorDraftRepository implements EditorDraftRepository {
  private readonly rows = new Map<string, EditorCodeDraft>();
  async get(userId: string, problemId: string, language: string) {
    const row = this.rows.get(keyOf(userId, problemId, language));
    return row ? { ...row } : undefined;
  }
  async save(input: SaveEditorCodeDraftInput) {
    validateDraftInput(input);
    const key = keyOf(input.userId, input.problemId, input.language);
    const current = this.rows.get(key);
    if (current && input.expectedVersion !== current.version)
      throw new EditorDraftConflictError({ ...current });
    if (current && current.source === input.source) return { ...current };
    const now = timestamp();
    const row: EditorCodeDraft = current
      ? { ...current, source: input.source, version: current.version + 1, updatedAt: now }
      : { userId: input.userId, problemId: input.problemId, language: input.language, source: input.source, version: 1, createdAt: now, updatedAt: now };
    this.rows.set(key, row);
    return { ...row };
  }
}

type QueryResult = { rows: Record<string, unknown>[] };
type QueryExecutor = { query(text: string, values?: unknown[]): Promise<QueryResult> };
type PoolLike = QueryExecutor & { connect?: () => Promise<QueryExecutor & { release(): void }> };

const mapRow = (row: Record<string, unknown>): EditorCodeDraft => ({
  userId: String(row.user_id),
  problemId: String(row.problem_id),
  language: String(row.language),
  source: String(row.source),
  version: Number(row.version),
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

export class PostgresEditorDraftRepository implements EditorDraftRepository {
  constructor(private readonly pool: PoolLike) {}
  async get(userId: string, problemId: string, language: string) {
    const result = await this.pool.query(
      'SELECT user_id,problem_id,language,source,version,created_at,updated_at FROM editor_code_drafts WHERE user_id=$1 AND problem_id=$2 AND language=$3',
      [userId, problemId, language],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
  async save(input: SaveEditorCodeDraftInput) {
    validateDraftInput(input);
    const executor: QueryExecutor & { release?: () => void } = this.pool.connect ? await this.pool.connect() : this.pool;
    const transactional = Boolean(this.pool.connect);
    if (transactional) await executor.query('BEGIN');
    try {
      const selected = await executor.query(
        'SELECT user_id,problem_id,language,source,version,created_at,updated_at FROM editor_code_drafts WHERE user_id=$1 AND problem_id=$2 AND language=$3 FOR UPDATE',
        [input.userId, input.problemId, input.language],
      );
      const current = selected.rows[0] ? mapRow(selected.rows[0]) : undefined;
      if (current && input.expectedVersion !== current.version)
        throw new EditorDraftConflictError(current);
      if (current && current.source === input.source) {
        if (transactional) await executor.query('COMMIT');
        return current;
      }
      const result = await executor.query(
        current
          ? 'UPDATE editor_code_drafts SET source=$4,version=version+1,updated_at=now() WHERE user_id=$1 AND problem_id=$2 AND language=$3 RETURNING user_id,problem_id,language,source,version,created_at,updated_at'
          : 'INSERT INTO editor_code_drafts(user_id,problem_id,language,source,version) VALUES($1,$2,$3,$4,1) RETURNING user_id,problem_id,language,source,version,created_at,updated_at',
        current ? [input.userId, input.problemId, input.language, input.source] : [input.userId, input.problemId, input.language, input.source],
      );
      if (transactional) await executor.query('COMMIT');
      return mapRow(result.rows[0]!);
    } catch (error) {
      if (transactional) await executor.query('ROLLBACK');
      throw error;
    } finally {
      executor.release?.();
    }
  }
}
