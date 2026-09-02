import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  assertJudgeNodeRegistration,
  scheduleJudgeNode,
  type JudgeNode,
  type JudgeNodeRegistration,
  type RequiredNodeCapabilities,
} from './node-model.js';

type Queryable = Pick<Pool, 'query'>;

export type JudgeNodeAssignment = {
  assignmentId: string;
  judgeJobId: string;
  nodeId: string;
  incarnation: string;
  attemptGeneration: number;
  status: 'LEASED' | 'COMPLETED' | 'EXPIRED';
  assignedAt: string;
};

export interface JudgeNodeRepository {
  register(value: JudgeNodeRegistration, now?: Date): Promise<JudgeNode>;
  heartbeat(
    nodeId: string,
    incarnation: string,
    activeJobs: number,
    now?: Date,
  ): Promise<JudgeNode>;
  list(now?: Date): Promise<JudgeNode[]>;
  get(nodeId: string, now?: Date): Promise<JudgeNode | undefined>;
  drain(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ): Promise<JudgeNode>;
  offline(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ): Promise<JudgeNode>;
  enable(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ): Promise<JudgeNode>;
  assign(
    node: JudgeNode,
    judgeJobId: string,
    attemptGeneration: number,
    now?: Date,
  ): Promise<JudgeNodeAssignment>;
  choose(
    required: RequiredNodeCapabilities,
    now?: Date,
  ): Promise<{ node?: JudgeNode; reason: string }>;
  currentAssignment(
    assignmentId: string,
    nodeId: string,
    incarnation: string,
  ): Promise<JudgeNodeAssignment | undefined>;
  listAssignments(
    nodeId: string,
    limit?: number,
  ): Promise<JudgeNodeAssignment[]>;
  completeAssignment(assignmentId: string): Promise<void>;
}

const stamp = (now = new Date()) => now.toISOString();
const node = (value: Record<string, unknown>): JudgeNode =>
  ({
    nodeId: String(value.node_id),
    incarnation: String(value.incarnation),
    runtimeVersion: String(value.runtime_version),
    maxConcurrentJobs: Number(value.max_concurrent_jobs),
    capabilities: value.capabilities as JudgeNode['capabilities'],
    ...(value.metadata
      ? { metadata: value.metadata as NonNullable<JudgeNode['metadata']> }
      : {}),
    state: value.state as JudgeNode['state'],
    desiredState: (value.desired_state ??
      (value.state === 'DRAINING'
        ? 'DRAINING'
        : value.state === 'OFFLINE'
          ? 'OFFLINE'
          : 'ONLINE')) as JudgeNode['desiredState'],
    observedState: (value.observed_state ??
      value.state) as JudgeNode['observedState'],
    controlVersion: Number(value.control_version ?? 1),
    activeJobs: Number(value.active_jobs),
    ...(value.last_heartbeat_at
      ? {
          lastHeartbeatAt: new Date(
            String(value.last_heartbeat_at),
          ).toISOString(),
        }
      : {}),
  }) as JudgeNode;

const fresh = (value: JudgeNode, now = new Date(), timeout = 15_000) => {
  let observedState: JudgeNode['state'] = value.observedState ?? value.state;
  if (
    ['ONLINE', 'BUSY'].includes(value.state) &&
    (!value.lastHeartbeatAt ||
      now.getTime() - Date.parse(value.lastHeartbeatAt) > timeout)
  )
    observedState = 'UNHEALTHY';
  else if (value.observedState === 'DRAINING' && value.activeJobs === 0)
    observedState = 'OFFLINE';
  const desired = value.desiredState ?? 'ONLINE';
  const state: JudgeNode['state'] =
    desired === 'OFFLINE'
      ? 'OFFLINE'
      : desired === 'DRAINING'
        ? value.activeJobs
          ? 'DRAINING'
          : 'OFFLINE'
        : observedState === 'BUSY'
          ? 'BUSY'
          : observedState;
  return {
    ...value,
    desiredState: desired,
    observedState,
    controlVersion: value.controlVersion ?? 1,
    state,
  };
};

