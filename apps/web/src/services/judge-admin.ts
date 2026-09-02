import { ApiError } from './api.js';

export type JudgeNodeState =
  'ONLINE' | 'BUSY' | 'DRAINING' | 'OFFLINE' | 'UNHEALTHY';
export type JudgeCapabilities = {
  languageProfiles: string[];
  checkers: string[];
  executionModes: string[];
  sandboxContractVersion: string;
};
export type JudgeNode = {
  nodeId: string;
  incarnation: string;
  desiredState: JudgeNodeState;
  observedState: JudgeNodeState;
  runtimeVersion: string;
  maxConcurrentJobs: number;
  activeJobs: number;
  availableCapacity: number;
  lastHeartbeatAt: string;
  heartbeatAgeMs: number;
  capabilities: JudgeCapabilities;
  recentFailureCount: number;
  controlVersion: number;
};
export type JudgeSummary = {
  totalNodes: number;
  onlineCount: number;
  busyCount: number;
  drainingCount: number;
  offlineCount: number;
  unhealthyCount: number;
  activeJobs: number;
  totalCapacity: number;
  schedulableCapacity: number;
  staleNodeCount: number;
  generatedAt: string;
};
export type JudgeHistory = {
  items: Array<Record<string, unknown>>;
  nextCursor?: string;
};
export type JudgeMetrics = {
  nodesByState: Record<string, number>;
  activeJobs: number;
  totalCapacity: number;
  generatedAt: string;
};
export type JudgeMutation = {
  operationId: string;
  correlationId: string;
  node: JudgeNode;
};
export type JudgeAction = 'drain' | 'offline' | 'enable';

export function createJudgeAdminClient(
  baseUrl = '',
  fetcher: typeof fetch = fetch,
) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${baseUrl}/api/admin/judge${path}`, {
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!response.ok) {
      let body: { code?: string; message?: string; requestId?: string } = {};
      try {
        body = await response.json();
      } catch {
        /* preserve stable status */
      }
      throw new ApiError(
        {
          code: body.code ?? `HTTP_${response.status}`,
          message: body.message ?? 'Judge admin request failed',
          requestId: body.requestId ?? 'unknown',
        },
        response.status,
      );
    }
    return (await response.json()) as T;
  }
  function csrfToken() {
    if (typeof document === 'undefined') return undefined;
    const item = document.cookie
      .split('; ')
      .find((part) => part.startsWith('oj_csrf='));
    return item ? decodeURIComponent(item.slice('oj_csrf='.length)) : undefined;
  }
  return {
    summary: () => request<JudgeSummary>('/summary'),
    nodes: (query = '') =>
      request<{ items: JudgeNode[]; nextCursor?: string }>(`/nodes${query}`),
    node: (id: string) =>
      request<JudgeNode>(`/nodes/${encodeURIComponent(id)}`),
    assignments: (id: string) =>
      request<JudgeHistory>(`/nodes/${encodeURIComponent(id)}/assignments`),
    jobs: (id: string) =>
      request<JudgeHistory>(`/nodes/${encodeURIComponent(id)}/jobs`),
    failures: (id: string) =>
      request<JudgeHistory>(`/nodes/${encodeURIComponent(id)}/failures`),
    assignment: (id: string) =>
      request<Record<string, unknown>>(
        `/assignments/${encodeURIComponent(id)}`,
      ),
    metrics: () => request<JudgeMetrics>('/metrics'),
    mutate: (
      id: string,
      action: JudgeAction,
      body: {
        reason: string;
        expectedIncarnation: string;
        expectedControlVersion: number;
        idempotencyKey: string;
      },
    ) => {
      const csrf = csrfToken();
      return request<JudgeMutation>(
        `/nodes/${encodeURIComponent(id)}/${action}`,
        {
          method: 'POST',
          ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}),
          body: JSON.stringify(body),
        },
      );
    },
  };
}
export type JudgeAdminClient = ReturnType<typeof createJudgeAdminClient>;
