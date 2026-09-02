import { describe, expect, it, vi } from 'vitest';
import { createJudgeAdminClient } from '../apps/web/src/services/judge-admin.js';

describe('Product-facing Judge Admin client', () => {
  it('uses only the Product namespace and sends concurrency guards', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) =>
      new Response(JSON.stringify({ operationId: 'op-1', correlationId: 'corr-1', node: {} }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const api = createJudgeAdminClient('https://product.example', fetcher);
    await api.mutate('judge/a', 'drain', { reason: 'maintenance', expectedIncarnation: 'inc-1', expectedControlVersion: 7, idempotencyKey: 'key-1' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://product.example/api/admin/judge/nodes/judge%2Fa/drain');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'maintenance', expectedIncarnation: 'inc-1', expectedControlVersion: 7, idempotencyKey: 'key-1' });
    expect(String(url)).not.toContain('/v1/admin');
  });

  it('preserves stable Product error classes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 'JUDGE_NODE_CONTROL_CONFLICT', message: 'changed', requestId: 'r1' }), { status: 409 }));
    await expect(createJudgeAdminClient('', fetcher).node('judge-a')).rejects.toMatchObject({ status: 409, code: 'JUDGE_NODE_CONTROL_CONFLICT' });
  });
});