export class InMemoryJudgeNodeRepository implements JudgeNodeRepository {
  private readonly nodes = new Map<string, JudgeNode>();
  private readonly assignments = new Map<string, JudgeNodeAssignment>();
  constructor(private readonly unhealthyAfterMs = 15_000) {}

  private refresh(value: JudgeNode, now = new Date()) {
    const updated = fresh(value, now, this.unhealthyAfterMs);
    this.nodes.set(updated.nodeId, updated);
    return structuredClone(updated);
  }

  async register(value: JudgeNodeRegistration, now = new Date()) {
    assertJudgeNodeRegistration(value);
    const existing = this.nodes.get(value.nodeId);
    const desiredState = existing?.desiredState ?? 'ONLINE';
    const next: JudgeNode = {
      ...value,
      state:
        desiredState === 'OFFLINE'
          ? 'OFFLINE'
          : desiredState === 'DRAINING'
            ? 'DRAINING'
            : 'ONLINE',
      desiredState,
      observedState: 'ONLINE',
      controlVersion: existing?.controlVersion ?? 1,
      activeJobs: 0,
      lastHeartbeatAt: stamp(now),
    };
    if (existing?.incarnation === value.incarnation) {
      const current = {
        ...existing,
        ...value,
        lastHeartbeatAt: stamp(now),
        state: existing.desiredState === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
        desiredState: existing.desiredState ?? 'ONLINE',
        observedState: 'ONLINE',
        controlVersion: existing.controlVersion ?? 1,
      } as JudgeNode;
      this.nodes.set(value.nodeId, current);
      return structuredClone(current);
    }
    this.nodes.set(value.nodeId, next);
    return structuredClone(next);
  }

  async heartbeat(
    nodeId: string,
    incarnation: string,
    activeJobs: number,
    now = new Date(),
  ) {
    const existing = this.nodes.get(nodeId);
    if (!existing || existing.incarnation !== incarnation)
      throw new Error('STALE_NODE_INCARNATION');
    if (
      !Number.isInteger(activeJobs) ||
      activeJobs < 0 ||
      activeJobs > existing.maxConcurrentJobs
    )
      throw new Error('INVALID_NODE_LOAD');
    if (['OFFLINE', 'DRAINING'].includes(existing.state))
      throw new Error('NODE_NOT_HEARTBEAT_ELIGIBLE');
    const next: JudgeNode = {
      ...existing,
      // Assignments reserve capacity before the next Worker heartbeat arrives.
      // A heartbeat must not erase that reservation while the attempt is live.
      activeJobs: Math.max(existing.activeJobs, activeJobs),
      state:
        Math.max(existing.activeJobs, activeJobs) === 0 ? 'ONLINE' : 'BUSY',
      lastHeartbeatAt: stamp(now),
      observedState: activeJobs === 0 ? 'ONLINE' : 'BUSY',
    };
    this.nodes.set(nodeId, next);
    return structuredClone(next);
  }

