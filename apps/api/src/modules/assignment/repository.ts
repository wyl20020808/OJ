import { randomUUID } from 'node:crypto';
import type {
  Assignment,
  AssignmentProblem,
  AssignmentStatus,
} from './model.js';

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
};
type QueryExecutor = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
};
type PoolLike = QueryExecutor & {
  connect?: () => Promise<QueryExecutor & { release(): void }>;
};

export interface AssignmentRepository {
  create(
    input: Omit<Assignment, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Assignment>;
  getByPublicId(publicId: string): Promise<Assignment | undefined>;
  listByTeam(teamId: string): Promise<Assignment[]>;
  listMine(userId: string): Promise<Assignment[]>;
  update(
    id: string,
    patch: Partial<
      Pick<Assignment, 'title' | 'description' | 'startsAt' | 'dueAt'>
    >,
  ): Promise<Assignment | undefined>;
  setStatus(
    id: string,
    status: AssignmentStatus,
  ): Promise<Assignment | undefined>;
  replaceProblems(id: string, problems: string[]): Promise<AssignmentProblem[]>;
  problems(id: string): Promise<AssignmentProblem[]>;
}

const now = () => new Date().toISOString();

export class InMemoryAssignmentRepository implements AssignmentRepository {
  readonly assignments = new Map<string, Assignment>();
  readonly relations = new Map<string, AssignmentProblem[]>();
  private nextPublicNumber = 1;
  async create(
    input: Omit<Assignment, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>,
  ) {
    const timestamp = now();
    const assignment: Assignment = {
      ...input,
      id: randomUUID(),
      publicId: `A${String(this.nextPublicNumber++).padStart(4, '0')}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.assignments.set(assignment.id, assignment);
    this.relations.set(assignment.id, []);
    return { ...assignment };
  }
  async getByPublicId(publicId: string) {
    const result = [...this.assignments.values()].find(
      (item) => item.publicId === publicId,
    );
    return result ? { ...result } : undefined;
  }
  async listByTeam(teamId: string) {
    return [...this.assignments.values()]
      .filter((item) => item.teamId === teamId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({ ...item }));
  }
  async listMine() {
    return [...this.assignments.values()]
      .filter((item) => item.status !== 'DRAFT')
      .map((item) => ({ ...item }));
  }
  async update(
    id: string,
    patch: Partial<
      Pick<Assignment, 'title' | 'description' | 'startsAt' | 'dueAt'>
    >,
  ) {
    const item = this.assignments.get(id);
    if (!item) return undefined;
    Object.assign(item, patch, { updatedAt: now() });
    return { ...item };
  }
  async setStatus(id: string, status: AssignmentStatus) {
    const item = this.assignments.get(id);
    if (!item) return undefined;
    item.status = status;
    item.updatedAt = now();
    return { ...item };
  }
  async replaceProblems(id: string, problems: string[]) {
    const items = problems.map((problemId, displayOrder) => ({
      assignmentId: id,
      problemId,
      displayOrder,
    }));
    this.relations.set(id, items);
    return items.map((item) => ({ ...item }));
  }
  async problems(id: string) {
    return (this.relations.get(id) ?? []).map((item) => ({ ...item }));
  }
}

const mapAssignment = (row: Record<string, unknown>): Assignment => ({
  id: String(row.id),
  publicId: String(row.public_id),
  teamId: String(row.team_id),
  title: String(row.title),
  description: String(row.description ?? ''),
  status: row.status as AssignmentStatus,
  startsAt: row.starts_at
    ? new Date(String(row.starts_at)).toISOString()
    : null,
  dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
  createdBy: String(row.created_by),
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

export class PostgresAssignmentRepository implements AssignmentRepository {
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
  async create(
    input: Omit<Assignment, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>,
  ) {
    const id = randomUUID();
    const result = await this.pool.query(
      "WITH n AS (SELECT nextval('assignment_public_number_seq')::bigint AS value) INSERT INTO assignments(id,public_number,public_id,team_id,title,description,status,starts_at,due_at,created_by) SELECT $1,n.value,'A'||lpad(n.value::text,4,'0'),$2,$3,$4,$5,$6,$7,$8 FROM n RETURNING *",
      [
        id,
        input.teamId,
        input.title,
        input.description,
        input.status,
        input.startsAt,
        input.dueAt,
        input.createdBy,
      ],
    );
    return mapAssignment(result.rows[0]!);
  }
  async getByPublicId(publicId: string) {
    const result = await this.pool.query(
      'SELECT * FROM assignments WHERE public_id=$1',
      [publicId],
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }
  async listByTeam(teamId: string) {
    const result = await this.pool.query(
      'SELECT * FROM assignments WHERE team_id=$1 ORDER BY created_at DESC,id DESC',
      [teamId],
    );
    return result.rows.map(mapAssignment);
  }
  async listMine(userId: string) {
    const result = await this.pool.query(
      "SELECT a.* FROM assignments a JOIN team_members m ON m.team_id=a.team_id WHERE m.user_id=$1 AND a.status<>'DRAFT' ORDER BY a.due_at NULLS LAST,a.created_at DESC",
      [userId],
    );
    return result.rows.map(mapAssignment);
  }
  async update(
    id: string,
    patch: Partial<
      Pick<Assignment, 'title' | 'description' | 'startsAt' | 'dueAt'>
    >,
  ) {
    const keys = Object.keys(patch);
    if (!keys.length) {
      const result = await this.pool.query(
        'SELECT * FROM assignments WHERE id=$1',
        [id],
      );
      return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
    }
    const columns = keys.map(
      (key) =>
        (
          ({ startsAt: 'starts_at', dueAt: 'due_at' }) as Record<string, string>
        )[key] ?? key,
    );
    const values = keys.map((key) => (patch as Record<string, unknown>)[key]);
    const result = await this.pool.query(
      `UPDATE assignments SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')},updated_at=now() WHERE id=$${values.length + 1} RETURNING *`,
      [...values, id],
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }
  async setStatus(id: string, status: AssignmentStatus) {
    const result = await this.pool.query(
      'UPDATE assignments SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [status, id],
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }
  async replaceProblems(id: string, problems: string[]) {
    return this.transaction(async (executor) => {
      await executor.query(
        'DELETE FROM assignment_problems WHERE assignment_id=$1',
        [id],
      );
      for (const [displayOrder, problemId] of problems.entries())
        await executor.query(
          'INSERT INTO assignment_problems(assignment_id,problem_id,display_order) VALUES($1,$2,$3)',
          [id, problemId, displayOrder],
        );
      return this.problemsWith(executor, id);
    });
  }
  private async problemsWith(executor: QueryExecutor, id: string) {
    const result = await executor.query(
      'SELECT assignment_id,problem_id,display_order FROM assignment_problems WHERE assignment_id=$1 ORDER BY display_order',
      [id],
    );
    return result.rows.map((row) => ({
      assignmentId: String(row.assignment_id),
      problemId: String(row.problem_id),
      displayOrder: Number(row.display_order),
    }));
  }
  async problems(id: string) {
    return this.problemsWith(this.pool, id);
  }
}
