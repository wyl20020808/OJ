/**
 * The Postgres usage ledger adapter (`ai_capability_usage_requests` / `..._attempts`).
 *
 * Append-only cost and capacity evidence. The table shape makes content storage impossible —
 * there is no column for a prompt, a learner text, an AI output or a credential, and this
 * adapter never invents one: records arrive from the bridge already normalized and are mapped
 * column-by-column, never `JSON.stringify(the whole record)` into one blob.
 */
import type {
  LogicalRequestUsageRecordLike,
  ProviderAttemptUsageRecordLike,
  UsageLedgerPortLike,
} from './types.js';

/** The pg-pool-shaped seam (structural; no driver import). */
export type SqlQueryLike = {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const jsonb = (value: unknown): string => JSON.stringify(value ?? {});
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean => value === true;

const ATTEMPT_COLUMNS = [
  'usage_record_id',
  'logical_request_id',
  'attempt_id',
  'parent_attempt_id',
  'sequence',
  'attempt_kind',
  'caller_plugin_id',
  'subject_hash',
  'capability',
  'capability_version',
  'profile',
  'provider_id',
  'model_alias',
  'provider_model_id',
  'route_config_version',
  'started_at_ms',
  'finished_at_ms',
  'latency_ms',
  'status',
  'error_code',
  'error_reason',
  'retry_rule',
  'fallback_rule',
  'skip_reason',
  'usage',
  'usage_known',
  'cost',
  'pricing_id',
  'pricing_version',
] as const;

const REQUEST_COLUMNS = [
  'usage_record_id',
  'logical_request_id',
  'request_id',
  'caller_plugin_id',
  'subject_hash',
  'capability',
  'capability_version',
  'profile',
  'config_version',
  'config_digest',
  'started_at_ms',
  'finished_at_ms',
  'latency_ms',
  'status',
  'error_code',
  'error_reason',
  'attempt_count',
  'fallback_count',
  'retry_count',
  'repair_count',
  'final_usage',
  'total_usage',
  'total_usage_complete',
  'total_cost',
  'idempotency_outcome',
  'provenance',
] as const;

const attemptParams = (r: ProviderAttemptUsageRecordLike): readonly unknown[] => [
  text(r['usageRecordId']),
  text(r['logicalRequestId']),
  text(r['attemptId']),
  text(r['parentAttemptId']),
  num(r['sequence']) ?? 0,
  text(r['attemptKind']),
  text(r['callerPluginId']),
  text(r['subjectHash']),
  text(r['capability']),
  text(r['capabilityVersion']),
  text(r['profile']),
  text(r['providerId']),
  text(r['modelAlias']),
  text(r['providerModelId']),
  text(r['routeConfigVersion']),
  num(r['startedAtMs']) ?? 0,
  num(r['finishedAtMs']) ?? 0,
  num(r['latencyMs']) ?? 0,
  text(r['status']),
  text(r['errorCode']),
  text(r['errorReason']),
  text(r['retryRule']),
  text(r['fallbackRule']),
  text(r['skipReason']),
  jsonb(r['usage']),
  bool(r['usageKnown']),
  r['cost'] === undefined || r['cost'] === null ? null : jsonb(r['cost']),
  text(r['pricingId']),
  text(r['pricingVersion']),
];

const requestParams = (r: LogicalRequestUsageRecordLike): readonly unknown[] => [
  text(r['usageRecordId']),
  text(r['logicalRequestId']),
  text(r['requestId']),
  text(r['callerPluginId']),
  text(r['subjectHash']),
  text(r['capability']),
  text(r['capabilityVersion']),
  text(r['profile']),
  text(r['configVersion']),
  text(r['configDigest']),
  num(r['startedAtMs']) ?? 0,
  num(r['finishedAtMs']) ?? 0,
  num(r['latencyMs']) ?? 0,
  text(r['status']),
  text(r['errorCode']),
  text(r['errorReason']),
  num(r['attemptCount']) ?? 0,
  num(r['fallbackCount']) ?? 0,
  num(r['retryCount']) ?? 0,
  num(r['repairCount']) ?? 0,
  jsonb(r['finalUsage']),
  jsonb(r['totalUsage']),
  bool(r['totalUsageComplete']),
  jsonb(r['totalCost']),
  text(r['idempotencyOutcome']),
  // Opaque prompt provenance labels only ({promptApplied, promptVersion}); the adapter never
  // writes prompt content anywhere, and this object holds nothing else by construction.
  r['promptApplied'] === undefined && r['promptVersion'] === undefined
    ? null
    : jsonb({
        ...(r['promptApplied'] === undefined ? {} : { promptApplied: r['promptApplied'] }),
        ...(r['promptVersion'] === undefined ? {} : { promptVersion: r['promptVersion'] }),
      }),
];

const snakeToCamel = (row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())] = value;
  }
  return out;
};

