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
  currentRevisionId?: string;
  createdAt: string;
  updatedAt: string;
};
export type Page = { limit: number; offset: number; total: number };
export type ProblemList = { items: Problem[]; page: Page };
export type Home = { recentProblems: Problem[] };
export type Language = {
  id: string;
  name: string;
  extension: string;
  maxSourceBytes: number;
};
export type SubmissionStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'LEASED'
  | 'RUNNING'
  | 'RETRYABLE_FAILURE'
  | 'PROTOCOL_FAILURE'
  | 'SYNTHETIC_COMPLETED';
export type Submission = {
  id: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string | null;
  languageId: string;
  source: string;
  sourceBytes: number;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  attempt?: number;
  maxAttempts?: number;
  retryAt?: string | null;
  failureCode?: string | null;
  synthetic?: boolean;
};
export type SubmissionList = { items: Submission[]; nextCursor: string | null };
export type ProblemInput = Omit<
  Problem,
  'id' | 'createdAt' | 'updatedAt' | 'authorId' | 'testdataVersion'
> & {
  testdataVersion?: string | null;
};
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
    home: () => request<Home>(baseUrl, '/api/home', undefined, fetcher),
    problem: (idOrSlug: string) =>
      request<Problem>(
        baseUrl,
        `/api/problems/${encodeURIComponent(idOrSlug)}`,
        undefined,
        fetcher,
      ),
    createProblem: (input: ProblemInput) =>
      request<Problem>(
        baseUrl,
        '/api/problems',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    updateProblem: (idOrSlug: string, input: Partial<ProblemInput>) =>
      request<Problem>(
        baseUrl,
        `/api/problems/${encodeURIComponent(idOrSlug)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        fetcher,
      ),
    transitionProblem: (
      idOrSlug: string,
      transition: {
        status?: Problem['status'];
        visibility?: Problem['visibility'];
      },
    ) =>
      request<Problem>(
        baseUrl,
        `/api/problems/${encodeURIComponent(idOrSlug)}/transition`,
        { method: 'POST', body: JSON.stringify(transition) },
        fetcher,
      ),
    languages: () =>
      request<Language[]>(
        baseUrl,
        '/api/submissions/languages',
        undefined,
        fetcher,
      ),
    createSubmission: (input: {
      problemId: string;
      problemRevisionId: string;
      testdataVersionRef: string | null;
      languageId: string;
      source: string;
    }) =>
      request<Submission>(
        baseUrl,
        '/api/submissions',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    submissions: (cursor?: string, limit = 20) =>
      request<SubmissionList>(
        baseUrl,
        `/api/submissions?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        fetcher,
      ),
    submission: (id: string) =>
      request<Submission>(
        baseUrl,
        `/api/submissions/${encodeURIComponent(id)}`,
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