  async list(now = new Date()) {
    return [...this.nodes.values()]
      .map((value) => this.refresh(value, now))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  }
  async get(nodeId: string, now = new Date()) {
    const value = this.nodes.get(nodeId);
    return value ? this.refresh(value, now) : undefined;
  }
  async drain(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const value = this.nodes.get(nodeId);
    if (!value) throw new Error('NODE_NOT_FOUND');
    if (
      (expectedIncarnation && expectedIncarnation !== value.incarnation) ||
      (expectedControlVersion !== undefined &&
        expectedControlVersion !== (value.controlVersion ?? 1))
    )
      throw new Error('STALE_CONTROL_VERSION');
    const next = {
      ...value,
      desiredState: 'DRAINING' as const,
      controlVersion: (value.controlVersion ?? 1) + 1,
      state:
        value.activeJobs === 0 ? ('OFFLINE' as const) : ('DRAINING' as const),
    };
    this.nodes.set(nodeId, next);
    return structuredClone(next);
  }
  async offline(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const value = this.nodes.get(nodeId);
    if (!value) throw new Error('NODE_NOT_FOUND');
    if (
      (expectedIncarnation && expectedIncarnation !== value.incarnation) ||
      (expectedControlVersion !== undefined &&
        expectedControlVersion !== (value.controlVersion ?? 1))
    )
      throw new Error('STALE_CONTROL_VERSION');
    const next = {
      ...value,
      desiredState: 'OFFLINE' as const,
      controlVersion: (value.controlVersion ?? 1) + 1,
      state: 'OFFLINE' as const,
    };
    this.nodes.set(nodeId, next);
    return structuredClone(next);
  }
  async enable(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const value = this.nodes.get(nodeId);
    if (!value) throw new Error('NODE_NOT_FOUND');
    if (
      (expectedIncarnation && expectedIncarnation !== value.incarnation) ||
      (expectedControlVersion !== undefined &&
        expectedControlVersion !== (value.controlVersion ?? 1))
    )
      throw new Error('STALE_CONTROL_VERSION');
    const next = {
      ...value,
      desiredState: 'ONLINE' as const,
      controlVersion: (value.controlVersion ?? 1) + 1,
      state:
        value.observedState === 'UNHEALTHY'
          ? ('UNHEALTHY' as const)
          : value.activeJobs
            ? ('BUSY' as const)
            : ('ONLINE' as const),
    };
    this.nodes.set(nodeId, next);
    return structuredClone(next);
  }
  async assign(
    nodeValue: JudgeNode,
    judgeJobId: string,
    attemptGeneration: number,
    now = new Date(),
  ) {
    const current = this.nodes.get(nodeValue.nodeId);
    if (
      !current ||
      current.incarnation !== nodeValue.incarnation ||
      !['ONLINE', 'BUSY'].includes(current.state) ||
      current.activeJobs >= current.maxConcurrentJobs
    )
      throw new Error('NODE_CAPACITY_UNAVAILABLE');
    const assignmentId = randomUUID();
    const value: JudgeNodeAssignment = {
      assignmentId,
      judgeJobId,
      nodeId: current.nodeId,
      incarnation: current.incarnation,
      attemptGeneration,
      status: 'LEASED',
      assignedAt: stamp(now),
    };
    this.assignments.set(assignmentId, value);
    this.nodes.set(current.nodeId, {
      ...current,
      activeJobs: current.activeJobs + 1,
      observedState: 'BUSY',
      state: 'BUSY',
    });
    return structuredClone(value);
  }
  async choose(required: RequiredNodeCapabilities, now = new Date()) {
    const result = scheduleJudgeNode(
      await this.list(now),
      required,
      now,
      this.unhealthyAfterMs,
    );
    return result.node
      ? { node: result.node, reason: result.reason }
      : { reason: result.reason };
  }
  async currentAssignment(
    assignmentId: string,
    nodeId: string,
    incarnation: string,
  ) {
    const value = this.assignments.get(assignmentId);
    return value?.status === 'LEASED' &&
      value.nodeId === nodeId &&
      value.incarnation === incarnation
      ? structuredClone(value)
      : undefined;
  }
  async listAssignments(nodeId: string, limit = 100) {
    return [...this.assignments.values()]
      .filter((a) => a.nodeId === nodeId)
      .slice(0, Math.min(100, limit))
      .map((a) => structuredClone(a));
  }
  async completeAssignment(assignmentId: string) {
    const value = this.assignments.get(assignmentId);
    if (value?.status === 'LEASED') {
      this.assignments.set(assignmentId, { ...value, status: 'COMPLETED' });
      const nodeValue = this.nodes.get(value.nodeId);
      if (nodeValue) {
        const activeJobs = Math.max(0, nodeValue.activeJobs - 1);
        this.nodes.set(value.nodeId, {
          ...nodeValue,
          activeJobs,
          observedState: activeJobs === 0 ? 'ONLINE' : 'BUSY',
          state:
            (nodeValue.desiredState ?? 'ONLINE') === 'OFFLINE'
              ? 'OFFLINE'
              : (nodeValue.desiredState ?? 'ONLINE') === 'DRAINING'
                ? activeJobs
                  ? 'DRAINING'
                  : 'OFFLINE'
                : activeJobs === 0
                  ? 'ONLINE'
                  : 'BUSY',
        });
      }
    }
  }
}

