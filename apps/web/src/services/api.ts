export type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'active';
  guest?: boolean;
  upgradeHint?: string;
};
export type Account = AuthenticatedUser & {
  createdAt: string;
  updatedAt: string;
  capabilities: { canManageSessions: boolean };
};
export type Session = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt?: string;
  deviceLabel?: string;
};
export type AuthProvider = 'wechat' | 'qq' | 'google' | 'github';
export type AuthMethods = {
  registration: { email: boolean; phone: boolean };
  login: {
    emailPassword: boolean;
    phonePassword: boolean;
    emailCode: boolean;
    phoneCode: boolean;
  };
  providers: Record<AuthProvider, 'enabled' | 'disabled' | 'not_configured'>;
  passwordPolicy: { minLength: number };
};
export type AuthCapabilities = {
  guestLogin: { available: boolean };
};
export type VerificationChallenge = {
  challengeId: string;
  channel: 'EMAIL' | 'SMS';
  destination: string;
  expiresAt: string;
  resendAt: string;
  attemptsRemaining: number;
};
export type VerificationGrant = {
  grantId: string;
  purpose: 'REGISTER' | 'LOGIN_CODE' | 'ADD_IDENTIFIER';
  destination: string;
  expiresAt: string;
};
export type ConnectedIdentity = {
  provider: AuthProvider;
  subjectLabel?: string;
  linkedAt: string;
};
export type AccountIdentifier = {
  id: string;
  type: 'EMAIL' | 'PHONE';
  maskedValue: string;
  verifiedAt: string;
  primary: boolean;
  loginCapable: boolean;
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
  difficulty?: string;
  tags?: string[];
  source?: string;
  statistics?: {
    submissionCount: number;
    acceptedCount: number;
  };
  createdAt: string;
  updatedAt: string;
};
export type Page = { limit: number; offset: number; total: number };
export type ProblemList = { items: Problem[]; page: Page };
export type Home = { recentProblems: Problem[] };
export type BackendContest = {
  id: string;
  title: string;
  description: string;
  ownerUserId: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  lifecycle: 'DRAFT' | 'UPCOMING' | 'RUNNING' | 'ENDED' | 'CANCELLED';
  format: 'ICPC' | 'IOI' | 'OI' | 'CUSTOM';
  startsAt: string;
  endsAt: string;
  registrationOpenAt?: string | null;
  registrationCloseAt?: string | null;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};
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
import type {
  ContestProblem,
  FriendRequest,
  FriendSummary,
  Message,
  NotificationSummary,
} from './portal-contracts.js';
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
const defaultAuthMethods: AuthMethods = {
  registration: { email: false, phone: false },
  login: {
    emailPassword: false,
    phonePassword: false,
    emailCode: false,
    phoneCode: false,
  },
  providers: {
    wechat: 'not_configured',
    qq: 'not_configured',
    google: 'not_configured',
    github: 'not_configured',
  },
  passwordPolicy: { minLength: 8 },
};
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
    account: () =>
      request<Account>(baseUrl, '/api/auth/account', undefined, fetcher),
    sessions: () =>
      request<Session[]>(baseUrl, '/api/auth/sessions', undefined, fetcher),
    revokeSession: (id: string) =>
      request<void>(
        baseUrl,
        `/api/auth/sessions/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        fetcher,
      ),
    revokeAllSessions: () =>
      request<void>(
        baseUrl,
        '/api/auth/sessions/revoke-all',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    authMethods: () =>
      request<AuthMethods>(
        baseUrl,
        '/api/auth/methods',
        undefined,
        fetcher,
      ).catch((error) => {
        if (error instanceof ApiError && [404, 501].includes(error.status))
          return defaultAuthMethods;
        throw error;
      }),
    authCapabilities: () =>
      request<AuthCapabilities>(
        baseUrl,
        '/api/auth/capabilities',
        undefined,
        fetcher,
      ).catch((error) => {
        if (error instanceof ApiError && [404, 501].includes(error.status))
          return { guestLogin: { available: false } };
        throw error;
      }),
    guestContinue: () =>
      request<AuthenticatedUser & { guest: true }>(
        baseUrl,
        '/api/auth/guest/continue',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    requestVerification: (input: {
      channel: 'EMAIL' | 'SMS';
      purpose: 'REGISTER' | 'LOGIN_CODE' | 'ADD_IDENTIFIER';
      destination: string;
    }) =>
      request<VerificationChallenge>(
        baseUrl,
        '/api/auth/verification/challenges',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    verifyVerification: (challengeId: string, code: string) =>
      request<VerificationGrant>(
        baseUrl,
        `/api/auth/verification/challenges/${encodeURIComponent(challengeId)}/verify`,
        { method: 'POST', body: JSON.stringify({ code }) },
        fetcher,
      ),
    registerVerified: (input: {
      grantId: string;
      identifierType: 'EMAIL' | 'PHONE';
      username: string;
      displayName: string;
      password: string;
    }) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/register/verified',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    loginPassword: (input: {
      identifierType: 'EMAIL' | 'PHONE';
      identifier: string;
      password: string;
    }) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/login/password',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    loginCode: (input: { grantId: string }) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/login/code',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    oauthStart: (provider: AuthProvider, returnTo = '/') =>
      request<{ authorizationUrl: string }>(
        baseUrl,
        `/api/auth/oauth/${provider}/start`,
        { method: 'POST', body: JSON.stringify({ returnTo }) },
        fetcher,
      ),
    completeSocialOnboarding: (input: {
      transactionId: string;
      username: string;
      displayName: string;
    }) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/oauth/onboarding',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    accountIdentifiers: () =>
      request<AccountIdentifier[]>(
        baseUrl,
        '/api/auth/account/identifiers',
        undefined,
        fetcher,
      ),
    connectedIdentities: () =>
      request<ConnectedIdentity[]>(
        baseUrl,
        '/api/auth/account/identities',
        undefined,
        fetcher,
      ),
    unlinkIdentity: (provider: AuthProvider) =>
      request<void>(
        baseUrl,
        `/api/auth/account/identities/${provider}`,
        { method: 'DELETE' },
        fetcher,
      ),
    problems: (offset = 0, limit = 20, options: { search?: string } = {}) => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      });
      if (options.search) params.set('search', options.search);
      return request<ProblemList>(
        baseUrl,
        `/api/problems?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
    home: () => request<Home>(baseUrl, '/api/home', undefined, fetcher),
    contests: (limit = 20) =>
      request<{ items: BackendContest[] }>(
        baseUrl,
        `/api/contests?limit=${encodeURIComponent(String(limit))}`,
        undefined,
        fetcher,
      ),
    contest: (id: string) =>
      request<BackendContest>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}`,
        undefined,
        fetcher,
      ),
    contestProblems: (id: string) =>
      request<{ items: ContestProblem[] }>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/problems`,
        undefined,
        fetcher,
      ),
    createContest: (input: {
      title: string;
      description?: string;
      startsAt: string;
      endsAt: string;
      visibility: 'PUBLIC' | 'PRIVATE';
      format?: 'ICPC' | 'IOI' | 'OI' | 'CUSTOM';
      registrationOpenAt?: string | null;
      registrationCloseAt?: string | null;
      privatePassword?: string;
    }) =>
      request<BackendContest>(
        baseUrl,
        '/api/contests',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    publishContest: (id: string) =>
      request<BackendContest>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/publish`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    setContestProblems: (
      id: string,
      problems: Array<{ problemId: string; score?: number }>,
    ) =>
      request<{ items: Array<{ problemId: string; score?: number }> }>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/problems`,
        { method: 'PUT', body: JSON.stringify({ problems }) },
        fetcher,
      ),
    registerContest: (id: string, accessCode?: string) =>
      request<{
        contestId: string;
        userId: string;
        status: string;
        registeredAt: string;
      }>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/register`,
        {
          method: 'POST',
          body: JSON.stringify(accessCode ? { accessCode } : {}),
        },
        fetcher,
      ),
    contestStandings: (id: string) =>
      request<
        | { available: true; items: unknown[] }
        | { available: false; reason: string }
      >(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/standings`,
        undefined,
        fetcher,
        [503],
      ),
    friends: () =>
      request<{ items: FriendSummary[] }>(
        baseUrl,
        '/api/friends',
        undefined,
        fetcher,
      ),
    searchUsers: (query: string) =>
      request<{ items: FriendSummary[] }>(
        baseUrl,
        `/api/users/search?q=${encodeURIComponent(query)}`,
        undefined,
        fetcher,
      ),
    sendFriendRequest: (targetUserId: string, note?: string) =>
      request<{ id: string; state: string }>(
        baseUrl,
        '/api/friend-requests',
        { method: 'POST', body: JSON.stringify({ targetUserId, note }) },
        fetcher,
      ),
    resolveFriendRequest: (id: string, action: 'accept' | 'reject') =>
      request<{ id: string; state: string }>(
        baseUrl,
        `/api/friend-requests/${encodeURIComponent(id)}/${action}`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    friendRequests: (direction: 'incoming' | 'outgoing') =>
      request<{ items: FriendRequest[] }>(
        baseUrl,
        `/api/friend-requests?direction=${direction}`,
        undefined,
        fetcher,
      ),
    conversations: () =>
      request<{ items: Array<ConversationSummaryApi> }>(
        baseUrl,
        '/api/conversations',
        undefined,
        fetcher,
      ),
    conversationMessages: (id: string, limit = 50) =>
      request<{ items: Message[]; nextCursor?: string }>(
        baseUrl,
        `/api/conversations/${encodeURIComponent(id)}/messages?limit=${limit}`,
        undefined,
        fetcher,
      ),
    createDirectConversation: (userId: string) =>
      request<{ id: string; kind: 'DIRECT' }>(
        baseUrl,
        '/api/conversations/direct',
        { method: 'POST', body: JSON.stringify({ userId }) },
        fetcher,
      ),
    sendMessage: (id: string, body: string, clientMessageId: string) =>
      request<Message>(
        baseUrl,
        `/api/conversations/${encodeURIComponent(id)}/messages`,
        { method: 'POST', body: JSON.stringify({ body, clientMessageId }) },
        fetcher,
      ),
    markConversationRead: (id: string, messageId?: string) =>
      request<void>(
        baseUrl,
        `/api/conversations/${encodeURIComponent(id)}/read`,
        {
          method: 'POST',
          body: JSON.stringify(messageId ? { messageId } : {}),
        },
        fetcher,
      ),
    unreadMessages: () =>
      request<{ count: number }>(
        baseUrl,
        '/api/messages/unread-count',
        undefined,
        fetcher,
      ),
    notifications: (limit = 50) =>
      request<{ items: NotificationSummary[]; nextCursor?: string }>(
        baseUrl,
        `/api/notifications?limit=${limit}`,
        undefined,
        fetcher,
      ),
    unreadNotifications: () =>
      request<{ count: number }>(
        baseUrl,
        '/api/notifications/unread-count',
        undefined,
        fetcher,
      ),
    markNotificationRead: (id: string) =>
      request<void>(
        baseUrl,
        `/api/notifications/${encodeURIComponent(id)}/read`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    markAllNotificationsRead: () =>
      request<void>(
        baseUrl,
        '/api/notifications/read-all',
        { method: 'POST', body: '{}' },
        fetcher,
      ),
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

type ConversationSummaryApi = {
  id: string;
  kind: 'DIRECT';
  peer: { id: string; username: string; displayName: string };
  lastMessageAt?: string;
  unreadCount: number;
};
