/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AddNodeInput,
  JudgeAdminAdapter,
  LifecycleInput,
  MutationInput,
  PageQuery,
  PolicyMutationInput,
  RequestHeaders,
  ModeMutationInput,
} from './model.js';

export class JudgeAdminUpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly upstreamCode?: string,
  ) {
    super('Judge admin upstream request failed');
    this.name = 'JudgeAdminUpstreamError';
  }
}
export class JudgeAdminAdapterClient implements JudgeAdminAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 1500,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  private async call(path: string, init: RequestInit = {}): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}${path}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            'x-judge-service-token': this.token,
            ...(init.headers ?? {}),
          },
        },
      );
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok)
        throw new JudgeAdminUpstreamError(
          response.status,
          typeof body === 'object' &&
            body &&
            'code' in body &&
            typeof body.code === 'string'
            ? body.code
            : undefined,
        );
      if (body === null || typeof body !== 'object')
        throw new JudgeAdminUpstreamError(502, 'MALFORMED_RESPONSE');
      return sanitize(body);
    } catch (error) {
      if (error instanceof JudgeAdminUpstreamError) throw error;
      if ((error as any)?.name === 'AbortError')
        throw new JudgeAdminUpstreamError(504, 'TIMEOUT');
      throw new JudgeAdminUpstreamError(502, 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
  summary() {
    return this.call('/v1/admin/cluster/summary');
  }
  nodes(q: PageQuery = {}) {
    const p = new URLSearchParams();
    if (q.limit) p.set('limit', String(Math.min(100, Math.max(1, q.limit))));
    if (q.cursor) p.set('cursor', q.cursor);
    return this.call(`/v1/admin/nodes${p.size ? `?${p}` : ''}`);
  }
  node(id: string) {
    return this.call(`/v1/admin/nodes/${encodeURIComponent(id)}`);
  }
  assignments(id: string, q?: PageQuery) {
    return this.list(
      `/v1/admin/nodes/${encodeURIComponent(id)}/assignments`,
      q,
    );
  }
  jobs(id: string, q?: PageQuery) {
    return this.list(`/v1/admin/nodes/${encodeURIComponent(id)}/jobs`, q);
  }
  failures(id: string, q?: PageQuery) {
    return this.list(`/v1/admin/nodes/${encodeURIComponent(id)}/failures`, q);
  }
  assignment(id: string) {
    return this.call(`/v1/admin/assignments/${encodeURIComponent(id)}`);
  }
  metrics() {
    return this.call('/v1/admin/metrics');
  }
  policy() {
    return this.call('/v1/admin/pool/policy');
  }
  templates() {
    return this.call('/v1/admin/pool/templates');
  }
  hostCapacity() {
    return this.call('/v1/admin/pool/host-capacity');
  }
  lifecycleCapabilities() {
    return this.call('/v1/admin/lifecycle/capabilities');
  }
  lifecycleHistory(q?: PageQuery) {
    return this.list('/v1/admin/lifecycle/operations', q);
  }
  autoscalerHistory(q?: PageQuery) {
    return this.list('/v1/admin/autoscaler/decisions', q);
  }
  private list(path: string, q: PageQuery = {}) {
    const p = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, q.limit ?? 25))),
    });
    if (q.cursor) p.set('cursor', q.cursor);
    return this.call(`${path}?${p}`);
  }
  mutate(
    action: 'drain' | 'offline' | 'enable',
    id: string,
    input: MutationInput,
    headers: RequestHeaders = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    },
  ) {
    return this.call(`/v1/admin/nodes/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': headers.requestId,
        'x-correlation-id': headers.correlationId,
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify(input),
    });
  }
  private command(path: string, input: unknown, headers: RequestHeaders) {
    return this.call(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': headers.requestId,
        'x-correlation-id': headers.correlationId,
        'idempotency-key':
          typeof input === 'object' && input && 'idempotencyKey' in input
            ? String((input as { idempotencyKey: string }).idempotencyKey)
            : '',
      },
      body: JSON.stringify(input),
    });
  }
  addNode(
    input: AddNodeInput,
    headers: RequestHeaders = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    },
  ) {
    return this.command('/v1/admin/nodes', input, headers);
  }
  lifecycle(
    action: 'start' | 'stop' | 'restart',
    id: string,
    input: LifecycleInput,
    headers: RequestHeaders = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    },
  ) {
    return this.command(
      `/v1/admin/nodes/${encodeURIComponent(id)}/${action}`,
      input,
      headers,
    );
  }
  updatePolicy(
    input: PolicyMutationInput,
    headers: RequestHeaders = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    },
  ) {
    return this.command('/v1/admin/pool/policy', input, headers);
  }
  setMode(
    input: ModeMutationInput,
    headers: RequestHeaders = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    },
  ) {
    return this.command('/v1/admin/pool/mode', input, headers);
  }
}

const blocked =
  /token|secret|password|lease|source|testdata|stdout|stderr|stack/i;
function sanitize(value: unknown): any {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.test(key))
      .map(([key, item]) => [key, sanitize(item)]),
  );
}
