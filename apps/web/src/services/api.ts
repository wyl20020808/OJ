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
  | 'CLAIMED'
  | 'WORKER_ACCEPTED'
  | 'SAFE_FIXTURE_RUNNING'
  | 'RUNNING'
  | 'FAILED_RETRYABLE'
  | 'RETRYABLE_FAILURE'
  | 'REQUEUED'
  | 'FAILED_TERMINAL'
  | 'PROTOCOL_FAILURE'
  | 'CANCELLED'
  | 'SAFE_FIXTURE_SUCCEEDED'
  | 'SYNTHETIC_COMPLETED'
  | 'WORKER_DEGRADED'
  | 'WORKER_OFFLINE';
export type ExecutionStage =
  | 'QUEUED'
  | 'LEASED'
  | 'CLAIMED'
  | 'WORKER_ACCEPTED'
  | 'SAFE_FIXTURE_RUNNING'
  | 'FAILED_RETRYABLE'
  | 'REQUEUED'
  | 'FAILED_TERMINAL'
  | 'CANCELLED'
  | 'SAFE_FIXTURE_SUCCEEDED'
  | 'WORKER_DEGRADED'
  | 'WORKER_OFFLINE';
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
  executionStage?: ExecutionStage;
};
export type WorkerDiagnostics = {
  items: Array<{
    workerId: string;
    workerInstanceId: string;
    lifecycleState: string;
    lastHeartbeatAt?: string;
    heartbeatAgeMs: number | null;
    protocolVersion: '2A.1';
    buildVersion: string;
    maxConcurrency: number;
    activeJobCount: number;
    degraded: boolean;
    offline: boolean;
    diagnosticCode?: string;
    capabilityManifest: {
      executionModes: ['SAFE_FIXTURE_QUALIFICATION'];
      safeFixture: true;
      realSandboxedExecution: false;
      sandboxCapability: false;
      languageCapabilities: [];
    };
  }>;
};
export type SandboxOverview = {
  resourceId: string;
  backendType: string;
  qualificationState: string;
  policyVersion: string | null;
  probeSuiteVersion: string | null;
  lastQualificationAt: string | null;
  capabilities: Array<{ id: string; label: string; state: string }>;
  failureCategory?: string | null;
  realSubmissionExecution: 'DISABLED';
  activeProbeId: string | null;
  lastProbeId: string | null;
  lastProbeOutcome: string | null;
  lastProbePass: boolean | null;
  lastProbeKind: string | null;
  cleanupStatus: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'FAILED';
};
export type SandboxProbe = {
  probeId: string;
  version: string;
  purpose: string;
  timeoutMs: number;
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
  readonly status: number;
  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.status = status;
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
    cancelSubmission: (id: string) =>
      request<{
        judgeJobId: string;
        status: string;
        attempt: number;
        maxAttempts: number;
        synthetic: false;
      }>(
        baseUrl,
        `/api/submissions/${encodeURIComponent(id)}/judge/cancel`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    workerDiagnostics: () =>
      request<WorkerDiagnostics>(
        baseUrl,
        '/api/operations/judge-workers',
        undefined,
        fetcher,
      ),
    sandboxOverview: () =>
      request<SandboxOverview>(
        baseUrl,
        '/api/operations/sandbox',
        undefined,
        fetcher,
      ),
    sandboxProbes: () =>
      request<{ items: SandboxProbe[] }>(
        baseUrl,
        '/api/operations/sandbox/probes',
        undefined,
        fetcher,
      ),
    startSandboxProbe: (probeId: string) =>
      request<unknown>(
        baseUrl,
        `/api/operations/sandbox/probes/${encodeURIComponent(probeId)}`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    cancelSandboxProbe: (probeId: string) =>
      request<unknown>(
        baseUrl,
        `/api/operations/sandbox/probes/${encodeURIComponent(probeId)}/cancel`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    verifySandboxCleanup: () =>
      request<unknown>(
        baseUrl,
        '/api/operations/sandbox/cleanup/verify',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    recoverSandboxCleanup: () =>
      request<unknown>(
        baseUrl,
        '/api/operations/sandbox/cleanup/recover',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    readiness: () =>
      request<{
        status: 'ok' | 'not_ready';
        dependencies: Record<string, 'ok' | 'unavailable'>;
      }>(baseUrl, '/ready', undefined, fetcher, [503]),
  };
}
