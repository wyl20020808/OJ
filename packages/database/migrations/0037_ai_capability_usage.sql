-- AI capability usage ledger (Stage 6 — site-wide AI capability broker).
--
-- Cost and capacity evidence only. The shape deliberately makes content storage impossible:
-- there is no column for prompts, learner text, AI responses, reasoning content or credentials.
-- One logical request row per consumer call; one provider attempt row per real provider dispatch,
-- so fallback chains are fully accounted.

CREATE TABLE ai_capability_usage_requests (
  usage_record_id text PRIMARY KEY,
  logical_request_id text NOT NULL,
  request_id text NOT NULL,
  caller_plugin_id text NOT NULL,
  subject_hash text,
  capability text NOT NULL,
  capability_version text NOT NULL,
  profile text NOT NULL,
  config_version text NOT NULL,
  config_digest text NOT NULL,
  started_at_ms bigint NOT NULL,
  finished_at_ms bigint NOT NULL,
  latency_ms integer NOT NULL,
  status text NOT NULL,
  error_code text,
  error_reason text,
  attempt_count integer NOT NULL,
  fallback_count integer NOT NULL,
  retry_count integer NOT NULL,
  repair_count integer NOT NULL,
  final_usage jsonb NOT NULL,
  total_usage jsonb NOT NULL,
  total_usage_complete boolean NOT NULL,
  total_cost jsonb NOT NULL,
  idempotency_outcome text NOT NULL
);

CREATE INDEX ai_capability_usage_requests_logical_idx
  ON ai_capability_usage_requests (logical_request_id);

CREATE INDEX ai_capability_usage_requests_caller_idx
  ON ai_capability_usage_requests (caller_plugin_id, started_at_ms);

CREATE INDEX ai_capability_usage_requests_subject_idx
  ON ai_capability_usage_requests (subject_hash, started_at_ms)
  WHERE subject_hash IS NOT NULL;

CREATE TABLE ai_capability_usage_attempts (
  usage_record_id text PRIMARY KEY,
  logical_request_id text NOT NULL,
  attempt_id text NOT NULL,
  parent_attempt_id text,
  sequence integer NOT NULL,
  attempt_kind text NOT NULL,
  caller_plugin_id text NOT NULL,
  subject_hash text,
  capability text NOT NULL,
  capability_version text NOT NULL,
  profile text NOT NULL,
  provider_id text NOT NULL,
  model_alias text NOT NULL,
  provider_model_id text NOT NULL,
  route_config_version text NOT NULL,
  started_at_ms bigint NOT NULL,
  finished_at_ms bigint NOT NULL,
  latency_ms integer NOT NULL,
  status text NOT NULL,
  error_code text,
  error_reason text,
  retry_rule text,
  fallback_rule text,
  skip_reason text,
  usage jsonb NOT NULL,
  usage_known boolean NOT NULL,
  cost jsonb,
  pricing_id text,
  pricing_version text
);

CREATE INDEX ai_capability_usage_attempts_logical_idx
  ON ai_capability_usage_attempts (logical_request_id);

CREATE INDEX ai_capability_usage_attempts_caller_idx
  ON ai_capability_usage_attempts (caller_plugin_id, started_at_ms);

CREATE INDEX ai_capability_usage_attempts_provider_idx
  ON ai_capability_usage_attempts (provider_id, started_at_ms);
