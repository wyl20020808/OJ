export type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: 'active';
};
export type Example = { input: string; output: string; note?: string };
export type Problem = {
  id: string;
  slug: string;
  title: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  examples: Example[];
  constraints: string;
  notes?: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  visibility: 'private' | 'public';
  status: 'draft' | 'published' | 'archived';
  testdataVersion: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Page = { limit: number; offset: number; total: number };
export type ProblemList = { items: Problem[]; page: Page };
export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly details?: unknown;
  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.cause = status;
  }
}
async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
  acceptedStatuses: number[] = [],
): Promise<T> {
  const response = await fetcher(`${baseUrl}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  });
  if (
    !response.ok &&
    !(response.status >= 200 && response.status < 300) &&
    !acceptedStatuses.includes(response.status)
  ) {
    let body: ApiErrorBody = {
      code: 'NETWORK_ERROR',
      message: 'The service request failed.',
      requestId: 'unknown',
    };
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* generic error */
    }
    throw new ApiError(body, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
export type ApiClient = ReturnType<typeof createApiClient>;
export function createApiClient(baseUrl = '', fetcher: typeof fetch = fetch) {
  return {
    me: () =>
      request<AuthenticatedUser>(baseUrl, '/api/auth/me', undefined, fetcher),
    login: (identity: string, password: string) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ identity, password }) },
        fetcher,
      ),
    register: (
      username: string,
      email: string,
      password: string,
      displayName = username,
    ) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ username, email, displayName, password }),
        },
        fetcher,
      ),
    logout: () =>
      request<void>(
        baseUrl,
        '/api/auth/logout',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    problems: (offset = 0, limit = 20) =>
      request<ProblemList>(
        baseUrl,
        `/api/problems?offset=${offset}&limit=${limit}`,
        undefined,
        fetcher,
      ),
    problem: (idOrSlug: string) =>
      request<Problem>(
        baseUrl,
        `/api/problems/${encodeURIComponent(idOrSlug)}`,
        undefined,
        fetcher,
      ),
    readiness: () =>
      request<{
        status: 'ok' | 'not_ready';
        dependencies: Record<string, 'ok' | 'unavailable'>;
      }>(baseUrl, '/ready', undefined, fetcher, [503]),
  };
}
