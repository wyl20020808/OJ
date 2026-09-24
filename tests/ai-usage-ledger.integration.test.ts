import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresUsageLedger,
  summarizeUsageByCaller,
} from '../apps/api/src/modules/ai/usage-ledger.js';
import { createDatabase } from '../packages/database/src/index.js';

/**
 * Stage 6 usage ledger against real Postgres (`$DATABASE_URL` or the repo default). Verifies
 * append-only semantics, the read-back mapping, per-caller attribution aggregates, and — as a
 * schema property — that the ledger has no column capable of holding content.
 */

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://ojplatform:ojplatform_dev@127.0.0.1:55432/ojplatform';
const pool = createDatabase({ url: databaseUrl }).pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  const applied = await pool.query(
    "SELECT to_regclass('public.ai_capability_usage_requests') AS reg",
  );
  if (applied.rows[0]?.['reg'] === null) {
    await pool.query(
      await readFile(
        'packages/database/migrations/0037_ai_capability_usage.sql',
        'utf8',
      ),
    );
  }
});

afterAll(async () => {
  await pool.end();
});

const requestRecord = (suffix: string, caller = 'site.problem') => ({
  usageRecordId: `ur-${run}-${suffix}`,
  logicalRequestId: `lr-${run}-${suffix}`,
  requestId: `req-${run}-${suffix}`,
  callerPluginId: caller,
  subjectHash: `sha256:${run}`,
  capability: 'ai.text.generate',
  capabilityVersion: '1.0',
  profile: 'balanced',
  configVersion: 'cfg-1',
  configDigest: `digest-${run}`,
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_000_120,
  latencyMs: 120,
  status: 'SUCCEEDED',
  attemptCount: 1,
  fallbackCount: 0,
  retryCount: 0,
  repairCount: 0,
  finalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  totalUsageComplete: true,
  totalCost: { value: 0.0001, currency: 'USD', basis: 'ESTIMATED' },
  idempotencyOutcome: 'EXECUTED',
  promptApplied: true,
  promptVersion: `encouragement-${run}`,
});

const attemptRecord = (suffix: string, caller = 'site.problem') => ({
  usageRecordId: `ua-${run}-${suffix}`,
  logicalRequestId: `lr-${run}-${suffix}`,
  attemptId: `att-${run}-${suffix}`,
  sequence: 0,
  attemptKind: 'PRIMARY',
  callerPluginId: caller,
  subjectHash: `sha256:${run}`,
  capability: 'ai.text.generate',
  capabilityVersion: '1.0',
  profile: 'balanced',
  providerId: 'relay',
  modelAlias: 'fast',
  providerModelId: 'relay-model-x',
  routeConfigVersion: 'cfg-1',
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_000_120,
  latencyMs: 120,
  status: 'SUCCEEDED',
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  usageKnown: true,
  cost: { value: 0.0001, currency: 'USD', basis: 'ESTIMATED' },
  pricingId: 'relay-fast',
  pricingVersion: '2026-01',
});

describe('Postgres usage ledger', () => {
  it('appends and reads back logical requests and provider attempts', async () => {
    const ledger = createPostgresUsageLedger(pool);
    await ledger.appendRequest(requestRecord('one'));
    await ledger.appendAttempt(attemptRecord('one'));
    const requests = await ledger.requests(`lr-${run}-one`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.['callerPluginId']).toBe('site.problem');
    expect(requests[0]?.['totalUsage']).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    expect(requests[0]?.['idempotencyOutcome']).toBe('EXECUTED');
    // Prompt provenance labels round-trip as flat port fields (stored as one `provenance` object).
    expect(requests[0]?.['promptApplied']).toBe(true);
    expect(requests[0]?.['promptVersion']).toBe(`encouragement-${run}`);
    const attempts = await ledger.attempts(`lr-${run}-one`);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.['providerId']).toBe('relay');
    expect(attempts[0]?.['usageKnown']).toBe(true);
    expect(attempts[0]?.['pricingVersion']).toBe('2026-01');
  });

  it('is append-only: a duplicate usageRecordId is ignored, never rewritten', async () => {
    const ledger = createPostgresUsageLedger(pool);
    await ledger.appendRequest(requestRecord('dup'));
    await ledger.appendRequest({ ...requestRecord('dup'), latencyMs: 999 });
    const requests = await ledger.requests(`lr-${run}-dup`);
    expect(requests).toHaveLength(1);
    expect(Number(requests[0]?.['latencyMs'])).toBe(120);
  });

  it('attributes usage per trusted caller key', async () => {
    const ledger = createPostgresUsageLedger(pool);
    // Caller ids are run-unique: the shared development database accumulates rows across runs.
    const siteCaller = `site.attribution-${run}`;
    const pluginCaller = `plugin.attribution-${run}`;
    await ledger.appendRequest(requestRecord('attr-a', siteCaller));
    await ledger.appendRequest(requestRecord('attr-b', siteCaller));
    await ledger.appendRequest({
      ...requestRecord('attr-c', pluginCaller),
      status: 'FAILED',
    });
    const summary = await summarizeUsageByCaller(pool, {
      sinceMs: 1_600_000_000_000,
    });
    const site = summary.find((row) => row.callerPluginId === siteCaller);
    const plugin = summary.find((row) => row.callerPluginId === pluginCaller);
    expect(site).toBeDefined();
    expect(site!.requestCount).toBe(2);
    expect(site!.failedCount).toBe(0);
    expect(site!.totalInputTokens).toBe(20);
    expect(site!.totalOutputTokens).toBe(10);
    expect(plugin).toBeDefined();
    expect(plugin!.requestCount).toBe(1);
    expect(plugin!.failedCount).toBe(1);
  });

  it('schema property: no column can hold content', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('ai_capability_usage_requests', 'ai_capability_usage_attempts')`,
    );
    const columns = rows.map((row) => String(row['column_name']));
    for (const forbidden of [
      'prompt',
      'output',
      'input',
      'content',
      'response',
      'messages',
      'secret',
      'credential',
      'token',
    ]) {
      expect(columns.filter((column) => column.includes(forbidden))).toEqual(
        [],
      );
    }
  });
});
