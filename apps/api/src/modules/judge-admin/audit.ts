import type { JudgeAdminAudit, JudgeAdminAuditRepository } from './model.js';
export class MemoryJudgeAdminAuditRepository implements JudgeAdminAuditRepository {
  readonly events: JudgeAdminAudit[] = [];
  async record(event: JudgeAdminAudit) {
    this.events.push(structuredClone(event));
  }
}
export class PostgresJudgeAdminAuditRepository implements JudgeAdminAuditRepository {
  constructor(
    private readonly pool: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    },
  ) {}
  async record(e: JudgeAdminAudit) {
    await this.pool.query(
      'INSERT INTO product_judge_admin_audit (actor_user_id, permission, action, node_id, expected_incarnation, expected_control_version, before_state, after_state, reason, request_id, correlation_id, idempotency_key, outcome, error_code, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
      [
        e.actorUserId,
        e.permission,
        e.action,
        e.nodeId,
        e.expectedIncarnation ?? null,
        e.expectedControlVersion ?? null,
        e.beforeState ?? null,
        e.afterState ?? null,
        e.reason ?? null,
        e.requestId,
        e.correlationId,
        e.idempotencyKey ?? null,
        e.outcome,
        e.errorCode ?? null,
        e.occurredAt,
      ],
    );
  }
}