/** Request rows store provenance labels as one `provenance` object; the port shape is flat. */
const rowToRequest = (row: Record<string, unknown>): LogicalRequestUsageRecordLike => {
  const flat = snakeToCamel(row);
  const provenance = flat['provenance'];
  delete flat['provenance'];
  const labels =
    typeof provenance === 'object' && provenance !== null
      ? (provenance as Record<string, unknown>)
      : {};
  return {
    ...flat,
    ...(typeof labels['promptApplied'] === 'boolean' ? { promptApplied: labels['promptApplied'] } : {}),
    ...(typeof labels['promptVersion'] === 'string' ? { promptVersion: labels['promptVersion'] } : {}),
  } as unknown as LogicalRequestUsageRecordLike;
};

const insertSql = (table: string, columns: readonly string[]): string =>
  `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_c, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (usage_record_id) DO NOTHING`;

/**
 * The durable usage ledger. Append-only: duplicate record ids are ignored (`ON CONFLICT DO
 * NOTHING`), so a retried append never rewrites history.
 */
export function createPostgresUsageLedger(sql: SqlQueryLike): UsageLedgerPortLike {
  return {
    async appendAttempt(record) {
      await sql.query(insertSql('ai_capability_usage_attempts', ATTEMPT_COLUMNS), attemptParams(record));
    },
    async appendRequest(record) {
      await sql.query(insertSql('ai_capability_usage_requests', REQUEST_COLUMNS), requestParams(record));
    },
    async attempts(logicalRequestId) {
      const rows =
        logicalRequestId === undefined
          ? (await sql.query('SELECT * FROM ai_capability_usage_attempts ORDER BY started_at_ms, sequence')).rows
          : (
              await sql.query(
                'SELECT * FROM ai_capability_usage_attempts WHERE logical_request_id = $1 ORDER BY started_at_ms, sequence',
                [logicalRequestId],
              )
            ).rows;
      return rows.map((row) => snakeToCamel(row) as unknown as ProviderAttemptUsageRecordLike);
    },
    async requests(logicalRequestId) {
      const rows =
        logicalRequestId === undefined
          ? (await sql.query('SELECT * FROM ai_capability_usage_requests ORDER BY started_at_ms')).rows
          : (
              await sql.query(
                'SELECT * FROM ai_capability_usage_requests WHERE logical_request_id = $1 ORDER BY started_at_ms',
                [logicalRequestId],
              )
            ).rows;
      return rows.map((row) => rowToRequest(row));
    },
  };
}

/** Server-side aggregate row: usage attribution per trusted caller key. */
export type CallerUsageSummary = {
  readonly callerPluginId: string;
  readonly requestCount: number;
  readonly failedCount: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
};

/**
 * Usage attribution for operator diagnostics. Aggregates only — the query surface can never
 * return content, because the table has none.
 */
export async function summarizeUsageByCaller(
  sql: SqlQueryLike,
  options: { readonly sinceMs: number },
): Promise<readonly CallerUsageSummary[]> {
  const { rows } = await sql.query(
    `SELECT caller_plugin_id AS caller,
            COUNT(*)::int AS request_count,
            COUNT(*) FILTER (WHERE status <> 'SUCCEEDED')::int AS failed_count,
            COALESCE(SUM((total_usage->>'inputTokens')::numeric), 0)::bigint AS input_tokens,
            COALESCE(SUM((total_usage->>'outputTokens')::numeric), 0)::bigint AS output_tokens
       FROM ai_capability_usage_requests
      WHERE started_at_ms >= $1
      GROUP BY caller_plugin_id
      ORDER BY request_count DESC, caller_plugin_id`,
    [options.sinceMs],
  );
  return rows.map((row) => ({
    callerPluginId: String(row['caller']),
    requestCount: Number(row['request_count']),
    failedCount: Number(row['failed_count']),
    totalInputTokens: Number(row['input_tokens']),
    totalOutputTokens: Number(row['output_tokens']),
  }));
}
