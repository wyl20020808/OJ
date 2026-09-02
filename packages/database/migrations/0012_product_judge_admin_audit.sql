CREATE TABLE IF NOT EXISTS product_judge_admin_audit (
  id bigserial PRIMARY KEY, actor_user_id uuid, permission text NOT NULL, action text NOT NULL,
  node_id text NOT NULL, expected_incarnation text, expected_control_version bigint,
  before_state jsonb, after_state jsonb, reason text, request_id text NOT NULL,
  correlation_id text NOT NULL, idempotency_key text, outcome text NOT NULL,
  error_code text, occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS product_judge_admin_audit_actor_time_idx ON product_judge_admin_audit(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_judge_admin_audit_node_time_idx ON product_judge_admin_audit(node_id, occurred_at DESC);