export class PostgresJudgeNodeRepository implements JudgeNodeRepository {
  constructor(
    private readonly pool: Queryable,
    private readonly unhealthyAfterMs = 15_000,
  ) {}
  async register(value: JudgeNodeRegistration, now = new Date()) {
    assertJudgeNodeRegistration(value);
    const result = await this.pool.query(
      `INSERT INTO judge_nodes (node_id,incarnation,runtime_version,capabilities,max_concurrent_jobs,active_jobs,state,last_heartbeat_at,metadata)
       VALUES ($1,$2,$3,$4::jsonb,$5,0,'ONLINE',$6,$7::jsonb)
       ON CONFLICT (node_id) DO UPDATE SET incarnation=EXCLUDED.incarnation,runtime_version=EXCLUDED.runtime_version,capabilities=EXCLUDED.capabilities,max_concurrent_jobs=EXCLUDED.max_concurrent_jobs,active_jobs=CASE WHEN judge_nodes.incarnation=EXCLUDED.incarnation THEN judge_nodes.active_jobs ELSE 0 END,desired_state=judge_nodes.desired_state,observed_state='ONLINE',state=CASE WHEN judge_nodes.desired_state='OFFLINE' THEN 'OFFLINE' WHEN judge_nodes.desired_state='DRAINING' THEN 'DRAINING' ELSE 'ONLINE' END,last_heartbeat_at=EXCLUDED.last_heartbeat_at,metadata=EXCLUDED.metadata,updated_at=now()
       RETURNING *`,
      [
        value.nodeId,
        value.incarnation,
        value.runtimeVersion,
        JSON.stringify(value.capabilities),
        value.maxConcurrentJobs,
        stamp(now),
        JSON.stringify(value.metadata ?? {}),
      ],
    );
    return node(result.rows[0]!);
  }
  async heartbeat(
    nodeId: string,
    incarnation: string,
    activeJobs: number,
    now = new Date(),
  ) {
    const result = await this.pool.query(
      `UPDATE judge_nodes SET active_jobs=GREATEST(active_jobs,$3),observed_state=CASE WHEN GREATEST(active_jobs,$3)=0 THEN 'ONLINE' ELSE 'BUSY' END,state=CASE WHEN desired_state='OFFLINE' THEN 'OFFLINE' WHEN desired_state='DRAINING' THEN 'DRAINING' WHEN GREATEST(active_jobs,$3)=0 THEN 'ONLINE' ELSE 'BUSY' END,last_heartbeat_at=$4,updated_at=now()
       WHERE node_id=$1 AND incarnation=$2 AND state NOT IN ('OFFLINE','DRAINING') AND $3 BETWEEN 0 AND max_concurrent_jobs RETURNING *`,
      [nodeId, incarnation, activeJobs, stamp(now)],
    );
    if (!result.rows[0]) throw new Error('STALE_NODE_INCARNATION');
    return node(result.rows[0]);
  }
  private async refresh(now = new Date()) {
    await this.pool.query(
      `UPDATE judge_nodes SET state=CASE WHEN state='DRAINING' AND active_jobs=0 THEN 'OFFLINE' WHEN state IN ('ONLINE','BUSY') AND last_heartbeat_at < $1 THEN 'UNHEALTHY' ELSE state END,updated_at=now() WHERE state IN ('ONLINE','BUSY','DRAINING')`,
      [new Date(now.getTime() - this.unhealthyAfterMs).toISOString()],
    );
  }
  async list(now = new Date()) {
    await this.refresh(now);
    const result = await this.pool.query(
      'SELECT * FROM judge_nodes ORDER BY node_id',
    );
    return result.rows.map(node);
  }
  async get(nodeId: string, now = new Date()) {
    await this.refresh(now);
    const result = await this.pool.query(
      'SELECT * FROM judge_nodes WHERE node_id=$1',
      [nodeId],
    );
    return result.rows[0] ? node(result.rows[0]) : undefined;
  }
  async drain(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const result = await this.pool.query(
      `UPDATE judge_nodes SET desired_state='DRAINING',control_version=control_version+1,state=CASE WHEN active_jobs=0 THEN 'OFFLINE' ELSE 'DRAINING' END,updated_at=now() WHERE node_id=$1 AND ($2::text IS NULL OR incarnation=$2) AND ($3::int IS NULL OR control_version=$3) RETURNING *`,
      [nodeId, expectedIncarnation ?? null, expectedControlVersion ?? null],
    );
    if (!result.rows[0])
      throw new Error(
        expectedIncarnation || expectedControlVersion !== undefined
          ? 'STALE_CONTROL_VERSION'
          : 'NODE_NOT_FOUND',
      );
    return node(result.rows[0]);
  }
  async offline(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const result = await this.pool.query(
      `UPDATE judge_nodes SET desired_state='OFFLINE',control_version=control_version+1,state='OFFLINE',updated_at=now() WHERE node_id=$1 AND ($2::text IS NULL OR incarnation=$2) AND ($3::int IS NULL OR control_version=$3) RETURNING *`,
      [nodeId, expectedIncarnation ?? null, expectedControlVersion ?? null],
    );
    if (!result.rows[0])
      throw new Error(
        expectedIncarnation || expectedControlVersion !== undefined
          ? 'STALE_CONTROL_VERSION'
          : 'NODE_NOT_FOUND',
      );
    return node(result.rows[0]);
  }
  async enable(
    nodeId: string,
    expectedIncarnation?: string,
    expectedControlVersion?: number,
  ) {
    const result = await this.pool.query(
      `UPDATE judge_nodes SET desired_state='ONLINE',control_version=control_version+1,state=CASE WHEN observed_state='UNHEALTHY' THEN 'UNHEALTHY' WHEN active_jobs>0 THEN 'BUSY' ELSE 'ONLINE' END,updated_at=now() WHERE node_id=$1 AND ($2::text IS NULL OR incarnation=$2) AND ($3::int IS NULL OR control_version=$3) RETURNING *`,
      [nodeId, expectedIncarnation ?? null, expectedControlVersion ?? null],
    );
    if (!result.rows[0]) throw new Error('STALE_CONTROL_VERSION');
    return node(result.rows[0]);
  }
  async assign(
    nodeValue: JudgeNode,
    judgeJobId: string,
    attemptGeneration: number,
    now = new Date(),
  ) {
    const reservation = await this.pool.query(
      `UPDATE judge_nodes SET active_jobs=active_jobs+1,observed_state='BUSY',state=CASE WHEN desired_state='OFFLINE' THEN 'OFFLINE' WHEN desired_state='DRAINING' THEN 'DRAINING' ELSE 'BUSY' END,updated_at=now()
       WHERE node_id=$1 AND incarnation=$2 AND state IN ('ONLINE','BUSY') AND active_jobs < max_concurrent_jobs RETURNING node_id`,
      [nodeValue.nodeId, nodeValue.incarnation],
    );
    if (!reservation.rows[0]) throw new Error('NODE_CAPACITY_UNAVAILABLE');
    let result;
    try {
      result = await this.pool.query(
        `INSERT INTO judge_node_assignments (assignment_id,judge_job_id,node_id,incarnation,attempt_generation,status,assigned_at) VALUES ($1,$2,$3,$4,$5,'LEASED',$6) RETURNING *`,
        [
          randomUUID(),
          judgeJobId,
          nodeValue.nodeId,
          nodeValue.incarnation,
          attemptGeneration,
          stamp(now),
        ],
      );
    } catch (error) {
      await this.pool.query(
        `UPDATE judge_nodes SET active_jobs=GREATEST(active_jobs-1,0),state=CASE WHEN active_jobs <= 1 THEN 'ONLINE' ELSE 'BUSY' END,updated_at=now() WHERE node_id=$1 AND incarnation=$2`,
        [nodeValue.nodeId, nodeValue.incarnation],
      );
      throw error;
    }
    const value = result.rows[0]!;
    return {
      assignmentId: String(value.assignment_id),
      judgeJobId: String(value.judge_job_id),
      nodeId: String(value.node_id),
      incarnation: String(value.incarnation),
      attemptGeneration: Number(value.attempt_generation),
      status: value.status,
      assignedAt: new Date(value.assigned_at).toISOString(),
    };
  }
  async choose(required: RequiredNodeCapabilities, now = new Date()) {
    const result = scheduleJudgeNode(
      await this.list(now),
      required,
      now,
      this.unhealthyAfterMs,
    );
    return result.node
      ? { node: result.node, reason: result.reason }
      : { reason: result.reason };
  }
  async currentAssignment(
    assignmentId: string,
    nodeId: string,
    incarnation: string,
  ) {
    const result = await this.pool.query(
      `SELECT * FROM judge_node_assignments WHERE assignment_id=$1 AND node_id=$2 AND incarnation=$3 AND status='LEASED'`,
      [assignmentId, nodeId, incarnation],
    );
    const value = result.rows[0];
    return value
      ? {
          assignmentId: String(value.assignment_id),
          judgeJobId: String(value.judge_job_id),
          nodeId: String(value.node_id),
          incarnation: String(value.incarnation),
          attemptGeneration: Number(value.attempt_generation),
          status: value.status,
          assignedAt: new Date(value.assigned_at).toISOString(),
        }
      : undefined;
  }
  async listAssignments(nodeId: string, limit = 100) {
    const result = await this.pool.query(
      `SELECT * FROM judge_node_assignments WHERE node_id=$1 ORDER BY assigned_at DESC LIMIT $2`,
      [nodeId, Math.min(100, limit)],
    );
    return result.rows.map((value) => ({
      assignmentId: String(value.assignment_id),
      judgeJobId: String(value.judge_job_id),
      nodeId: String(value.node_id),
      incarnation: String(value.incarnation),
      attemptGeneration: Number(value.attempt_generation),
      status: value.status,
      assignedAt: new Date(value.assigned_at).toISOString(),
    }));
  }
  async completeAssignment(assignmentId: string) {
    await this.pool.query(
      `WITH resolved AS (
         UPDATE judge_node_assignments SET status='COMPLETED' WHERE assignment_id=$1 AND status='LEASED' RETURNING node_id,incarnation
       )
       UPDATE judge_nodes SET active_jobs=GREATEST(active_jobs-1,0),observed_state=CASE WHEN active_jobs <= 1 THEN 'ONLINE' ELSE 'BUSY' END,state=CASE WHEN desired_state='OFFLINE' THEN 'OFFLINE' WHEN desired_state='DRAINING' AND active_jobs <= 1 THEN 'OFFLINE' WHEN desired_state='DRAINING' THEN 'DRAINING' WHEN active_jobs <= 1 THEN 'ONLINE' ELSE 'BUSY' END,updated_at=now()
       WHERE (node_id,incarnation) IN (SELECT node_id,incarnation FROM resolved)`,
      [assignmentId],
    );
  }
}
