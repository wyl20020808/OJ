export type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
};
export type EditorCodeDraft = {
  userId?: string;
  problemId: string;
  language: string;
  source: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};
export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'active';
  guest?: boolean;
  upgradeHint?: string;
  capabilities?: {
    canViewJudgeAdmin?: boolean;
    canViewAnySubmission?: boolean;
  };
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
export type ProblemDifficulty = '入门' | '简单' | '中等' | '困难' | '专家';
export type ProblemSample = {
  ordinal: number;
  input: string;
  output: string;
  explanation?: string | null;
};
export type Problem = {
  id: string;
  publicNumber?: number;
  publicId?: string;
  slug: string;
  title: string;
  background?: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  examples: Example[];
  samples?: ProblemSample[];
  constraints: string;
  notes?: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  visibility: 'private' | 'public';
  status: 'draft' | 'published' | 'archived';
  testdataVersion: string | null;
  authorId: string | null;
  capabilities?: { canEdit: boolean; canDelete?: boolean };
  currentRevisionId?: string;
  difficulty?: ProblemDifficulty | null;
  tags?: string[];
  tagDetails?: Array<{
    id: number;
    slug: string;
    name: string;
    category: string;
    displayOrder: number;
    isActive: boolean;
  }>;
  source?: string;
  statistics?: {
    submissionCount: number;
    acceptedCount: number;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
};
export type ProblemJudgeDefaults = {
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
  checker: 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
  allowedLanguageProfiles: string[];
};
export type JudgeDraftTestcase = {
  testcaseId: string;
  ordinal: number;
  label: string | null;
  input: {
    objectId: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  expectedOutput: {
    objectId: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  timeLimitMsOverride: number | null;
  memoryLimitBytesOverride: number | null;
  outputLimitBytesOverride: number | null;
  effectiveTimeLimitMs: number;
  effectiveMemoryLimitBytes: number;
  effectiveOutputLimitBytes: number;
  createdAt: string;
  updatedAt: string;
};
export type JudgeDataVersionSummary = {
  versionId: string;
  problemId: string;
  versionNumber: number;
  manifestSha256: string;
  testcaseCount: number;
  checker: 'EXACT_BYTES' | 'TOKEN_WHITESPACE';
  createdAt: string;
  publishedAt: string;
  publishedBy: string;
};
export type JudgeDataVersion = JudgeDataVersionSummary & {
  testcases?: JudgeDraftTestcase[];
};
export type JudgeDraft = {
  problemId: string;
  defaults: ProblemJudgeDefaults;
  testcases: JudgeDraftTestcase[];
  validation: {
    state: 'VALID' | 'INVALID' | 'UNKNOWN';
    errors: string[];
    warnings: string[];
  };
  updatedAt: string;
};
type BackendJudgeDraft = Omit<JudgeDraft, 'validation'> & {
  status: 'DRAFT' | 'VALIDATED';
};
const normalizeJudgeDraft = (draft: BackendJudgeDraft): JudgeDraft => ({
  ...draft,
  validation: {
    state: draft.status === 'VALIDATED' ? 'VALID' : 'UNKNOWN',
    errors: [],
    warnings: [],
  },
});
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
export type ProfileCapability =
  { available: true } | { available: false; reason: string };
export type ProfileCapabilities = {
  contractVersion: string;
  favorites: ProfileCapability;
  myContests: ProfileCapability;
  myProblems: ProfileCapability;
  activity: ProfileCapability;
  heatmap: ProfileCapability;
  teams: ProfileCapability;
  homework: ProfileCapability;
  wrongbook: ProfileCapability;
};
export type PublicProfile = {
  username: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
  organization?: string;
  website?: string;
  github?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  createdAt: string;
  capabilities: ProfileCapabilities;
  isSelf: boolean;
  canCreateProblems: boolean;
  teams: ProfileTeam[];
};
export type EditableProfile = {
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  organization: string;
  website: string;
  github: string;
  avatarUrl?: string;
  backgroundUrl?: string;
};
export type ProfileTeam = {
  name: string;
  slug: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER';
  visibility: 'PUBLIC' | 'PRIVATE';
  description?: string;
};
export type ProfileActivity = {
  timezone: 'UTC';
  days: Array<{ date: string; submissionCount: number; acceptedCount: number }>;
};
export type ProfileOverview = {
  createdProblemCount: number;
  solvedProblemCount: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  favoriteCount?: number;
  teamCount?: number;
};
export type SolvedProblem = {
  problemId: string;
  slug: string;
  title: string;
  lastAcceptedAt: string;
};
export type SolvedProblemList = {
  items: SolvedProblem[];
  page: { limit: number; total: number; nextCursor?: string };
};
export type FavoriteProblem = {
  problemId: string;
  slug: string;
  title: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
  favoritedAt: string;
};
export type FavoriteList = {
  items: FavoriteProblem[];
  page: { limit: number; total: number; nextCursor?: string };
};
export type ProfileContestRelationship = 'CREATED' | 'MANAGED' | 'REGISTERED';
export type ProfileContest = {
  id: string;
  title: string;
  visibility: BackendContest['visibility'];
  lifecycle: BackendContest['lifecycle'];
  startsAt: string;
  endsAt: string;
  relationship: ProfileContestRelationship;
  relationshipAt: string;
};
export type ProfileContestList = {
  items: ProfileContest[];
  page: { limit: number; nextCursor?: string };
};
export type ProfileProblem = {
  id: string;
  publicNumber?: number;
  publicId?: string;
  slug: string;
  title: string;
  status: Problem['status'];
  visibility: Problem['visibility'];
  createdAt: string;
  updatedAt: string;
};
export type ProfileProblemList = {
  items: ProfileProblem[];
  page: { limit: number; total: number; nextCursor?: string };
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
export type SubmissionEvaluation = {
  publicNumber?: number;
  evaluationGeneration: number;
  attemptGeneration: number;
  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED_WITH_VERDICT'
    | 'CANCELLED'
    | 'INFRA_FAILED'
    | 'NO_VERDICT'
    | 'INCOMPLETE'
    | 'REJUDGE_PENDING'
    | 'REJUDGING';
  verdict?: 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
  completedAt?: string;
  current: boolean;
};
export type SubmissionTestcaseResult = {
  ordinal: number;
  status?:
    | 'WAITING'
    | 'RUNNING'
    | 'PASS'
    | 'AC'
    | 'WA'
    | 'CE'
    | 'RE'
    | 'TLE'
    | 'MLE'
    | 'CANCELLED'
    | 'SKIPPED';
  verdict?: 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
  timeMs?: number;
  memoryBytes?: number;
  runtimeReason?: string;
  exitCode?: number;
};
export type SubmissionCompileDetail = {
  status: 'FAILED';
  durationMs?: number;
  diagnostics?: string;
  truncated: boolean;
};
export type SubmissionEvaluationDetail = {
  testcaseCount: number;
  completedTestcaseCount: number;
  totalTimeMs?: number;
  peakMemoryBytes?: number;
  compile?: SubmissionCompileDetail;
  testcases: SubmissionTestcaseResult[];
};
export type SubmissionEvaluationDetailResponse = {
  submission: Pick<Submission, 'id' | 'languageId' | 'createdAt'>;
  evaluation: SubmissionEvaluation & { detail?: SubmissionEvaluationDetail };
};
export type Submission = {
  id: string;
  ownerUserId: string;
  problemId: string;
  problemRevisionId: string;
  testdataVersionRef: string | null;
  judgeDataVersionId?: string;
  judgeDataVersionNumber?: number;
  judgeDataManifestSha256?: string;
  languageId: string;
  source?: string;
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
  evaluation?: SubmissionEvaluation;
};
export type SubmissionSource = {
  submissionId: string;
  languageId: string;
  source: string;
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
export type EvaluationListItem = {
  submissionId: string;
  publicNumber?: number;
  problem: { id: string; slug: string; title: string; publicId?: string };
  submitter: { id: string; displayName: string };
  languageProfileId: string;
  status: string;
  verdict?: string;
  createdAt: string;
  completedAt?: string;
  totalTimeMs?: number;
  peakMemoryBytes?: number;
};
export type EvaluationList = {
  items: EvaluationListItem[];
  nextCursor: string | null;
};
export type EvaluationFilters = {
  verdict?: string;
  status?: string;
  problemId?: string;
  submitterId?: string;
};
export type ProblemInput = Omit<
  Problem,
  | 'id'
  | 'publicNumber'
  | 'publicId'
  | 'createdAt'
  | 'updatedAt'
  | 'authorId'
  | 'testdataVersion'
  | 'capabilities'
  | 'examples'
> & {
  testdataVersion?: string | null;
  examples?: Example[];
  tagIds?: number[];
};
import type {
  ContestProblem,
  FriendRequest,
  FriendSummary,
  Message,
  NotificationSummary,
} from './portal-contracts.js';
const MAX_JUDGE_DATA_PAYLOAD_BYTES = 100 * 1024 * 1024;
const MAX_JUDGE_DATA_ARCHIVE_BYTES = 256 * 1024 * 1024;
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
  const headers = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!(init?.body instanceof FormData) && !headers['content-type'])
    headers['content-type'] = 'application/json';
  if (
    init?.method &&
    !['GET', 'HEAD'].includes(init.method.toUpperCase()) &&
    typeof document !== 'undefined'
  ) {
    const csrf = document.cookie
      .split('; ')
      .find((value) => value.startsWith('oj_csrf='))
      ?.slice('oj_csrf='.length);
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
  }
  const response = await fetcher(`${baseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers,
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
export type TeamSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  joinPolicy: 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  role?: 'OWNER' | 'MANAGER' | 'MEMBER';
  memberCount?: number;
};
export type TeamMember = {
  teamId: string;
  userId: string;
  username: string;
  displayName: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER';
  joinedAt: string;
};
export type TeamJoinRequest = {
  id: string;
  teamId: string;
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  message: string | null;
  createdAt: string;
};
export type AssignmentProblem = {
  publicId: string;
  title: string;
  problemId: string;
  displayOrder: number;
  completed: boolean;
};
export type Assignment = {
  id: string;
  publicId: string;
  team: { slug: string; name: string };
  title: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  startsAt: string | null;
  dueAt: string | null;
  problemCount: number;
  completedCount: number;
  capabilities: {
    canView: boolean;
    canEdit: boolean;
    canPublish: boolean;
    canClose: boolean;
  };
  problems: AssignmentProblem[];
};
export type DiscussionPost = {
  id: string;
  publicId: string;
  type: 'ARTICLE' | 'ANNOUNCEMENT';
  status: 'DRAFT' | 'PUBLISHED' | 'DELETED';
  title: string;
  summary: string | null;
  contentMarkdown: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  author?: DiscussionAuthor;
  capabilities?: DiscussionViewerCapabilities;
};
export type DiscussionAuthor = {
  username: string;
  displayName: string;
  avatarUrl?: string;
};
export type DiscussionViewerCapabilities = {
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
};
export type DiscussionComment = {
  id: string;
  postId: string;
  contentMarkdown: string;
  status: 'VISIBLE' | 'DELETED';
  createdAt: string;
  updatedAt: string;
  parentCommentId?: string | null;
  likeCount?: number;
  viewerLiked?: boolean;
  author?: DiscussionAuthor;
  replyTarget?: DiscussionAuthor;
  capabilities?: DiscussionViewerCapabilities;
};
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
    discussionPosts: (query = '') =>
      request<{ items: DiscussionPost[]; nextCursor?: string }>(
        baseUrl,
        `/api/discussion/posts${query ? `?${query}` : ''}`,
        undefined,
        fetcher,
      ),
    discussionPost: (id: string) =>
      request<DiscussionPost>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}`,
        undefined,
        fetcher,
      ),
    createDiscussionPost: (input: {
      title: string;
      summary?: string;
      contentMarkdown: string;
      type?: 'ARTICLE' | 'ANNOUNCEMENT';
      status?: 'DRAFT' | 'PUBLISHED';
    }) =>
      request<DiscussionPost>(
        baseUrl,
        '/api/discussion/posts',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    updateDiscussionPost: (
      id: string,
      input: Partial<
        Pick<DiscussionPost, 'title' | 'summary' | 'contentMarkdown' | 'type'>
      >,
    ) =>
      request<DiscussionPost>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        fetcher,
      ),
    publishDiscussionPost: (id: string) =>
      request<DiscussionPost>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}/publish`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    deleteDiscussionPost: (id: string) =>
      request<DiscussionPost>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}`,
        { method: 'DELETE', body: '{}' },
        fetcher,
      ),
    discussionComments: (id: string, query = '') =>
      request<{ items: DiscussionComment[]; nextCursor?: string }>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}/comments${query ? `?${query}` : ''}`,
        undefined,
        fetcher,
      ),
    createDiscussionComment: (
      id: string,
      contentMarkdown: string,
      parentCommentId?: string | null,
    ) =>
      request<DiscussionComment>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ contentMarkdown, parentCommentId }),
        },
        fetcher,
      ),
    updateDiscussionComment: (id: string, contentMarkdown: string) =>
      request<DiscussionComment>(
        baseUrl,
        `/api/discussion/comments/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify({ contentMarkdown }) },
        fetcher,
      ),
    deleteDiscussionComment: (id: string) =>
      request<DiscussionComment>(
        baseUrl,
        `/api/discussion/comments/${encodeURIComponent(id)}`,
        { method: 'DELETE', body: '{}' },
        fetcher,
      ),
    likeDiscussionComment: (id: string) =>
      request<{ liked: boolean; likeCount: number }>(
        baseUrl,
        `/api/discussion/comments/${encodeURIComponent(id)}/likes`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    unlikeDiscussionComment: (id: string) =>
      request<{ liked: boolean; likeCount: number }>(
        baseUrl,
        `/api/discussion/comments/${encodeURIComponent(id)}/likes`,
        { method: 'DELETE', body: '{}' },
        fetcher,
      ),
    likeDiscussionPost: (id: string) =>
      request<{ liked: boolean }>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}/likes`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    unlikeDiscussionPost: (id: string) =>
      request<void>(
        baseUrl,
        `/api/discussion/posts/${encodeURIComponent(id)}/likes`,
        { method: 'DELETE', body: '{}' },
        fetcher,
      ),
    me: () =>
      request<AuthenticatedUser>(baseUrl, '/api/auth/me', undefined, fetcher),
    judgeAdminCapabilities: () =>
      request<{ canView: boolean }>(
        baseUrl,
        '/api/admin/judge/capabilities',
        undefined,
        fetcher,
      ),
    login: (identity: string, password: string, rememberMe = false) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identity, password, rememberMe }),
        },
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
    teams: (limit = 20, cursor?: string) =>
      request<{ items: TeamSummary[]; nextCursor?: string }>(
        baseUrl,
        `/api/teams?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        fetcher,
      ),
    myTeams: (limit = 20, cursor?: string) =>
      request<{ items: TeamSummary[]; nextCursor?: string }>(
        baseUrl,
        `/api/teams/mine?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        fetcher,
      ),
    team: (slug: string) =>
      request<TeamSummary & { membershipState: string; joinRequestStatus: TeamJoinRequest['status'] | null }>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}`,
        undefined,
        fetcher,
      ),
    teamJoinRequests: (slug: string) =>
      request<{ items: TeamJoinRequest[] }>(baseUrl, `/api/teams/${encodeURIComponent(slug)}/join-requests`, undefined, fetcher),
    approveJoinRequest: (slug: string, id: string) =>
      request<TeamJoinRequest>(baseUrl, `/api/teams/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }, fetcher),
    rejectJoinRequest: (slug: string, id: string) =>
      request<TeamJoinRequest>(baseUrl, `/api/teams/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(id)}/reject`, { method: 'POST', body: '{}' }, fetcher),
    createTeam: (input: {
      name: string;
      slug?: string;
      description?: string;
      visibility: 'PUBLIC' | 'PRIVATE';
      joinPolicy: 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
    }) =>
      request<TeamSummary>(
        baseUrl,
        '/api/teams',
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    joinTeam: (slug: string) =>
      request<unknown>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}/join`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    leaveTeam: (slug: string) =>
      request<unknown>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}/leave`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    teamMembers: (slug: string, limit = 50, cursor?: string) =>
      request<{ items: TeamMember[]; nextCursor?: string }>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}/members?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        fetcher,
      ),
    teamAssignments: (slug: string) =>
      request<{ items: Assignment[] }>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}/assignments`,
        undefined,
        fetcher,
      ),
    myAssignments: () =>
      request<{ items: Assignment[] }>(
        baseUrl,
        '/api/assignments/mine',
        undefined,
        fetcher,
      ),
    assignment: (publicId: string) =>
      request<Assignment>(
        baseUrl,
        `/api/assignments/${encodeURIComponent(publicId)}`,
        undefined,
        fetcher,
      ),
    createAssignment: (
      slug: string,
      input: {
        title: string;
        description?: string;
        startsAt?: string | null;
        dueAt?: string | null;
        problemIds: string[];
        status?: 'DRAFT' | 'PUBLISHED';
      },
    ) =>
      request<Assignment>(
        baseUrl,
        `/api/teams/${encodeURIComponent(slug)}/assignments`,
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    updateAssignment: (
      publicId: string,
      input: Partial<{
        title: string;
        description: string;
        startsAt: string | null;
        dueAt: string | null;
        problemIds: string[];
      }>,
    ) =>
      request<Assignment>(
        baseUrl,
        `/api/assignments/${encodeURIComponent(publicId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        fetcher,
      ),
    publishAssignment: (publicId: string) =>
      request<Assignment>(
        baseUrl,
        `/api/assignments/${encodeURIComponent(publicId)}/publish`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    closeAssignment: (publicId: string) =>
      request<Assignment>(
        baseUrl,
        `/api/assignments/${encodeURIComponent(publicId)}/close`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
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
      rememberMe?: boolean;
    }) =>
      request<AuthenticatedUser>(
        baseUrl,
        '/api/auth/login/password',
        {
          method: 'POST',
          body: JSON.stringify(
            input.rememberMe === undefined
              ? {
                  identifierType: input.identifierType,
                  identifier: input.identifier,
                  password: input.password,
                }
              : input,
          ),
        },
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
    profileCapabilities: () =>
      request<ProfileCapabilities>(
        baseUrl,
        '/api/profile/capabilities',
        undefined,
        fetcher,
      ),
    publicProfile: (username: string) =>
      request<PublicProfile>(
        baseUrl,
        `/api/profiles/${encodeURIComponent(username)}`,
        undefined,
        fetcher,
      ),
    editableProfile: () =>
      request<EditableProfile>(baseUrl, '/api/profile/me', undefined, fetcher),
    updateProfile: (profile: Omit<EditableProfile, 'username' | 'avatarUrl' | 'backgroundUrl'>) =>
      request<EditableProfile>(
        baseUrl,
        '/api/profile/me',
        { method: 'PATCH', body: JSON.stringify(profile) },
        fetcher,
      ),
    uploadProfileMedia: (kind: 'avatar' | 'background', file: File) => {
      const form = new FormData(); form.append('file', file);
      return request<{ url: string }>(baseUrl, `/api/profile/me/${kind}`, { method: 'POST', body: form }, fetcher);
    },
    removeProfileMedia: (kind: 'avatar' | 'background') =>
      request<void>(baseUrl, `/api/profile/me/${kind}`, { method: 'DELETE' }, fetcher),
    profileActivity: (username: string) =>
      request<ProfileActivity>(
        baseUrl,
        `/api/profiles/${encodeURIComponent(username)}/activity`,
        undefined,
        fetcher,
      ),
    profileOverview: (username: string) =>
      request<ProfileOverview>(
        baseUrl,
        `/api/profiles/${encodeURIComponent(username)}/overview`,
        undefined,
        fetcher,
      ),
    profileSolved: (username: string, limit = 20, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request<SolvedProblemList>(
        baseUrl,
        `/api/profiles/${encodeURIComponent(username)}/solved?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
    profileProblemsFor: (username: string, limit = 20, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request<ProfileProblemList>(
        baseUrl,
        `/api/profiles/${encodeURIComponent(username)}/problems?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
    profileFavorites: (limit = 20, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request<FavoriteList>(
        baseUrl,
        `/api/profile/favorites?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
    addFavorite: (problemId: string) =>
      request<{ problemId: string; favorited: true; createdAt?: string }>(
        baseUrl,
        `/api/profile/favorites/${encodeURIComponent(problemId)}`,
        { method: 'POST', body: '{}' },
        fetcher,
      ),
    removeFavorite: (problemId: string) =>
      request<void>(
        baseUrl,
        `/api/profile/favorites/${encodeURIComponent(problemId)}`,
        { method: 'DELETE' },
        fetcher,
      ),
    profileContests: (
      kind?: ProfileContestRelationship,
      limit = 20,
      cursor?: string,
    ) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (kind) params.set('kind', kind);
      if (cursor) params.set('cursor', cursor);
      return request<ProfileContestList>(
        baseUrl,
        `/api/profile/contests?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
    profileProblems: (limit = 20, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request<ProfileProblemList>(
        baseUrl,
        `/api/profile/problems?${params.toString()}`,
        undefined,
        fetcher,
      );
    },
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
      request<{
        items: Array<
          ContestProblem & {
            ordinal?: number;
            pointsConfig?: { score?: number } | null;
          }
        >;
      }>(
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
    updateContest: (id: string, input: Record<string, unknown>) =>
      request<BackendContest>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
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
    unregisterContest: (id: string) =>
      request<void>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/register`,
        { method: 'DELETE' },
        fetcher,
      ),
    contestRegistration: (id: string) =>
      request<{
        status: string;
        contestId?: string;
        userId?: string;
        registeredAt?: string;
      }>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/registration`,
        undefined,
        fetcher,
      ),
    contestParticipants: (id: string) =>
      request<{
        items: Array<{
          id: string;
          username?: string;
          displayName?: string;
          registeredAt?: string;
        }>;
      }>(
        baseUrl,
        `/api/contests/${encodeURIComponent(id)}/participants`,
        undefined,
        fetcher,
      ),
    contestHomeSummary: () =>
      request<{
        running: BackendContest[];
        upcoming: BackendContest[];
        recentEnded: BackendContest[];
      }>(baseUrl, '/api/contests/home-summary', undefined, fetcher),
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
      request<{ id: string; state: FriendRequest['state'] }>(
        baseUrl,
        '/api/friend-requests',
        { method: 'POST', body: JSON.stringify({ targetUserId, note }) },
        fetcher,
      ),
    resolveFriendRequest: (id: string, action: 'accept' | 'reject') =>
      request<{ id: string; state: FriendRequest['state'] }>(
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
    cancelFriendRequest: (id: string) =>
      request<void>(
        baseUrl,
        `/api/friend-requests/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        fetcher,
      ),
    removeFriend: (userId: string) =>
      request<void>(
        baseUrl,
        `/api/friends/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
        fetcher,
      ),
    conversations: () =>
      request<{ items: Array<ConversationSummaryApi> }>(
        baseUrl,
        '/api/conversations',
        undefined,
        fetcher,
      ),
    conversationMessages: (id: string, limit = 50, cursor?: string) =>
      request<{ items: Message[]; nextCursor?: string }>(
        baseUrl,
        `/api/conversations/${encodeURIComponent(id)}/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
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
    tags: () =>
      request<NonNullable<Problem['tagDetails']>>(
        baseUrl,
        '/api/tags',
        undefined,
        fetcher,
      ),
    editorDraft: (problemId: string, language: string) =>
      request<EditorCodeDraft | null>(
        baseUrl,
        `/api/editor/drafts/${encodeURIComponent(problemId)}/${encodeURIComponent(language)}`,
        undefined,
        fetcher,
      ),
    saveEditorDraft: (
      problemId: string,
      language: string,
      source: string,
      version?: number | null,
    ) =>
      request<EditorCodeDraft>(
        baseUrl,
        `/api/editor/drafts/${encodeURIComponent(problemId)}/${encodeURIComponent(language)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ source, version: version ?? null }),
        },
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
    deleteProblem: (
      idOrSlug: string,
      reason: string,
      expectedUpdatedAt: string,
    ) =>
      request<Problem>(
        baseUrl,
        `/api/problems/${encodeURIComponent(idOrSlug)}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ reason, expectedUpdatedAt }),
        },
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
    judgeData: async (problemId: string) =>
      normalizeJudgeDraft(
        await request<BackendJudgeDraft>(
          baseUrl,
          `/api/problems/${encodeURIComponent(problemId)}/judge-data`,
          undefined,
          fetcher,
        ),
      ),
    judgeDraft: async (problemId: string) => {
      const draft = await request<BackendJudgeDraft | null>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft`,
        undefined,
        fetcher,
      );
      return draft ? normalizeJudgeDraft(draft) : null;
    },
    createJudgeDraftFromLatest: async (problemId: string) =>
      normalizeJudgeDraft(
        await request<BackendJudgeDraft>(
          baseUrl,
          `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/from-latest`,
          { method: 'POST', body: '{}' },
          fetcher,
        ),
      ),
    judgeVersions: (problemId: string) =>
      request<JudgeDataVersionSummary[]>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/versions`,
        undefined,
        fetcher,
      ),
    judgeVersion: (problemId: string, versionId: string) =>
      request<JudgeDataVersion>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/versions/${encodeURIComponent(versionId)}`,
        undefined,
        fetcher,
      ),
    judgeTestcase: (problemId: string, testcaseId: string) =>
      request<JudgeDraftTestcase>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/testcases/${encodeURIComponent(testcaseId)}`,
        undefined,
        fetcher,
      ),
    saveJudgeConfig: async (problemId: string, config: ProblemJudgeDefaults) =>
      normalizeJudgeDraft(
        await request<BackendJudgeDraft>(
          baseUrl,
          `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/config`,
          { method: 'PUT', body: JSON.stringify(config) },
          fetcher,
        ),
      ),
    addJudgeTestcase: (problemId: string, input: Record<string, unknown>) =>
      request<JudgeDraft>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/testcases`,
        { method: 'POST', body: JSON.stringify(input) },
        fetcher,
      ),
    updateJudgeTestcase: (
      problemId: string,
      testcaseId: string,
      input: Record<string, unknown>,
    ) =>
      request<JudgeDraft>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/testcases/${encodeURIComponent(testcaseId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        fetcher,
      ),
    deleteJudgeTestcase: (problemId: string, testcaseId: string) =>
      request<void>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/testcases/${encodeURIComponent(testcaseId)}`,
        { method: 'DELETE' },
        fetcher,
      ),
    uploadJudgeData: async (
      problemId: string,
      file: File | File[],
      zip = false,
    ) => {
      const files = Array.isArray(file) ? file : [file];
      const encode = async (item: File) => {
        const limit = zip
          ? MAX_JUDGE_DATA_ARCHIVE_BYTES
          : MAX_JUDGE_DATA_PAYLOAD_BYTES;
        if (item.size > limit)
          throw new Error(
            `Judge Data file exceeds ${Math.floor(limit / (1024 * 1024))} MiB limit`,
          );
        const bytes = new Uint8Array(await item.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        return btoa(binary);
      };
      const body = zip
        ? files.length === 1
          ? { zipBase64: await encode(files[0]!) }
          : (() => {
              throw new Error('Select exactly one ZIP file');
            })()
        : (() => {
            const input = files.find((item) => /\.in$/i.test(item.name));
            const output = files.find((item) =>
              /\.(?:out|ans|txt)$/i.test(item.name),
            );
            const inputStem = input?.name.replace(/\.in$/i, '').toLowerCase();
            const outputStem = output?.name
              .replace(/\.(?:out|ans|txt)$/i, '')
              .toLowerCase();
            if (
              !input ||
              !output ||
              files.length !== 2 ||
              inputStem !== outputStem
            )
              throw new Error(
                'Select matching .in and .out, .ans, or .txt files',
              );
            return Promise.all([encode(input), encode(output)]).then(
              ([inputBase64, outputBase64]) => ({
                inputBase64,
                outputBase64,
                inputFileName: input.name,
                outputFileName: output.name,
              }),
            );
          })();
      const payload = await body;
      const transport = zip
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/zip' },
            body: files[0]!,
          }
        : { method: 'POST', body: JSON.stringify(payload) };
      const response = await request<
        BackendJudgeDraft | { draft: BackendJudgeDraft }
      >(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/${zip ? 'upload-zip' : 'upload'}`,
        transport,
        fetcher,
      );
      return normalizeJudgeDraft(
        'draft' in response ? response.draft : response,
      );
    },
    validateJudgeData: async (problemId: string) =>
      normalizeJudgeDraft(
        await request<BackendJudgeDraft>(
          baseUrl,
          `/api/problems/${encodeURIComponent(problemId)}/judge-data/draft/validate`,
          { method: 'POST', body: '{}' },
          fetcher,
        ),
      ).validation,
    publishJudgeData: (problemId: string) =>
      request<JudgeDataVersionSummary>(
        baseUrl,
        `/api/problems/${encodeURIComponent(problemId)}/judge-data/publish`,
        { method: 'POST', body: '{}' },
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
    evaluations: (
      cursor?: string,
      limit = 20,
      filters: EvaluationFilters = {},
    ) =>
      request<EvaluationList>(
        baseUrl,
        `/api/evaluations?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${filters.verdict ? `&verdict=${encodeURIComponent(filters.verdict)}` : ''}${filters.status ? `&status=${encodeURIComponent(filters.status)}` : ''}${filters.problemId ? `&problemId=${encodeURIComponent(filters.problemId)}` : ''}${filters.submitterId ? `&submitterId=${encodeURIComponent(filters.submitterId)}` : ''}`,
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
    submissionSource: (id: string) =>
      request<SubmissionSource>(
        baseUrl,
        `/api/submissions/${encodeURIComponent(id)}/source`,
        undefined,
        fetcher,
      ),
    submissionEvaluations: (id: string) =>
      request<{ items: SubmissionEvaluation[] }>(
        baseUrl,
        `/api/submissions/${encodeURIComponent(id)}/evaluations`,
        undefined,
        fetcher,
      ),
    submissionEvaluation: (id: string, generation: number) =>
      request<SubmissionEvaluationDetailResponse>(
        baseUrl,
        `/api/submissions/${encodeURIComponent(id)}/evaluations/${encodeURIComponent(String(generation))}`,
        undefined,
        fetcher,
      ),
    submissionEvaluationStreamUrl: (id: string, generation: number) =>
      `${baseUrl}/api/submissions/${encodeURIComponent(id)}/evaluations/${encodeURIComponent(String(generation))}/stream`,
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
